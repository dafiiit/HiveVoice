-- Federation outbox: only public objects. Until now every local row was queued, including private groups,
-- drafts and listings shared with a few people. Nothing was ever delivered, so the queue can be cleaned up.
--
-- Rules for the later worker (see docs/architektur.md, Föderation):
--  - check app.federation_public again at delivery time and build the payload then, never from the queue;
--  - name people with app.federation_name (always the alias, even with display_mode = 'real');
--  - no person actors at the start, only groups and initiatives.

-- ───────────────────────── what counts as public ─────────────────────────
-- r is the row as jsonb (to_jsonb(new) / to_jsonb(old)), so the trigger can judge the old and the new state.
create or replace function app.federation_public(p_table text, r jsonb) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare parent jsonb;
begin
  if r is null or r ->> 'origin_instance_id' is not null or coalesce((r ->> 'demo')::boolean, false) then return false; end if;
  case p_table
  when 'groups' then
    return r ->> 'visibility' = 'public' and not coalesce((r ->> 'adults_only')::boolean, false);
  when 'initiatives' then
    if r ->> 'published_at' is null or r ->> 'blocked_at' is not null then return false; end if;
    if r ->> 'group_id' is null then return true; end if;
    select to_jsonb(g) into parent from public.groups g where g.id = (r ->> 'group_id')::uuid;
    return app.federation_public('groups', parent);
  when 'arguments' then
    if r ->> 'hidden_at' is not null then return false; end if;
    select to_jsonb(i) into parent from public.initiatives i where i.id = (r ->> 'initiative_id')::uuid;
    return app.federation_public('initiatives', parent);
  when 'listings' then
    return r ->> 'status' in ('active', 'paused', 'closed') and r ->> 'read_scope' = 'public';
  else
    return false;
  end case;
end $$;

-- The name that may leave the instance: always the alias, never the real name.
create or replace function app.federation_name(p_profile uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(p.alias::text, ''), 'HiveVoice') from public.profiles p where p.id = p_profile
$$;

-- What waits for delivery, oldest first (for the worker; the table itself has no policies).
create or replace function app.federation_queue(p_limit int default 100)
returns table (id bigint, object_type text, object_id uuid, activity text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select o.id, o.object_type, o.object_id, o.activity, o.created_at from public.federation_outbox o
  where o.status = 'pending' order by o.id limit least(greatest(p_limit, 1), 1000)
$$;

revoke all on function app.federation_public(text, jsonb), app.federation_name(uuid), app.federation_queue(int) from public, anon, authenticated;
grant execute on function app.federation_public(text, jsonb), app.federation_name(uuid), app.federation_queue(int) to hivevoice_server;

-- ───────────────────────── the trigger ─────────────────────────
-- Becoming public is a Create, staying public an Update, leaving the public a Delete; private rows leave no trace.
create or replace function app.trg_outbox() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  was boolean := tg_op <> 'INSERT' and app.federation_public(tg_table_name, to_jsonb(old));
  is_now boolean := tg_op <> 'DELETE' and app.federation_public(tg_table_name, to_jsonb(new));
  act text;
begin
  act := case when is_now and was then 'Update' when is_now then 'Create' when was then 'Delete' end;
  if act is null then return null; end if;
  -- One waiting Create or Update is enough: the worker builds the payload from the current row.
  if act = 'Update' and exists (select 1 from public.federation_outbox o where o.object_type = tg_table_name and o.object_id = new.id
                                and o.status = 'pending' and o.activity in ('Create', 'Update')) then return null; end if;
  insert into public.federation_outbox (object_type, object_id, activity)
  values (tg_table_name, case when tg_op = 'DELETE' then old.id else new.id end, act);
  return null;
end $$;

create index if not exists federation_outbox_pending_idx on public.federation_outbox (object_type, object_id) where status = 'pending';

-- Arguments and listings also change visibility by update (hidden, published, shared).
drop trigger if exists outbox on public.arguments;
drop trigger if exists outbox on public.listings;
create trigger outbox after insert or update or delete on public.arguments for each row execute function app.trg_outbox();
create trigger outbox after insert or update or delete on public.listings for each row execute function app.trg_outbox();

-- ───────────────────────── clean up the queue ─────────────────────────
-- Nothing was delivered: Deletes have no remote copy to remove, and non-public rows must not stay recorded.
delete from public.federation_outbox o
where o.status = 'pending' and (
  o.activity = 'Delete'
  or (o.object_type = 'groups' and not exists (select 1 from public.groups g where g.id = o.object_id and app.federation_public('groups', to_jsonb(g))))
  or (o.object_type = 'initiatives' and not exists (select 1 from public.initiatives i where i.id = o.object_id and app.federation_public('initiatives', to_jsonb(i))))
  or (o.object_type = 'arguments' and not exists (select 1 from public.arguments a where a.id = o.object_id and app.federation_public('arguments', to_jsonb(a))))
  or (o.object_type = 'listings' and not exists (select 1 from public.listings l where l.id = o.object_id and app.federation_public('listings', to_jsonb(l)))));
