<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## HiveVoice conventions

- Schema and business logic live in SQL under `supabase/migrations/` (apply with `npm run db:migrate`). Never edit an applied migration; add a new one.
- Server code queries Postgres with `postgres.js` through `asViewer()` (src/lib/db.ts) so row level security applies. Trusted calls (`app.cast_vote`, admin) use `sql` directly.
- UI text comes from `messages/<lang>/<namespace>.json` (de, en, ls = Leichte Sprache overrides). Run `npm run messages` after adding a namespace.
- Design: Swiss style tokens in `src/app/globals.css` (paper, ink, red, line); square corners, no shadows. Shared classes in `src/components/ui/styles.ts`.
- Tests: `npm run test` (DB, rolled back) and `npm run test:e2e`.
