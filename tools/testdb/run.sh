#!/usr/bin/env bash
# The tests against a database of their own instead of the live one: same Postgres, login and migrations as production, no
# real data, no daily limits of the test account, nothing that disturbs anybody else (docs/debugging.md).
#
#   npm run test:local             starts it, applies the migrations, runs all of `vitest`
#   npm run test:local -- tests/db.test.ts -t calendar
#   npm run testdb:down            removes it and its data
set -euo pipefail
cd "$(dirname "$0")/../.."
compose() { docker compose -p hivevoice-test --env-file tools/testdb/test.env -f selfhost/compose.yml -f tools/testdb/override.yml "$@"; }

if [ "${1:-}" = "--down" ]; then compose down -v; exit 0; fi

compose up -d --wait db auth storage
compose exec -T db psql -v ON_ERROR_STOP=1 -U postgres -d postgres -q <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'hivevoice_app') then
    create role hivevoice_app login noinherit password 'hivevoice-test';
  end if;
end $$;
SQL
MIGRATION_MODE=direct MIGRATION_DATABASE_URL='postgres://postgres:hivevoice-test@localhost:54329/postgres?sslmode=disable' node scripts/migrate.mjs | grep -v '^skip' || true
compose exec -T db psql -v ON_ERROR_STOP=1 -U postgres -d postgres -q -c "grant hivevoice_server to hivevoice_app with inherit true, set true;"
compose exec -T db psql -v ON_ERROR_STOP=1 -U postgres -d postgres -q < tools/testdb/regions.sql
DATABASE_URL='postgres://hivevoice_app:hivevoice-test@localhost:54329/postgres?sslmode=disable' npx vitest run "$@"
