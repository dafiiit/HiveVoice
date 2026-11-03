-- A picture instead of an emoji as a note's icon: an own photo from the image bucket (the path, like avatars).
-- A note has either an emoji or a picture; setting one clears the other.
alter table public.resources add column if not exists icon_image text check (icon_image is null or char_length(icon_image) <= 300);

create or replace function app.set_resource_icon(p_res uuid, p_icon text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified(); v text := nullif(btrim(coalesce(p_icon, '')), '');
begin
  if app.resource_level(p_res, me) < 3 then raise exception 'forbidden' using errcode = '42501'; end if;
  if v is not null and (char_length(v) > 16 or v ~ '[[:space:][:cntrl:]<>]') then raise exception 'invalid' using errcode = '23514'; end if;
  update public.resources set icon = v, icon_image = null where id = p_res;
end $$;

-- Only one's own uploaded picture (the same check as for avatars).
create or replace function app.set_resource_icon_image(p_res uuid, p_path text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified();
begin
  if app.resource_level(p_res, me) < 3 then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_path is null or not app.valid_image_path(p_path, me) then raise exception 'invalid' using errcode = '23514'; end if;
  update public.resources set icon_image = p_path, icon = null where id = p_res;
end $$;

revoke all on function app.set_resource_icon_image(uuid, text) from public;
grant execute on function app.set_resource_icon_image(uuid, text) to authenticated, hivevoice_server;
