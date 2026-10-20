-- Guests run the same queries (a subquery on grants), they simply see no rows; the secret link of a task is not
-- readable as a column, only its manager gets it through the page.
grant select on public.object_grants to anon;
revoke select on public.tasks from anon, authenticated;
grant select (id, group_id, goal_id, title, status, due_date, hourly_rate_cents, position, created_by, completed_at, created_at,
              read_scope, write_scope) on public.tasks to anon, authenticated;

create or replace function app.task_link_token(p_task uuid) returns text
language sql stable security definer set search_path = '' as $$
  select link_token from public.tasks where id = p_task and app.object_manageable('task', p_task)
$$;
grant execute on function app.task_link_token(uuid) to authenticated, hivevoice_server;
