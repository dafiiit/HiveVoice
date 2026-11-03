-- An icon of its own for a note (or any other resource): usually one emoji, set and changed like the title.
-- It stands for the note where the list in the middle is folded to icons. Empty means the standard icon of its kind.
alter table public.resources add column if not exists icon text
  check (icon is null or (char_length(icon) between 1 and 16 and icon !~ '[[:space:][:cntrl:]<>]'));

-- Whoever may edit the note may change its icon. No new version: the icon is not part of the text.
create or replace function app.set_resource_icon(p_res uuid, p_icon text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified(); v text := nullif(btrim(coalesce(p_icon, '')), '');
begin
  if app.resource_level(p_res, me) < 3 then raise exception 'forbidden' using errcode = '42501'; end if;
  if v is not null and (char_length(v) > 16 or v ~ '[[:space:][:cntrl:]<>]') then raise exception 'invalid' using errcode = '23514'; end if;
  update public.resources set icon = v where id = p_res;
end $$;

revoke all on function app.set_resource_icon(uuid, text) from public;
grant execute on function app.set_resource_icon(uuid, text) to authenticated, hivevoice_server;
