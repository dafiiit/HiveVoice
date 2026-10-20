-- 1. Demo chats were seeded twice when /connect loaded in two requests at once (both saw "nothing seeded yet").
--    A per-person lock serialises the check; the duplicates already made are removed.
-- 2. Messages carry a key chosen by the device, so a message sent again after a lost connection is stored once.
-- 3. Personal to-do lists for "Meine Inhalte": private unless the owner opens them.

-- ───────────────────────── 1. demo chats once ─────────────────────────
alter function app.ensure_demo_chats() rename to ensure_demo_chats_unlocked;
revoke execute on function app.ensure_demo_chats_unlocked() from public, authenticated, hivevoice_server;

create or replace function app.ensure_demo_chats() returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if app.uid() is null then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended('demo_chats:' || app.uid()::text, 0));
  return app.ensure_demo_chats_unlocked();
end $$;
grant execute on function app.ensure_demo_chats() to authenticated, hivevoice_server;

-- Keep the busiest copy of each demo conversation (same person, same demo profile, same title).
delete from public.conversations c using (
  select c2.id, row_number() over (partition by mine.profile_id, o.profile_id, coalesce(c2.title, '')
                                   order by c2.last_message_at desc nulls last, c2.created_at, c2.id) as rn
    from public.conversations c2
    join public.conversation_participants o on o.conversation_id = c2.id
    join public.profiles op on op.id = o.profile_id and op.is_demo
    join public.conversation_participants mine on mine.conversation_id = c2.id and mine.profile_id <> o.profile_id
    join public.profiles mp on mp.id = mine.profile_id and not mp.is_demo
) d where d.id = c.id and d.rn > 1;

-- The same first message from a demo profile twice: keep one.
delete from public.contact_requests r using (
  select r2.id, row_number() over (partition by r2.from_profile_id, r2.to_profile_id, r2.listing_id, r2.message order by r2.created_at, r2.id) as rn
    from public.contact_requests r2 join public.profiles f on f.id = r2.from_profile_id and f.is_demo
) d where d.id = r.id and d.rn > 1
  and not exists (select 1 from public.conversations c where c.contact_request_id = r.id);

-- ───────────────────────── 2. messages sent again ─────────────────────────
alter table public.messages add column if not exists client_key text check (char_length(client_key) <= 64);
create unique index if not exists messages_client_key_idx on public.messages (conversation_id, sender_id, client_key) where client_key is not null;

-- ───────────────────────── 3. to-do lists ─────────────────────────
create table if not exists public.todo_lists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default app.uid() references public.profiles(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 200),
  visibility text not null default 'me' check (visibility in ('me', 'public')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists todo_lists_owner_idx on public.todo_lists (owner_id, updated_at desc);

create table if not exists public.todo_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.todo_lists(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 500),
  done_at timestamptz,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists todo_items_list_idx on public.todo_items (list_id, position, created_at);

alter table public.todo_lists enable row level security;
alter table public.todo_items enable row level security;

create policy read on public.todo_lists for select using (owner_id = app.uid() or visibility = 'public');
create policy own on public.todo_lists for all to authenticated using (owner_id = app.uid()) with check (owner_id = app.uid());
create policy read on public.todo_items for select using (exists (select 1 from public.todo_lists l where l.id = list_id and (l.owner_id = app.uid() or l.visibility = 'public')));
create policy own on public.todo_items for all to authenticated
  using (exists (select 1 from public.todo_lists l where l.id = list_id and l.owner_id = app.uid()))
  with check (exists (select 1 from public.todo_lists l where l.id = list_id and l.owner_id = app.uid()));

grant select on public.todo_lists, public.todo_items to anon, authenticated;
grant insert, update, delete on public.todo_lists, public.todo_items to authenticated;

-- Enough room for real use, not for filling the database.
create or replace function app.trg_todo_limits() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'todo_lists' then
    if (select count(*) from public.todo_lists where owner_id = new.owner_id) >= 200 then raise exception 'rate_limited'; end if;
  else
    if (select count(*) from public.todo_items where list_id = new.list_id) >= 500 then raise exception 'rate_limited'; end if;
    update public.todo_lists set updated_at = now() where id = new.list_id;
  end if;
  return new;
end $$;
create trigger limits before insert on public.todo_lists for each row execute function app.trg_todo_limits();
create trigger limits before insert on public.todo_items for each row execute function app.trg_todo_limits();
