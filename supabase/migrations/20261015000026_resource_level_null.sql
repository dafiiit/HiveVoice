-- A missing link key must never open a document: the check is "true or nothing" (a NULL in an OR chain is not a yes).
create or replace function app.resource_level(p_res uuid, p_profile uuid default app.uid()) returns int
language plpgsql stable security definer set search_path = '' as $$
declare r public.resources; lvl int := 0; granted int; readable boolean := false; key text := nullif(current_setting('app.link_token', true), '');
begin
  select * into r from public.resources where id = p_res;
  if not found then return 0; end if;
  if p_profile is not null and r.owner_id = p_profile then return 4; end if;
  if r.trashed_at is not null or r.hidden_at is not null then
    -- the managers of a group still see what was thrown away
    if r.group_id is not null and p_profile is not null and exists (
         select 1 from public.group_members m where m.group_id = r.group_id and m.profile_id = p_profile and m.role in ('admin', 'maintainer')) then return 4; end if;
    return 0;
  end if;
  if r.group_id is not null and p_profile is not null then
    if exists (select 1 from public.group_members m where m.group_id = r.group_id and m.profile_id = p_profile and m.role in ('admin', 'maintainer')) then return 4; end if;
    if r.edit_mode = 'group' and app.profile_has_group_permission(p_profile, r.group_id, 'edit_files') then lvl := 3; end if;
  end if;
  select max(case g.level when 'view' then 1 when 'comment' then 2 when 'edit' then 3 else 4 end) into granted
    from public.resource_grants g
   where g.resource_id = p_res and (g.expires_at is null or g.expires_at > now())
     and (g.profile_id = p_profile or (g.group_id is not null and p_profile is not null and exists (
            select 1 from public.group_members m where m.group_id = g.group_id and m.profile_id = p_profile and m.role <> 'guest')));
  lvl := greatest(lvl, coalesce(granted, 0));
  readable := coalesce(lvl >= 1, false) or r.visibility = 'public'
    or coalesce(r.visibility = 'group' and r.group_id is not null and app.can_read_group(r.group_id), false)
    or coalesce(r.visibility = 'link' and r.link_token is not null and key is not null and r.link_token = key, false);
  if readable is not true then return 0; end if;
  lvl := greatest(lvl, 1);
  if r.edit_mode = 'suggest' and lvl < 2 and p_profile is not null and app.profile_is_verified(p_profile) then lvl := 2; end if;
  return lvl;
end $$;
