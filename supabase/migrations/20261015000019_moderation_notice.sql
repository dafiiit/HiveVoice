-- The notice about a removed post names the group so the link works.
create or replace function app.moderate_post(p_post uuid, p_action text, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.uid(); p public.posts;
begin
  select * into p from public.posts where id = p_post;
  if not found then raise exception 'not_found'; end if;
  if p.group_id is null or not app.is_group_moderator(p.group_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  case p_action
    when 'remove' then
      -- the text goes (the group's admins can still read it in the log), the post stays as a visible gap
      update public.posts set body = '', hidden_at = now(), hidden_by = me, hidden_reason = nullif(left(trim(coalesce(p_reason, '')), 300), '') where id = p_post;
      delete from public.attachments where post_id = p_post;
      delete from public.polls where post_id = p_post;
      if p.author_id <> me then
        perform app.notify(p.author_id, 'post_removed', jsonb_build_object('group_id', p.group_id, 'slug', (select slug::text from public.groups where id = p.group_id), 'group', (select name from public.groups where id = p.group_id), 'reason', nullif(left(trim(coalesce(p_reason, '')), 300), '')));
      end if;
    when 'pin' then update public.posts set is_pinned = true where id = p_post;
    when 'unpin' then update public.posts set is_pinned = false where id = p_post;
    when 'lock' then update public.posts set locked = true where id = p_post;
    when 'unlock' then update public.posts set locked = false where id = p_post;
    else raise exception 'invalid' using errcode = '23514';
  end case;
  perform app.audit('post_' || p_action, 'post', p_post, p.group_id, jsonb_build_object('reason', p_reason, 'was', case when p_action = 'remove' then p.body end));
end $$;
