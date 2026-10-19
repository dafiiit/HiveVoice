-- Rights, stage 3 (part 1): new enum values must be committed before they can be used.
alter type public.visibility add value if not exists 'secret';
alter type public.join_policy add value if not exists 'invite';
