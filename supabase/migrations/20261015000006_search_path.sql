-- Pin search_path on the remaining helper functions (Supabase security advisor).
alter function app.claims() set search_path = '';
alter function app.verification_mode() set search_path = '';
alter function app.is_verified() set search_path = '';
alter function app.require_verified() set search_path = '';
alter function app.slugify(text) set search_path = '';
alter function app.region_ancestors(uuid) set search_path = '';
alter function app.random_alias() set search_path = '';
alter function app.has_group_permission(uuid, public.group_permission) set search_path = '';
alter function app.wilson_lower(bigint, bigint) set search_path = '';
