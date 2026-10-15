-- Supabase does not allow changing the postgres password via SQL. To run
-- migrations from a developer machine, a dedicated login role calls these
-- security definer functions (owned by postgres). Apply this file once in the
-- Supabase SQL editor, then create the login role there:
--
--   create role hivevoice_migrator login noinherit password '<strong password>';
--   grant usage on schema private to hivevoice_migrator;
--   grant execute on function private.run_migration(text, text), private.exec(text) to hivevoice_migrator;
--
-- Self-hosted instances use MIGRATION_MODE=direct with a superuser instead.

create schema if not exists private;

create table if not exists private.schema_migrations (
  name text primary key,
  applied_at timestamptz not null default now()
);

create or replace function private.run_migration(p_name text, p_sql text) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from private.schema_migrations where name = p_name) then return 'skipped'; end if;
  execute p_sql;
  insert into private.schema_migrations (name) values (p_name);
  return 'applied';
end $$;

create or replace function private.exec(p_sql text) returns void
language plpgsql security definer set search_path = '' as $$ begin execute p_sql; end $$;

revoke all on function private.run_migration(text, text), private.exec(text) from public;
