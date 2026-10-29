-- The look follows the device by default (dark when the phone or computer is dark), as most apps do. 007 had made light the
-- default and set everybody to light; those settings were never chosen by anyone, so they follow the device too now. Who
-- wants light regardless picks it again under Einstellungen → Darstellung.
alter table public.user_settings alter column theme set default 'system';
update public.user_settings set theme = 'system' where theme = 'light';
