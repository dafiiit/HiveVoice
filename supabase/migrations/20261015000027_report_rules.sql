-- Rights, stage 7 (part 1): more reasons for a report. New enum values can only be used in a later migration.
alter type public.report_rule add value if not exists 'illegal';
alter type public.report_rule add value if not exists 'child_safety';
alter type public.report_rule add value if not exists 'harassment';
