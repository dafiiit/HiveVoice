-- The server no longer calls app.admin_grant, but the database tests (which connect as the
-- server) use it to set up admins. Taking it away protects nothing: app.sync_server_admins
-- is just as powerful.
grant execute on function app.admin_grant(uuid, boolean) to hivevoice_server;
