-- A group starts as a chat and grows into a full organisation: its admins switch the tools on one by one
-- (Ziele, Dokumente, Sammlung, Anliegen, Aufgaben). Chat, members and the about page are always there.
-- Existing groups keep every tool; new groups get what their template sets.
alter table public.groups add column tools text[] not null default '{goals,links,collection,needs,tasks}';
alter table public.groups add constraint groups_tools_known check (tools <@ array['goals', 'links', 'collection', 'needs', 'tasks']::text[]);
grant update (tools) on public.groups to authenticated;
