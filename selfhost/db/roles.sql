-- After supabase/docker (Apache-2.0): the passwords of Supabase's own service roles, set from POSTGRES_PASSWORD at the
-- first start. Only for the roles that exist (this package leaves out Edge Functions, so supabase_functions_admin is
-- missing); a failing line here would stop the image's own setup of the database halfway.
\set pgpass `echo "$POSTGRES_PASSWORD"`

select format('alter role %I with password %L', r, :'pgpass')
from unnest(array['authenticator', 'pgbouncer', 'supabase_auth_admin', 'supabase_functions_admin', 'supabase_storage_admin']) as r
where exists (select 1 from pg_roles where rolname = r)
\gexec
