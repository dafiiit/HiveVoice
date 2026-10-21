-- One setting for every list in the three areas: newest first ("chrono") or what fits and waits for an answer first ("suggested").
alter table public.user_settings add column if not exists feed_order text not null default 'chrono' check (feed_order in ('chrono', 'suggested'));
