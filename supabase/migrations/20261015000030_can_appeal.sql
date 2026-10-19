-- Whether the person concerned may still appeal a decision (the jury case itself is not readable for them).
create or replace function app.can_appeal(p_report uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.reports r
    where r.id = p_report and r.target_author_id = app.uid() and r.status = 'upheld'
      and not exists (select 1 from public.appeals a where a.report_id = r.id)
      and coalesce((select c.decided_at from public.jury_cases c where c.report_id = r.id and c.round = 1), r.reviewed_at) > now() - make_interval(days => app.param('appeal_days')))
$$;
grant execute on function app.can_appeal(uuid) to authenticated, hivevoice_server;
