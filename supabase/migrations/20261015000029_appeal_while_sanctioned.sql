-- Somebody who is paused or suspended must still be able to appeal: this needs a signed-in person, not a person in good standing.
create or replace function app.appeal_report(p_report uuid, p_reason text) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.uid(); r public.reports; c1 public.jury_cases; decided timestamptz; cid uuid; num text; juror record;
begin
  if me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into r from public.reports where id = p_report;
  if not found or r.target_author_id is distinct from me then raise exception 'forbidden' using errcode = '42501'; end if;
  if r.status <> 'upheld' then raise exception 'wrong_phase'; end if;
  select * into c1 from public.jury_cases where report_id = p_report and round = 1;
  decided := coalesce(c1.decided_at, r.reviewed_at);
  if decided is null or decided < now() - make_interval(days => app.param('appeal_days')) then raise exception 'appeal_window_over'; end if;
  if exists (select 1 from public.appeals where report_id = p_report) then raise exception 'duplicate'; end if;
  if char_length(coalesce(trim(p_reason), '')) < 10 then raise exception 'reason_required'; end if;
  num := r.case_no || '-E';
  insert into public.jury_cases (report_id, case_no, region_id, context_text, target_text, round, appeal_of)
  values (p_report, num, c1.region_id, c1.context_text, c1.target_text, 2, c1.id) returning id into cid;
  insert into public.appeals (report_id, appellant_id, reason, appeal_case_id) values (p_report, me, trim(p_reason), cid);
  for juror in
    select p.id from public.profiles p
    where p.id not in (me, r.reporter_id) and app.profile_is_verified(p.id) and p.onboarded_at is not null
      and not exists (select 1 from public.jury_seats s join public.jury_cases jc on jc.id = s.case_id where jc.report_id = p_report and s.juror_id = p.id)
      and not app.shares_group(p.id, me) and not app.shares_group(p.id, r.reporter_id)
    order by random() limit 7
  loop
    insert into public.jury_seats (case_id, juror_id) values (cid, juror.id);
    perform app.notify(juror.id, 'jury_invite', jsonb_build_object('case_id', cid, 'case_no', num));
  end loop;
  update public.jury_cases set jury_size = greatest(1, (select count(*) from public.jury_seats where case_id = cid)) where id = cid;
  return num;
end $$;
