-- close_ballot: a local variable named n clashed with a column alias.

create or replace function app.close_ballot(p_ballot uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare b public.ballots; res jsonb; segs jsonb; main text; v_yes int; v_no int; voters int; eligible int;
        turnout numeric; passed boolean; i public.initiatives; g public.goals; grp public.groups;
begin
  select * into b from public.ballots where id = p_ballot for update;
  if b.status <> 'open' then return b.result; end if;
  select jsonb_object_agg(segment, counts) into segs from (
    select segment, jsonb_object_agg(choice, cnt) counts from (
      select segment::text, choice, count(*) cnt from private.ballot_votes where ballot_id = p_ballot group by 1, 2) c
    group by segment) s;
  segs := coalesce(segs, '{}'::jsonb);
  main := case b.subject_type when 'goal' then 'member' else 'affected' end;
  v_yes := coalesce((segs -> main ->> 'yes')::int, 0);
  v_no := coalesce((segs -> main ->> 'no')::int, 0);
  voters := (select count(*) from public.ballot_participation where ballot_id = p_ballot and segment::text = main);
  eligible := coalesce((app.ballot_turnout(p_ballot) ->> 'eligible')::int, 0);
  turnout := case when eligible > 0 then round(100.0 * voters / eligible, 1) else 0 end;
  if b.subject_type = 'goal' then
    passed := v_yes > v_no and voters * 2 >= eligible;
  else
    passed := v_yes > v_no and turnout >= b.quorum_pct;
  end if;
  res := jsonb_build_object('segments', segs, 'main_segment', main, 'voters', voters, 'eligible', eligible,
                            'turnout_pct', turnout, 'passed', passed, 'closed_at', now());
  update public.ballots set status = 'closed', result = res where id = p_ballot;

  if b.subject_type = 'goal' then
    select * into g from public.goals where id = b.goal_id;
    select * into grp from public.groups where id = b.group_id;
    update public.goals set status = case when passed then 'adopted'::public.goal_status else 'rejected'::public.goal_status end,
           adopted_at = case when passed then now() end
     where id = b.goal_id or parent_goal_id = b.goal_id;
    perform app.notify(m.profile_id, case when passed then 'goal_adopted' else 'goal_rejected' end,
                       jsonb_build_object('group_id', grp.id, 'slug', grp.slug, 'group', grp.name, 'goal', g.title))
      from public.group_members m where m.group_id = b.group_id;
  else
    select * into i from public.initiatives where id = b.initiative_id;
    if passed then
      update public.initiatives set phase = 'addressee', response_due_at = now() + interval '6 weeks' where id = i.id;
      if i.addressee_responsibility_id is not null then
        insert into public.responsibility_requests (responsibility_id, initiative_id, author_id, body, due_at)
        values (i.addressee_responsibility_id, i.id, i.created_by,
                coalesce(i.summary, i.title), now() + interval '6 weeks');
      end if;
    else
      update public.initiatives set outcome = 'rejected_vote' where id = i.id;
    end if;
    perform app.notify(a.profile_id, case when passed then 'initiative_passed' else 'initiative_failed' end,
                       jsonb_build_object('initiative_id', i.id, 'title', i.title))
      from public.initiative_authors a where a.initiative_id = i.id;
  end if;
  return res;
end $$;
