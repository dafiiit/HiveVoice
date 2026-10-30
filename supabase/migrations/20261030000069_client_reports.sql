-- What goes wrong and how fast pages feel on real devices, for the operator: browser errors, server errors and web vitals,
-- counted per day. Vercel's Hobby plan keeps logs only briefly and we send nothing to outside services, so this lives here.
-- Counts only: one row per day, kind, name, route, device class and release. No person, no address, no session; after 30 days it is gone.
create table private.client_reports (
  day date not null default current_date,
  kind text not null check (kind in ('browser-error', 'server-error', 'vital')),
  name text not null,
  path text not null,
  device text not null,
  release text not null default '',
  detail text,
  hits int not null default 1,
  total double precision not null default 0,
  worst double precision not null default 0,
  poor int not null default 0,
  last_at timestamptz not null default now(),
  primary key (day, kind, name, path, device, release)
);

create or replace function app.client_report(p_kind text, p_name text, p_path text, p_device text, p_release text, p_detail text, p_value double precision, p_poor boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  -- Anyone can reach this through the API: a full day stops taking new rows, known rows keep counting.
  if not exists (select 1 from private.client_reports r where r.day = current_date and r.kind = p_kind and r.name = p_name and r.path = p_path and r.device = p_device and r.release = p_release)
     and (select count(*) from private.client_reports r where r.day = current_date) >= 5000 then
    return;
  end if;
  insert into private.client_reports as r (kind, name, path, device, release, detail, total, worst, poor)
  values (p_kind, p_name, p_path, p_device, p_release, p_detail, coalesce(p_value, 0), coalesce(p_value, 0), case when p_poor then 1 else 0 end)
  on conflict (day, kind, name, path, device, release) do update set
    hits = r.hits + 1,
    total = r.total + excluded.total,
    worst = greatest(r.worst, excluded.worst),
    poor = r.poor + excluded.poor,
    detail = coalesce(excluded.detail, r.detail),
    last_at = now();
  if random() < 0.01 then
    delete from private.client_reports r where r.day < current_date - 30;
  end if;
end $$;

create or replace function app.client_report_summary(p_days int default 7)
returns table (kind text, name text, path text, device text, release text, hits bigint, average double precision, worst double precision, poor bigint, last_at timestamptz, detail text)
language sql stable security definer set search_path = '' as $$
  select r.kind, r.name, r.path, r.device, max(r.release), sum(r.hits), sum(r.total) / nullif(sum(r.hits), 0), max(r.worst), sum(r.poor), max(r.last_at), max(r.detail)
  from private.client_reports r
  where r.day > current_date - p_days
  group by r.kind, r.name, r.path, r.device
  order by case r.kind when 'server-error' then 0 when 'browser-error' then 1 else 2 end, sum(r.poor) desc, sum(r.hits) desc
$$;

revoke all on function app.client_report(text, text, text, text, text, text, double precision, boolean), app.client_report_summary(int) from public, anon, authenticated;
grant execute on function app.client_report(text, text, text, text, text, text, double precision, boolean), app.client_report_summary(int) to hivevoice_server;
