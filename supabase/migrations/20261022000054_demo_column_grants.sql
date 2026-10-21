-- The "demo" flag is read by the hiding rules (also from other tables' rules, e.g. list items look at their list),
-- so it must be readable wherever only some columns are granted.
grant select (demo) on public.groups, public.listings, public.initiatives, public.posts, public.conversations, public.contact_requests,
  public.resources, public.todo_lists, public.responsibilities, public.notifications to anon, authenticated;
