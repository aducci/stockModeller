# Connectome — notes for Claude

- The design pack in `design/` is the source of truth. Read `design/02-model/overview.md` first, then `design/build-plan.md` for where the build stands.
- If the build finds a gap in the spec, fix it in `design/` in the same change: storage and edit additions go in `design/03-platform/storage.md` §7, open product questions in `design/decision-log.md`.
- Drift tests keep copies identical to the design pack: `packages/model/schemas/*.json`, `packages/content/essentials/*.json`, `packages/model/src/changes.ts` (everything from its first `import`) and `packages/db/migrations/001_initial_schema.sql`. Change both sides together.
- Every write goes through the change engine (`packages/engine/src/apply.ts`). Each edit must record an exact inverse: the property test in `packages/engine/test/inverse.test.ts` checks this, round-tripping the inverses through JSON as the database does.
- The engine is pure (no I/O). ESLint enforces the package boundaries in `eslint.config.js`.
- API responses are checked against `design/03-platform/openapi.yaml` in `apps/server/test`; new endpoints go into that file too.

## Commands

- `npm run check`: format check, lint, typecheck and tests. Run it before committing.
- Database tests need `DATABASE_URL` (a PostgreSQL 16 server where tests may create databases); without it they are skipped. In a cloud session: `pg_ctlcluster 16 main start`, and the URL is `postgres://postgres:postgres@localhost:5432/postgres` once the postgres password is set.
- `npm run e2e`: Playwright against the built web app, a fresh database and the server (needs `DATABASE_URL`). In a cloud session, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium` instead of installing browsers.
- `apps/web` has its own `tsconfig.json` (DOM and JSX); the root `npm run typecheck` runs both.
