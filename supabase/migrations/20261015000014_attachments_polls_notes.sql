-- Replies to a message, files and polls in chats and posts, and uploaded knowledge (images, PDFs, Markdown notes).
--
-- Files live in the private storage bucket "files" under "<auth user id>/<random>.<ext>". Reading goes through
-- the database: a person may read a file when they may read the message, post or shared item it belongs to
-- (storage policy -> app.can_read_file). The app hands out short-lived signed links after that check.

-- ───────────────────── replies to a message ─────────────────────
alter table public.messages add column if not exists reply_to_id uuid references public.messages(id) on delete set null;
create index if not exists messages_reply_idx on public.messages (reply_to_id) where reply_to_id is not null;

create or replace function app.trg_message_reply() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.reply_to_id is not null and not exists (
       select 1 from public.messages m where m.id = new.reply_to_id and m.conversation_id = new.conversation_id) then
    raise exception 'invalid' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists before_message_reply on public.messages;
create trigger before_message_reply before insert on public.messages for each row execute function app.trg_message_reply();

-- A message or post may consist of a file or a poll alone, so the text can be empty. Something must be there, though.
alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages add constraint messages_body_len check (char_length(body) <= 5000);
alter table public.posts drop constraint if exists posts_body_check;
alter table public.posts add constraint posts_body_len check (char_length(body) <= 5000);

-- ───────────────────── attachments ─────────────────────
create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  message_id uuid references public.messages(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  resource_id uuid references public.resources(id) on delete cascade,
  path text not null unique check (path ~ '^[0-9a-f-]{36}/[0-9a-f]{32}\.[a-z0-9]{2,4}$'),
  name text not null check (char_length(name) between 1 and 160),
  mime text not null,
  size_bytes int not null check (size_bytes between 1 and 10485760),
  created_at timestamptz not null default now(),
  check (num_nonnulls(message_id, post_id, resource_id) = 1)
);
create index on public.attachments (message_id) where message_id is not null;
create index on public.attachments (post_id) where post_id is not null;
create index on public.attachments (resource_id) where resource_id is not null;

