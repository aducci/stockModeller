# Connectome

An online, object-based architecture modelling tool. Teams model the organisation as **objects** connected by **relationships**, stored once in a shared **repository**. **Diagrams** and **catalogues** are views of those objects, never separate drawings.

The product and technical design lives in [`design/`](design/README.md) and is the source of truth. How it is being built, and where the build stands, is in [`design/build-plan.md`](design/build-plan.md).

## Status

Milestone **M0 (Skeleton)**, slices 0.1–0.6 and 0.7a are done: the model types, the change engine, the database layer, the REST API, live updates over WebSocket, and the browser's store (optimistic edits and rebase). The web app's screens come next.

## Layout

| Path                                   | What it is                                                                                                                                                                                                                 |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`design/`](design/)                   | Design pack: vision, model, platform, UX, structures, decisions                                                                                                                                                            |
| [`packages/model`](packages/model)     | Shared types (`ModelObject`, `Change`, `Edit`…), Zod schemas for changes, JSON Schema validation for packages, ULIDs                                                                                                       |
| [`packages/content`](packages/content) | Ready-made metamodel packages; Essentials ships first                                                                                                                                                                      |
| [`packages/engine`](packages/engine)   | The change engine: applies a change atomically, enforces the model's rules and per-property conflicts, and records an inverse for every edit. Pure TypeScript with no I/O, so the server and the browser run the same code |
| [`packages/db`](packages/db)           | PostgreSQL: migrations, row-level security per workspace, scenario-aware reads, and the commit path (change log + rows + sequence in one transaction)                                                                      |
| [`packages/client`](packages/client)   | The web app's store and live session: edits show at once (same engine as the server), stay pending until confirmed, and are rebased over other people's changes. No UI                                                     |

Module boundaries are enforced by ESLint (`eslint.config.js`): `model` imports nothing, `engine` only `model`, `db` and `client` only `model` and `engine`; the server may use them all.

## Development

You need Node 22 and, for the database tests, PostgreSQL 16.

```sh
npm install
npm run check          # format check, lint, typecheck, tests
```

Unit tests run without a database. To run the database tests too, point `DATABASE_URL` at a PostgreSQL 16 server where the tests may create and drop throwaway databases:

```sh
docker compose up -d   # or use any local PostgreSQL 16
export DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres
npm test
```

| Script                            | Does                                                                     |
| --------------------------------- | ------------------------------------------------------------------------ |
| `npm test`                        | Vitest, all packages (database tests are skipped without `DATABASE_URL`) |
| `npm run typecheck`               | `tsc` in strict mode over every package                                  |
| `npm run lint` / `npm run format` | ESLint / Prettier                                                        |
| `npm run db:migrate`              | Applies pending migrations to `$DATABASE_URL`                            |

## License

GPL-3.0. See [LICENSE](LICENSE).
