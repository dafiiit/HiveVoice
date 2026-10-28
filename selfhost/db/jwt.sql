-- From supabase/docker (Apache-2.0): how long a login token lasts, for the database's own checks.
\set jwt_exp `echo "$JWT_EXP"`

ALTER DATABASE postgres SET "app.settings.jwt_exp" TO :'jwt_exp';