create table public.polls (
  id uuid primary key default gen_random_uuid(),
  message_id uuid unique references public.messages(id) on delete cascade,
  post_id uuid unique references public.posts(id) on delete cascade,
  question text not null check (char_length(question) between 1 and 200),
  multiple boolean not null default false,
  closes_at timestamptz,
  created_at timestamptz not null default now(),
  check (num_nonnulls(message_id, post_id) = 1)
);
create table public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  position smallint not null,
  label text not null check (char_length(label) between 1 and 100),
  unique (poll_id, position)
);
create table public.poll_votes (
  poll_id uuid not null references public.polls(id) on delete cascade,
  option_id uuid not null references public.poll_options(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (option_id, profile_id)
);
create index on public.poll_votes (poll_id, profile_id);

-- Whoever may read the parent may read what hangs on it.
create or replace function app.can_read_attachment(p_message uuid, p_post uuid, p_resource uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when p_message is not null then exists (
      select 1 from public.messages m where m.id = p_message and app.is_participant(m.conversation_id))
    when p_post is not null then exists (
      select 1 from public.posts p where p.id = p_post
        and (p.hidden_at is null or p.author_id = app.uid()) and (p.group_id is null or app.can_read_group(p.group_id)))
    when p_resource is not null then exists (
      select 1 from public.resources r where r.id = p_resource
        and (r.hidden_at is null or r.owner_id = app.uid()) and (r.group_id is null or app.can_read_group(r.group_id)))
    else false end
$$;

create or replace function app.can_read_file(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.attachments a where a.path = p_path
                 and app.can_read_attachment(a.message_id, a.post_id, a.resource_id))
$$;

create or replace function app.can_read_poll(p_poll uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.polls p where p.id = p_poll and app.can_read_attachment(p.message_id, p.post_id, null))
$$;

alter table public.attachments enable row level security;
alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;
create policy read on public.attachments for select using (app.can_read_attachment(message_id, post_id, resource_id));
create policy read on public.polls for select using (app.can_read_attachment(message_id, post_id, null));
create policy read on public.poll_options for select using (app.can_read_poll(poll_id));
create policy own on public.poll_votes for select to authenticated using (profile_id = app.uid());
grant select on public.attachments, public.polls, public.poll_options to anon, authenticated;
grant select on public.poll_votes to authenticated;
grant execute on function app.can_read_attachment(uuid, uuid, uuid), app.can_read_file(text), app.can_read_poll(uuid) to anon, authenticated;

-- Content check: a message or post is never completely empty.
create or replace function app.trg_require_content() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if char_length(btrim(new.body)) > 0 then return null; end if;
  if tg_table_name = 'messages' and (
       exists (select 1 from public.attachments where message_id = new.id) or exists (select 1 from public.polls where message_id = new.id)) then return null; end if;
  if tg_table_name = 'posts' and (
       exists (select 1 from public.attachments where post_id = new.id) or exists (select 1 from public.polls where post_id = new.id)) then return null; end if;
  raise exception 'invalid' using errcode = '23514';
end $$;
create constraint trigger require_content after insert on public.messages
  deferrable initially deferred for each row execute function app.trg_require_content();
create constraint trigger require_content after insert on public.posts
  deferrable initially deferred for each row execute function app.trg_require_content();

-- ───────────────────── storage: private bucket "files" ─────────────────────
do $storage$
begin
  if to_regclass('storage.buckets') is not null and to_regclass('storage.objects') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('files', 'files', false, 10485760, array[
      'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'text/markdown', 'text/plain', 'text/csv',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.spreadsheet',
      'application/vnd.oasis.opendocument.presentation'])
    on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

    drop policy if exists hv_files_insert on storage.objects;
    drop policy if exists hv_files_select on storage.objects;
    drop policy if exists hv_files_delete on storage.objects;
    create policy hv_files_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
    create policy hv_files_select on storage.objects for select to anon, authenticated
      using (bucket_id = 'files' and ((storage.foldername(name))[1] = auth.uid()::text or app.can_read_file(name)));
    create policy hv_files_delete on storage.objects for delete to authenticated
      using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text
             and not exists (select 1 from public.attachments a where a.path = name));
  end if;
end $storage$;

-- ───────────────────── adding files and a poll to what I just wrote ─────────────────────
-- p_files: [{path, name, mime, size}] uploaded earlier into my own folder of the bucket.
-- p_poll: {question, options: [text, ...], multiple}.
create or replace function app.add_extras(p_kind text, p_parent uuid, p_files jsonb, p_poll jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := app.uid(); my_auth text; f jsonb; sz int; mt text; found_obj boolean; n int := 0; i int := 0; opt text; pid uuid;
  allowed text[] := array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'text/markdown', 'text/plain', 'text/csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.spreadsheet',
    'application/vnd.oasis.opendocument.presentation'];
  mid uuid; pst uuid; rsc uuid; max_files int := case when p_kind = 'resource' then 1 else 6 end;
begin
  if me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select auth_user_id::text into my_auth from public.profiles where id = me;
  if p_kind = 'message' then
    if not exists (select 1 from public.messages where id = p_parent and sender_id = me) then raise exception 'forbidden' using errcode = '42501'; end if;
    mid := p_parent;
  elsif p_kind = 'post' then
    if not exists (select 1 from public.posts where id = p_parent and author_id = me) then raise exception 'forbidden' using errcode = '42501'; end if;
    pst := p_parent;
  elsif p_kind = 'resource' then
    if not exists (select 1 from public.resources where id = p_parent and owner_id = me) then raise exception 'forbidden' using errcode = '42501'; end if;
    rsc := p_parent;
  else raise exception 'invalid' using errcode = '23514'; end if;

  if p_files is not null and jsonb_typeof(p_files) = 'array' then
    for f in select * from jsonb_array_elements(p_files) loop
      n := n + 1;
      if n > max_files then raise exception 'invalid' using errcode = '23514'; end if;
      if (f ->> 'path') !~ '^[0-9a-f-]{36}/[0-9a-f]{32}\.[a-z0-9]{2,4}$' or split_part(f ->> 'path', '/', 1) <> my_auth then
        raise exception 'invalid' using errcode = '23514';
      end if;
      sz := coalesce((f ->> 'size')::int, 0);
      mt := f ->> 'mime';
      if to_regclass('storage.objects') is not null then
        -- Trust what the store recorded, not what the browser claimed.
        execute 'select true, coalesce((metadata ->> ''size'')::int, 0), metadata ->> ''mimetype'' from storage.objects where bucket_id = ''files'' and name = $1'
          into found_obj, sz, mt using f ->> 'path';
        if not coalesce(found_obj, false) then raise exception 'invalid' using errcode = '23514'; end if;
      end if;
      if mt is null or not (mt = any (allowed)) or sz < 1 or sz > 10485760 then raise exception 'invalid' using errcode = '23514'; end if;
      insert into public.attachments (owner_id, message_id, post_id, resource_id, path, name, mime, size_bytes)
      values (me, mid, pst, rsc, f ->> 'path', regexp_replace(left(btrim(coalesce(f ->> 'name', 'Datei')), 160), '[\\/]', '_', 'g'), mt, sz);
    end loop;
  end if;

  if p_poll is not null and jsonb_typeof(p_poll) = 'object' and p_kind in ('message', 'post') then
    if char_length(btrim(coalesce(p_poll ->> 'question', ''))) < 1 then raise exception 'invalid' using errcode = '23514'; end if;
    if jsonb_array_length(coalesce(p_poll -> 'options', '[]'::jsonb)) not between 2 and 8 then raise exception 'invalid' using errcode = '23514'; end if;
    insert into public.polls (message_id, post_id, question, multiple)
    values (mid, pst, left(btrim(p_poll ->> 'question'), 200), coalesce((p_poll ->> 'multiple')::boolean, false)) returning id into pid;
    for opt in select btrim(jsonb_array_elements_text(p_poll -> 'options')) loop
      if char_length(opt) < 1 then raise exception 'invalid' using errcode = '23514'; end if;
      insert into public.poll_options (poll_id, position, label) values (pid, i, left(opt, 100));
      i := i + 1;
    end loop;
  end if;
end $$;
grant execute on function app.add_extras(text, uuid, jsonb, jsonb) to authenticated, hivevoice_server;

-- ───────────────────── polls: voting and results ─────────────────────
-- Counts are open to everyone who may read the poll; who voted for what stays private.
create or replace function app.vote_poll(p_poll uuid, p_options uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified(); pl public.polls; allowed_n int;
begin
  select * into pl from public.polls where id = p_poll;
  if pl.id is null or not app.can_read_attachment(pl.message_id, pl.post_id, null) then raise exception 'not_found'; end if;
  if pl.closes_at is not null and pl.closes_at <= now() then raise exception 'closed' using errcode = '23514'; end if;
  p_options := coalesce(p_options, '{}');
  allowed_n := case when pl.multiple then 8 else 1 end;
  if coalesce(array_length(p_options, 1), 0) > allowed_n then raise exception 'invalid' using errcode = '23514'; end if;
  if exists (select 1 from unnest(p_options) o where not exists (select 1 from public.poll_options po where po.id = o and po.poll_id = p_poll)) then
    raise exception 'invalid' using errcode = '23514';
  end if;
  delete from public.poll_votes where poll_id = p_poll and profile_id = me;
  insert into public.poll_votes (poll_id, option_id, profile_id) select p_poll, o, me from unnest(p_options) o;
end $$;

create or replace function app.poll_view(p_polls uuid[]) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'message_id', p.message_id, 'post_id', p.post_id, 'question', p.question, 'multiple', p.multiple,
      'closed', p.closes_at is not null and p.closes_at <= now(),
      'voters', (select count(distinct v.profile_id) from public.poll_votes v where v.poll_id = p.id),
      'options', (select jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label,
                    'votes', (select count(*) from public.poll_votes v where v.option_id = o.id),
                    'mine', exists (select 1 from public.poll_votes v where v.option_id = o.id and v.profile_id = app.uid())) order by o.position)
                  from public.poll_options o where o.poll_id = p.id)
    ) order by p.created_at), '[]'::jsonb)
  from public.polls p where p.id = any (p_polls) and app.can_read_attachment(p.message_id, p.post_id, null)
