-- Whether the signed-in person is already in (invitation phase): read through a function, the column itself is not open to everybody.
create or replace function app.invite_redeemed() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select invite_redeemed_at is not null from public.profiles where id = app.uid()), false)
$$;
grant execute on function app.invite_redeemed() to authenticated, hivevoice_server;
