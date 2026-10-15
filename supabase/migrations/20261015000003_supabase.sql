-- Supabase-specific glue. A self-hosted instance without Supabase skips this
-- file and calls app.tick() from its own scheduler (see docs/self-hosting.md).

-- Close ballots and expired jury cases every five minutes.
create extension if not exists pg_cron;
select cron.schedule('hivevoice-tick', '*/5 * * * *', 'select app.tick()');

-- New tables are not readable by API roles unless granted explicitly.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

-- Account deletion removes the profile (and with it all content) and the login.
create or replace function app.delete_account(p_profile uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare auth_id uuid;
begin
  select auth_user_id into auth_id from public.profiles where id = p_profile;
  delete from public.groups g where g.created_by = p_profile
    and not exists (select 1 from public.group_members m where m.group_id = g.id and m.profile_id <> p_profile);
  delete from public.profiles where id = p_profile;
  if auth_id is not null then delete from auth.users where id = auth_id; end if;
end $$;
revoke execute on function app.delete_account(uuid) from public;
grant execute on function app.delete_account(uuid) to hivevoice_server;