$$;
grant execute on function app.vote_poll(uuid, uuid[]) to authenticated, hivevoice_server;
grant execute on function app.poll_view(uuid[]) to anon, authenticated, hivevoice_server;

-- ───────────────────── Wissen: files and notes next to links ─────────────────────
alter table public.resources alter column url drop not null;
alter table public.resources drop constraint if exists resources_url_check;
alter table public.resources add constraint resources_url_check check (url is null or (char_length(url) <= 2000 and url ~ '^https://'));
alter table public.resources drop constraint if exists resources_kind_check;
alter table public.resources add constraint resources_kind_check
  check (kind in ('document','sheet','slides','form','folder','file','pdf','image','video','code','design','map','dataset','page','note'));
alter table public.resources add column if not exists origin text not null default 'link' check (origin in ('link', 'file', 'note'));
alter table public.resources add column if not exists body_md text check (char_length(body_md) <= 100000);
alter table public.resources add column if not exists updated_at timestamptz not null default now();
alter table public.resources add constraint resources_content check (
  (origin = 'link' and url is not null and body_md is null) or
  (origin = 'file' and url is null and body_md is null) or
  (origin = 'note' and url is null and body_md is not null));
grant select (origin, body_md, updated_at) on public.resources to anon, authenticated;

-- A shared file: the file itself is already in the bucket (own folder); this records it as knowledge.
create or replace function app.share_file(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified(); rid uuid; gid uuid := nullif(p ->> 'group_id', '')::uuid; mt text := p #>> '{file,mime}';
begin
  if gid is not null and not app.has_group_permission(gid, 'post') then raise exception 'forbidden' using errcode = '42501'; end if;
  if (select count(*) from public.resources where owner_id = me and created_at > now() - interval '1 day') >= 30 then raise exception 'rate_limited'; end if;
  if char_length(coalesce(trim(p ->> 'title'), '')) < 3 then raise exception 'title_required'; end if;
  insert into public.resources (owner_id, group_id, url, host, provider, kind, origin, title, description, preview, safety, region_id)
  values (me, gid, null, 'hivevoice', 'upload',
          case when mt like 'image/%' then 'image' when mt = 'application/pdf' then 'pdf' else 'file' end, 'file',
          left(trim(p ->> 'title'), 200), nullif(left(trim(coalesce(p ->> 'description', '')), 1000), ''),
          jsonb_build_object('file_name', p #>> '{file,name}', 'mime', mt), 'trusted',
          coalesce(nullif(p ->> 'region_id', '')::uuid, (select home_region_id from public.profiles where id = me)))
  returning id into rid;
  perform app.add_extras('resource', rid, jsonb_build_array(p -> 'file'), null);
  insert into public.resource_tags (resource_id, tag_id)
    select rid, unnest(app.ensure_tags(array(select jsonb_array_elements_text(coalesce(p -> 'tags', '[]'::jsonb))))) on conflict do nothing;
  return rid;
end $$;

-- A Markdown note written (or imported from a .md file) in the app, editable by its author afterwards.
create or replace function app.save_note(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified(); rid uuid := nullif(p ->> 'id', '')::uuid; gid uuid := nullif(p ->> 'group_id', '')::uuid;
        body text := coalesce(p ->> 'body', '');
begin
  if char_length(coalesce(trim(p ->> 'title'), '')) < 3 then raise exception 'title_required'; end if;
  if char_length(body) < 1 or char_length(body) > 100000 then raise exception 'invalid' using errcode = '23514'; end if;
  if rid is null then
    if gid is not null and not app.has_group_permission(gid, 'post') then raise exception 'forbidden' using errcode = '42501'; end if;
    if (select count(*) from public.resources where owner_id = me and created_at > now() - interval '1 day') >= 30 then raise exception 'rate_limited'; end if;
    insert into public.resources (owner_id, group_id, url, host, provider, kind, origin, title, description, body_md, preview, safety, region_id)
    values (me, gid, null, 'hivevoice', 'note', 'note', 'note', left(trim(p ->> 'title'), 200),
            nullif(left(trim(coalesce(p ->> 'description', '')), 1000), ''), body, '{}'::jsonb, 'trusted',
            coalesce(nullif(p ->> 'region_id', '')::uuid, (select home_region_id from public.profiles where id = me)))
    returning id into rid;
  else
    update public.resources set title = left(trim(p ->> 'title'), 200), body_md = body,
           description = nullif(left(trim(coalesce(p ->> 'description', '')), 1000), ''), updated_at = now()
     where id = rid and owner_id = me and origin = 'note';
    if not found then raise exception 'forbidden' using errcode = '42501'; end if;
    delete from public.resource_tags where resource_id = rid;
  end if;
  insert into public.resource_tags (resource_id, tag_id)
    select rid, unnest(app.ensure_tags(array(select jsonb_array_elements_text(coalesce(p -> 'tags', '[]'::jsonb))))) on conflict do nothing;
  return rid;
end $$;
grant execute on function app.share_file(jsonb), app.save_note(jsonb) to authenticated, hivevoice_server;
