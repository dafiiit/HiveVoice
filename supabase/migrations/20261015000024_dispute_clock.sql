-- A dispute whose time is up this very moment is handled by the clock too (a limit of zero days works as expected).
create or replace function app.dispute_tick() returns void
language plpgsql security definer set search_path = '' as $$
declare d record;
begin
  for d in select id from public.responsibility_disputes where status = 'evidence' and evidence_until <= now() loop
    perform app.draw_dispute_jury(d.id);
  end loop;
  for d in
    select rd.id, count(*) filter (where s.choice = 'not_ok') n_not, count(*) filter (where s.choice = 'ok') n_ok
    from public.responsibility_disputes rd left join public.responsibility_dispute_seats s on s.dispute_id = rd.id
    where rd.status = 'jury' and rd.jury_until <= now() group by rd.id
  loop
    perform app.resolve_dispute(d.id, d.n_not > d.n_ok);
  end loop;
end $$;
