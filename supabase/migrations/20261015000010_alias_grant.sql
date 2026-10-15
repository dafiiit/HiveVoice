-- "Neu würfeln" in the onboarding calls app.random_alias(), which no role was allowed to execute.
grant execute on function app.random_alias() to authenticated, hivevoice_server;
