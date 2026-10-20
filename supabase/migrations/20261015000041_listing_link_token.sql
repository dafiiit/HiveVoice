-- The secret link of a listing is not a readable column; its owner gets it through this function.
create or replace function app.listing_link_token(p_listing uuid) returns text
language sql stable security definer set search_path = '' as $$
  select link_token from public.listings where id = p_listing and owner_id = app.uid()
$$;
grant execute on function app.listing_link_token(uuid) to authenticated, hivevoice_server;
