-- app.listing_matches runs with the caller's rights and compares embeddings, so they must be readable
-- (they are derived from public fields only).
grant select (embedding) on public.listings to anon, authenticated;
