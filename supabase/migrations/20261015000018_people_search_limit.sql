-- People search is limited so the member list cannot be scraped: 60 searches an hour (120 for verified people).
insert into public.action_rules (action, min_level, limit_l1, limit_l2, window_hours) values ('people_search', 0, 60, 120, 1)
on conflict (action) do nothing;

create or replace function app.people_search_allowed() returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform app.check_limit('people_search');
  return true;
exception when others then
  return false;
end $$;
grant execute on function app.people_search_allowed() to anon, authenticated, hivevoice_server;
