-- Ausgaben teilen (like Splitwise), a tool of groups and of private chats: who paid what, when, for whom and how it
-- is split (equally, exact amounts, percent or shares), with receipts. Settling up is a payment from one person to
-- another, stored as an entry of its own. The platform never holds or moves money; it only keeps the book.
-- Everything is readable only by the members of the group, whatever the group's visibility.

alter table public.groups drop constraint if exists groups_tools_known;
alter table public.groups add constraint groups_tools_known
  check (tools <@ array['goals', 'links', 'collection', 'needs', 'tasks', 'expenses']::text[]);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  kind text not null default 'expense' check (kind in ('expense', 'payment')),
  title text not null check (char_length(title) between 1 and 120),
  amount_cents bigint not null check (amount_cents between 1 and 100000000),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  paid_by uuid not null references public.profiles(id),
  spent_on date not null default current_date,
  split text not null default 'equal' check (split in ('equal', 'exact', 'percent', 'shares')),
  category text not null default 'general' check (category in ('general', 'food', 'groceries', 'home', 'transport', 'travel', 'fun')),
  note text check (char_length(note) <= 1000),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Deleted entries stay restorable and no longer count.
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null
);
create index on public.expenses (group_id, spent_on desc, created_at desc);

-- Each person's part of an entry. `input` keeps what was typed (percent, shares or cents) so the form opens as it was saved.
create table public.expense_shares (
  expense_id uuid not null references public.expenses(id) on delete cascade,
  profile_id uuid not null references public.profiles(id),
  amount_cents bigint not null check (amount_cents >= 0),
  input numeric(14, 4),
  primary key (expense_id, profile_id)
);
create index on public.expense_shares (profile_id);

create or replace function app.can_read_expense(p_expense uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.expenses e where e.id = p_expense and app.group_role(e.group_id) is not null)
$$;

alter table public.expenses enable row level security;
alter table public.expense_shares enable row level security;
create policy read on public.expenses for select to authenticated using (app.group_role(group_id) is not null);
create policy read on public.expense_shares for select to authenticated using (app.can_read_expense(expense_id));
grant select on public.expenses, public.expense_shares to authenticated;
grant execute on function app.can_read_expense(uuid) to authenticated;

-- ───────────────────── receipts: attachments that hang on an entry ─────────────────────
alter table public.attachments add column if not exists expense_id uuid references public.expenses(id) on delete cascade;
create index if not exists attachments_expense_id_idx on public.attachments (expense_id) where expense_id is not null;
do $c$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'public.attachments'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) like '%num_nonnulls%' loop
    execute format('alter table public.attachments drop constraint %I', c);
  end loop;
end $c$;
alter table public.attachments add constraint attachments_one_parent check (num_nonnulls(message_id, post_id, resource_id, expense_id) = 1);

drop policy if exists read on public.attachments;
create policy read on public.attachments for select using (
  app.can_read_attachment(message_id, post_id, resource_id) or (expense_id is not null and app.can_read_expense(expense_id)));

create or replace function app.can_read_file(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.attachments a where a.path = p_path
                 and (app.can_read_attachment(a.message_id, a.post_id, a.resource_id)
                      or (a.expense_id is not null and app.can_read_expense(a.expense_id))
                      or exists (select 1 from public.resources r where r.id = a.resource_id and r.visibility = 'link'
                                 and r.trashed_at is null and r.hidden_at is null)))
$$;

-- ───────────────────── private chats may switch the tool on too ─────────────────────
create or replace function app.chat_tools(p_conversation uuid, p_tools text[]) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.uid(); gid uuid; s text; names text;
begin
  if me is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if not exists (select 1 from public.conversation_participants where conversation_id = p_conversation and profile_id = me) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if exists (select 1 from unnest(coalesce(p_tools, '{}')) t where t not in ('goals', 'tasks', 'links', 'collection', 'needs', 'expenses')) then
    raise exception 'invalid' using errcode = '23514';
  end if;
  select id, slug::text into gid, s from public.groups where conversation_id = p_conversation;
  if gid is null then
    if cardinality(coalesce(p_tools, '{}')) = 0 then return null; end if;
    select string_agg(split_part(p.display_name, ' ', 1), ' & ' order by p.display_name) into names
      from public.conversation_participants cp join public.profiles p on p.id = cp.profile_id where cp.conversation_id = p_conversation;
    insert into public.groups (slug, name, kind, visibility, join_policy, mod_tasks, created_by, owner_id, template, tools, conversation_id)
    values (app.unique_group_slug('chat ' || names), names, 'project', 'secret', 'invite', true, me, me, 'project', p_tools, p_conversation)
    returning id, slug::text into gid, s;
    insert into public.group_members (group_id, profile_id, role)
      select gid, cp.profile_id, 'admin' from public.conversation_participants cp where cp.conversation_id = p_conversation;
    perform app.seed_group_permissions(gid, 'project');
  else
    update public.groups set tools = coalesce(p_tools, '{}') where id = gid;
  end if;
  return s;
