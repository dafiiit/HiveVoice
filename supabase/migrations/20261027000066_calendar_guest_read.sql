-- Guests read public dates through app.calendar, whose query also names the invited people and duty orders (rows stay
-- protected by row level security; this only lets the query plan).
grant select on public.event_guests, public.duty_rotation to anon;
