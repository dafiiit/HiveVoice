-- Follow-up to stage 2: "clear chat" uses the real clock (a transaction's now() can lie behind a message that was just written).
create or replace function app.hide_conversation(p_conversation uuid) returns void
language sql security definer set search_path = '' as $$
  update public.conversation_participants set hidden_at = clock_timestamp(), last_read_at = clock_timestamp()
   where conversation_id = p_conversation and profile_id = app.uid()
$$;
