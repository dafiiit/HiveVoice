-- Enough places for the tests: a chain from country to borough.
insert into public.regions (id, parent_id, level, name, official_code, lat, lon) values
  ('00000000-0000-4000-8000-000000000001', null, 'country', 'Deutschland', 'T0', 51.2, 10.4),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'state', 'Teststaat', 'T1', 48.1, 11.6),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002', 'municipality', 'Teststadt', 'T2', 48.1, 11.6),
  ('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000003', 'borough', 'Testviertel', 'T3', 48.1, 11.6)
on conflict do nothing;