end $$;

insert into public.action_rules (action, min_level, limit_l1, limit_l2, window_hours) values ('expense', 1, 100, 300, 24)
on conflict (action) do nothing;

-- ───────────────────── writing an entry ─────────────────────
-- p: {id?, group_id, kind ('expense' | 'payment'), title, amount_cents, currency, paid_by, spent_on, split, category, note,
--     shares: [{profile_id, value}], files: [{path, name, mime, size}], remove_files: [attachment id]}
-- value: ignored for 'equal', cents for 'exact', percent for 'percent', a number of parts for 'shares'.
-- The cents of each part are computed here, so they always add up to the total (left-over cents go to the largest remainders).
create or replace function app.save_expense(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := app.uid(); eid uuid := nullif(p ->> 'id', '')::uuid; old public.expenses; gid uuid; g public.groups; role public.group_role;
  k text := coalesce(p ->> 'kind', 'expense'); mode text := coalesce(p ->> 'split', 'equal');
  amt bigint := (p ->> 'amount_cents')::bigint; payer uuid := (p ->> 'paid_by')::uuid; cur text := upper(coalesce(nullif(p ->> 'currency', ''), 'EUR'));
  ttl text := btrim(coalesce(p ->> 'title', '')); parts jsonb; n int; tot numeric; f jsonb; sz int; mt text; found_obj boolean; my_auth text; files_n int;
  allowed text[] := array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
  r record; my_name text;
begin
  if me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if eid is not null then
    select * into old from public.expenses where id = eid;
    if not found then raise exception 'not_found'; end if;
    gid := old.group_id; k := old.kind;
  else
    gid := (p ->> 'group_id')::uuid;
  end if;
  select * into g from public.groups where id = gid;
  role := app.group_role(gid);
  if g.id is null or role is null or role = 'guest' or not ('expenses' = any (g.tools)) then raise exception 'forbidden' using errcode = '42501'; end if;
  if eid is null then perform app.check_limit('expense'); end if;

  if k not in ('expense', 'payment') or mode not in ('equal', 'exact', 'percent', 'shares') then raise exception 'invalid' using errcode = '23514'; end if;
  if amt is null or amt < 1 or amt > 100000000 then raise exception 'amount_required'; end if;
  if cur !~ '^[A-Z]{3}$' then raise exception 'invalid' using errcode = '23514'; end if;
  if k = 'payment' and ttl = '' then ttl := 'Ausgleich'; end if;
  if char_length(ttl) < 1 then raise exception 'title_required'; end if;

  -- Who takes part: members of the group, or people already on this entry (someone may have left since).
  select coalesce(jsonb_agg(jsonb_build_object('pid', pid, 'ord', ord, 'input', input) order by ord), '[]'::jsonb) into parts from (
    select (x ->> 'profile_id')::uuid as pid, min(o)::int as ord, (array_agg(nullif(x ->> 'value', '')::numeric))[1] as input
    from jsonb_array_elements(coalesce(p -> 'shares', '[]'::jsonb)) with ordinality as s(x, o) group by 1) q;
  n := jsonb_array_length(parts);
  if n < 1 then raise exception 'split_people'; end if;
  if exists (select 1 from jsonb_to_recordset(parts) as x(pid uuid)
             where not exists (select 1 from public.group_members m where m.group_id = gid and m.profile_id = x.pid)
               and not exists (select 1 from public.expense_shares s where s.expense_id = eid and s.profile_id = x.pid)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.group_members m where m.group_id = gid and m.profile_id = payer) and payer is distinct from old.paid_by then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if k = 'payment' then
    -- Settling up: one person pays another the whole amount.
    if n <> 1 or (parts -> 0 ->> 'pid')::uuid = payer then raise exception 'invalid' using errcode = '23514'; end if;
    mode := 'exact';
    parts := jsonb_build_array(jsonb_set(parts -> 0, '{input}', to_jsonb(amt)));
  end if;
  if mode = 'equal' then
    select jsonb_agg(x || '{"input": null, "weight": 1}'::jsonb) into parts from jsonb_array_elements(parts) x;
  elsif exists (select 1 from jsonb_to_recordset(parts) as x(input numeric) where x.input is null or x.input < 0
                  or (mode = 'shares' and (x.input = 0 or x.input > 1000)) or (mode = 'percent' and x.input > 100)
                  or (mode = 'exact' and x.input <> trunc(x.input))) then
    raise exception 'split_mismatch';
  else
    select sum(x.input) into tot from jsonb_to_recordset(parts) as x(input numeric);
    if (mode = 'percent' and abs(tot - 100) > 0.01) or (mode = 'exact' and tot <> amt) then raise exception 'split_mismatch'; end if;
    select jsonb_agg(x || jsonb_build_object('weight', x -> 'input')) into parts from jsonb_array_elements(parts) x;
  end if;
  select sum(x.weight) into tot from jsonb_to_recordset(parts) as x(weight numeric);
  if tot is null or tot <= 0 then raise exception 'split_mismatch'; end if;

  if eid is null then
    insert into public.expenses (group_id, kind, title, amount_cents, currency, paid_by, spent_on, split, category, note, created_by, updated_by)
    values (gid, k, left(ttl, 120), amt, cur, payer, coalesce(nullif(p ->> 'spent_on', '')::date, current_date), mode,
            case when k = 'payment' then 'general' else coalesce(nullif(p ->> 'category', ''), 'general') end,
            nullif(left(btrim(coalesce(p ->> 'note', '')), 1000), ''), me, me)
    returning id into eid;
  else
    if old.deleted_at is not null then raise exception 'invalid' using errcode = '23514'; end if;
    update public.expenses set title = left(ttl, 120), amount_cents = amt, currency = cur, paid_by = payer,
      spent_on = coalesce(nullif(p ->> 'spent_on', '')::date, spent_on), split = mode,
      category = case when k = 'payment' then 'general' else coalesce(nullif(p ->> 'category', ''), category) end,
      note = nullif(left(btrim(coalesce(p ->> 'note', '')), 1000), ''), updated_by = me, updated_at = now()
    where id = eid;
    delete from public.expense_shares where expense_id = eid;
    perform app.audit('expense_updated', 'expense', eid, gid, jsonb_build_object('title', left(ttl, 120)));
  end if;

  insert into public.expense_shares (expense_id, profile_id, amount_cents, input)
  select eid, pid, base + case when rn <= amt - sum_base then 1 else 0 end, input from (
    select pid, input, base, sum(base) over () as sum_base, row_number() over (order by frac desc, ord) as rn from (
      select pid, ord, input, floor(amt * weight / tot)::bigint as base, amt * weight / tot - floor(amt * weight / tot) as frac
      from jsonb_to_recordset(parts) as x(pid uuid, ord int, input numeric, weight numeric)) a) b;

  -- Receipts: photos and PDFs from my own folder of the bucket, at most six per entry.
  if jsonb_typeof(p -> 'remove_files') = 'array' then
    delete from public.attachments where expense_id = eid and id in (select (jsonb_array_elements_text(p -> 'remove_files'))::uuid);
  end if;
  if jsonb_typeof(p -> 'files') = 'array' and jsonb_array_length(p -> 'files') > 0 then
    select auth_user_id::text into my_auth from public.profiles where id = me;
    for f in select * from jsonb_array_elements(p -> 'files') loop
      if (f ->> 'path') !~ '^[0-9a-f-]{36}/[0-9a-f]{32}\.[a-z0-9]{2,4}$' or split_part(f ->> 'path', '/', 1) <> my_auth then
        raise exception 'invalid' using errcode = '23514';
      end if;
      sz := coalesce((f ->> 'size')::int, 0);
      mt := f ->> 'mime';
      if to_regclass('storage.objects') is not null then
        execute 'select true, coalesce((metadata ->> ''size'')::int, 0), metadata ->> ''mimetype'' from storage.objects where bucket_id = ''files'' and name = $1'
          into found_obj, sz, mt using f ->> 'path';
        if not coalesce(found_obj, false) then raise exception 'invalid' using errcode = '23514'; end if;
      end if;
      if mt is null or not (mt = any (allowed)) or sz < 1 or sz > 10485760 then raise exception 'invalid' using errcode = '23514'; end if;
      insert into public.attachments (owner_id, expense_id, path, name, mime, size_bytes)
      values (me, eid, f ->> 'path', regexp_replace(left(btrim(coalesce(f ->> 'name', 'Beleg')), 160), '[\\/]', '_', 'g'), mt, sz);
    end loop;
  end if;
  select count(*) into files_n from public.attachments where expense_id = eid;
  if files_n > 6 then raise exception 'invalid' using errcode = '23514'; end if;

  -- New entries tell the people in it what their part is (not the one who wrote it down).
  if old.id is null then
    select display_name into my_name from public.profiles where id = me;
    for r in select s.profile_id, s.amount_cents from public.expense_shares s where s.expense_id = eid and s.profile_id <> me
             union select payer, 0 where payer <> me and k = 'payment' loop
      perform app.notify(r.profile_id, case when k = 'payment' then 'expense_payment' else 'expense_added' end, jsonb_build_object(
        'expense_id', eid, 'group_id', gid, 'slug', g.slug::text, 'group', g.name, 'conversation_id', g.conversation_id,
        'title', left(ttl, 120), 'name', my_name, 'amount_cents', amt, 'share_cents', r.amount_cents, 'currency', cur,
        'paid_by', payer));
    end loop;
  end if;
  return eid;
end $$;
grant execute on function app.save_expense(jsonb) to authenticated, hivevoice_server;

-- Delete (it stops counting, stays restorable) or restore an entry. Every member except guests may, like writing one.
create or replace function app.delete_expense(p_expense uuid, p_restore boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.uid(); e public.expenses; role public.group_role;
begin
  if me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into e from public.expenses where id = p_expense;
  if not found then raise exception 'not_found'; end if;
  role := app.group_role(e.group_id);
  if role is null or role = 'guest' then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_restore then
    update public.expenses set deleted_at = null, deleted_by = null where id = p_expense;
  else
    update public.expenses set deleted_at = now(), deleted_by = me where id = p_expense and deleted_at is null;
  end if;
  perform app.audit(case when p_restore then 'expense_restored' else 'expense_deleted' end, 'expense', p_expense, e.group_id,
                    jsonb_build_object('title', e.title, 'amount_cents', e.amount_cents, 'currency', e.currency));
end $$;
grant execute on function app.delete_expense(uuid, boolean) to authenticated, hivevoice_server;

-- ───────────────────── balances and who pays whom ─────────────────────
-- Per person and currency: what they paid minus their parts (positive: gets money back).
-- `settle`: the fewest payments that even everything out (largest debt to largest credit, repeated).
create or replace function app.expense_summary(p_group uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare cur text; ids uuid[]; nets bigint[]; i int; lo int; hi int; amt bigint; settle jsonb := '[]'::jsonb; bal jsonb;
begin
  if app.group_role(p_group) is null then raise exception 'forbidden' using errcode = '42501'; end if;
  with moves as (
    select e.currency, e.paid_by as pid, e.amount_cents as delta from public.expenses e where e.group_id = p_group and e.deleted_at is null
    union all
    select e.currency, s.profile_id, -s.amount_cents from public.expense_shares s join public.expenses e on e.id = s.expense_id
    where e.group_id = p_group and e.deleted_at is null
  ), nets as (select currency, pid, sum(delta)::bigint as net from moves group by 1, 2)
  select coalesce(jsonb_agg(jsonb_build_object('profile_id', n.pid, 'currency', n.currency, 'net', n.net,
           'name', pr.display_name, 'seed', pr.avatar_seed, 'path', pr.avatar_path) order by n.currency, n.net desc), '[]'::jsonb)
    into bal from nets n join public.profiles pr on pr.id = n.pid where n.net <> 0;

  for cur in select distinct b ->> 'currency' from jsonb_array_elements(bal) b loop
    select array_agg((b ->> 'profile_id')::uuid order by (b ->> 'profile_id')), array_agg((b ->> 'net')::bigint order by (b ->> 'profile_id'))
      into ids, nets from jsonb_array_elements(bal) b where b ->> 'currency' = cur;
    loop
      lo := null; hi := null;
      for i in 1 .. coalesce(array_length(ids, 1), 0) loop
        if nets[i] < 0 and (lo is null or nets[i] < nets[lo]) then lo := i; end if;
        if nets[i] > 0 and (hi is null or nets[i] > nets[hi]) then hi := i; end if;
      end loop;
      exit when lo is null or hi is null;
      amt := least(-nets[lo], nets[hi]);
      settle := settle || jsonb_build_object('from', ids[lo], 'to', ids[hi], 'currency', cur, 'amount', amt);
      nets[lo] := nets[lo] + amt; nets[hi] := nets[hi] - amt;
    end loop;
  end loop;
  return jsonb_build_object('balances', bal, 'settle', settle);
end $$;
grant execute on function app.expense_summary(uuid) to authenticated, hivevoice_server;

-- An account that goes away leaves its entries to "Gelöschtes Mitglied", so the book still adds up.
create or replace function app.trg_profile_expenses_gone() returns trigger
language plpgsql security definer set search_path = '' as $$
declare gone constant uuid := '00000000-0000-0000-0000-00000000dead';
begin
  if old.id = gone then return old; end if;
  update public.expenses set paid_by = gone where paid_by = old.id;
  insert into public.expense_shares (expense_id, profile_id, amount_cents, input)
    select expense_id, gone, amount_cents, input from public.expense_shares where profile_id = old.id
  on conflict (expense_id, profile_id) do update set amount_cents = public.expense_shares.amount_cents + excluded.amount_cents;
  delete from public.expense_shares where profile_id = old.id;
  return old;
end $$;
drop trigger if exists expenses_gone on public.profiles;
create trigger expenses_gone before delete on public.profiles for each row execute function app.trg_profile_expenses_gone();
