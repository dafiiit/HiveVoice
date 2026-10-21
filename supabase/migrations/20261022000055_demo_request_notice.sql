-- The example contact request also arrives as a notification, like a real one (the badge and the list agree).
create or replace function app.demo_request_notice(p_profile uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare rid uuid;
begin
  select r.id into rid from public.contact_requests r where r.to_profile_id = p_profile and r.demo and r.status = 'pending' limit 1;
  if rid is null or exists (select 1 from public.notifications where profile_id = p_profile and kind = 'contact_request' and payload ->> 'request_id' = rid::text) then return; end if;
  insert into public.notifications (profile_id, kind, payload, demo) values (p_profile, 'contact_request', jsonb_build_object('request_id', rid), true);
end $$;

-- Accounts that already have their examples.
select app.demo_request_notice(profile_id) from public.demo_seeded;

-- From now on as part of the set.
create or replace function app.ensure_demo_notice_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.demo and new.status = 'pending' then perform app.demo_request_notice(new.to_profile_id); end if;
  return new;
end $$;
drop trigger if exists demo_notice on public.contact_requests;
create trigger demo_notice after insert on public.contact_requests for each row execute function app.ensure_demo_notice_trigger();
