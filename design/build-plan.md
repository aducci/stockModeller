# Connectome — build plan

How we turn this design pack into running software. It follows the spec's own roadmap (M0–M4) and build order (the change log first, then the metamodel, then diagrams). This plan only says **how** and **in what order**. The pack says **what**.

## 0. Status

| Slice | State |
|---|---|
| 0.1 Workspace tooling | ✅ Done: npm workspaces, strict TypeScript, ESLint (module boundaries), Prettier, Vitest, GitHub Actions with PostgreSQL 16 |
| 0.2 `model` | ✅ Done: types, Zod change schemas (checked against the types), JSON Schema validation, ULIDs; drift tests against `design/05-structures` |
| 0.3 `db` | ✅ Done: `schema.sql` as migration 001, field versions and folder tombstones (002), row-level security everywhere (003); scenario-aware reads; commit path with per-repository serialisation; metamodel install and load |
| 0.4 `engine` v0 | ✅ Done: every edit type in `changes.ts`, essential rules 1–9, per-property conflicts, an exact inverse per edit (property-tested), Essentials compiled from the package |
| 0.5 `server` | ✅ Done: Fastify app (`apps/server`): `POST …/changes` (idempotent, preview), `GET …/changes?since=`, undo, scenario-aware reads of folders, objects (with a `type:`/`folder:` query subset and paging), relationships, diagrams, occurrences and history; repositories and scenarios; problem+json errors; development sign-in; per-repository resolution cache checked against the sequence; responses checked against `openapi.yaml` |
| 0.6 Live updates | ✅ Done: WebSocket `/api/v1/live` with catch-up from `?since=` (or `resync`), commits fanned out between instances by `LISTEN/NOTIFY` (one read per instance and repository, in sequence order, filtered to the scenario and its ancestors), submit and rejections over the socket, presence shared between instances and expiring, short-lived tickets for browsers. Exit test: a commit reaches the other client in < 300 ms, also across two instances |
| 0.7a Client store | ✅ Done: `GET …/snapshot` (engine rows + metamodel, B16); `packages/client` (no UI): `ModelStore` applies edits at once with the shared engine, keeps them pending, replays every committed change in sequence order and rebases pending changes on top (reverting the rows they touched); a change it cannot reproduce makes it reload (B17). `LiveSession`: snapshot, ticket, live connection, resend after reconnect, pause after 2 minutes offline, presence. Tested against the concurrency table, random three-user interleavings (every store ends with exactly the server's rows) and a real server |
| 0.7b Web app shell | ✅ Done: `apps/web` (React, Vite, Zustand) on `@connectome/client`: development sign-in, repository list, top bar (scenario picker, presence, "All changes saved" / "Reconnecting…"), explorer (Folders tab with filter, new folder and object), centre tabs (object page, read-only diagram view, change dot), properties panel (typed editors per property type, tags, relationships, "occurs on"), a toast with Undo for every edit. Playwright: edits show at once and survive a reload, two users see each other, undo, a refused edit explained |
| 0.8 Diagram editor | ✅ Done: the read-only view became an editor (SVG): palette of the types the diagram shows (drop, name, Enter; Esc creates nothing), drag an object from the explorer for another occurrence (repeats flash, ×N marker, sibling outline), connect from a handle with the relationship types the rules allow (existing relationships first, then most used), move on an 8 px grid, `Delete` removes from the diagram (toast offers Delete object), `Shift+Delete` deletes the object after a dialog listing what goes with it, `F2` / double-click renames. Exit test: Playwright with two browsers, one renames while the other is dragging, both changes survive a reload |
| 0.8b Explorer menus, drag and drop, groups | Planned (plan awaiting OK) |
| 0.9 History panel | Next |
| Sem-1 Semantic metamodel | ✅ Done: 14 semantic kinds on relationship types (`semantic`, `semanticDirection`), categories and levels on object types, the core package (`semantic.level`, `access.mode`, `influence.effect`, `interaction.*`) merged into every metamodel with its keys reserved, Essentials 1.1.0 (every type classified; `service`, `interface`, `composedOf`, `represents`, `calls`, `triggers`, `specialises`), kind checks when a metamodel compiles, fixed levels enforced, and the properties panel grouping relationships by kind |
| Sem-2 to Sem-4 Semantics | Next: [semantics §11](02-model/semantics.md#11-what-changes-in-the-build) (containment, flows and interactions, navigation and trace) |

Decisions taken on the way: [decision-log.md](decision-log.md#found-while-building-m0) (B1–B20) and [storage.md §7](03-platform/storage.md#7-additions-made-while-building).

The original 3D demo in this repository was removed; the repository now holds only Connectome.

## 1. Repository layout (npm workspaces, TypeScript everywhere)

```
/apps
  web/          React + Vite + Zustand: workbench, diagram renderer (SVG), catalogues   (0.7)
  server/       Fastify. Starts as role=web or role=worker (one image, ADR-002)         (0.5)
/packages
  model/        types from 05-structures + Zod schemas + JSON Schema validation
  engine/       the change engine: pure functions (state, change) → (new state, log rows) | rejection
  db/           schema.sql as migrations, Kysely types, scenario-aware read helpers, RLS session setup
  query/        query-language parser → AST → SQL (from M1)
  client/       the browser's store and live session: optimistic edits, rebase, reconnect (no UI)       (0.7)
  sdk/          TypeScript SDK generated from openapi.yaml + connect()/change() helpers (M2)
  content/      packages as JSON: Essentials first (example-metamodel.json)
/design         this design pack (source of truth; changes to the design are made here first)
```

Why the engine is a separate, pure package: the spec makes the change engine the only writer and puts every rule in it. Keeping it free of I/O means:
- the server runs it inside a database transaction;
- the browser runs the same code for optimistic apply and rebase;
- tests run in milliseconds, using the example repository as a fixture.

Module boundaries are enforced with an ESLint `no-restricted-imports` rule (ADR-002 asks for this).

## 2. Milestones

### M0 Skeleton (spec: 6 weeks). Exit: two browsers edit one diagram; history shows both changes

| # | Slice | Done when |
|---|---|---|
| 0.1 | Workspace tooling: npm workspaces, `tsc --strict`, ESLint, Prettier, Vitest, CI (GitHub Actions with a Postgres 16 service) | `npm test` runs green in CI |
| 0.2 | `model`: port `model.ts` and `changes.ts`; Zod schemas; validate the example JSONs against the JSON Schemas in a test | Spec examples pass validation; the reference check (every type and id used exists) passes |
| 0.3 | `db`: load `schema.sql` as migration 001; RLS session variable (`app.workspace_id`); the scenario read pattern (storage §3) as a helper | An integration test reads a scenario overlay correctly; a cross-tenant test reads 0 rows |
| 0.4 | `engine` v0: edits for folders, objects, relationships, diagrams and occurrences; inverses for every edit; per-property version checks; essential rules 1–9 from overview §3 (no metamodel editor yet: the types come from Essentials) | Unit tests per rule and per row of the concurrency table in collaboration §2 |
| 0.5 | `server`: `POST /changes` (idempotent on the change id), `GET /changes?since=`, `GET` for folders, objects and diagrams; per-repository serialisation (advisory lock + `repository.seq`) | The API example in api.md §3 returns 201 with seq and versions |
| 0.6 | Live updates: WebSocket `/live`, fan-out via `LISTEN/NOTIFY`, resync from a seq, presence (in memory) | Two clients see each other's commits in under 300 ms locally |
| 0.7 | `web`: workbench shell (top bar, explorer with folders, tabs, properties panel), local store with pending changes and rebase | Edits show at once and survive a reload |
| 0.8 | `web`: diagram editor v0: palette, add an object, add an existing object (repeats allowed), connect (choose from the allowed relationship types), move, Delete vs Shift+Delete, rename | **Exit criterion**: validation scenario 4 (one user renames while another moves) passes in a Playwright test with two browsers |
| 0.9 | History panel (activity feed + item history) from `change_log` | Both edits from 0.8 appear with who and when |

Sign-in in M0: a dev-only stub user. OIDC arrives in M1.

### M1 Modeller (12 weeks). Exit: a pilot maps a 300-application landscape

Grouped into four streams that can overlap:
1. **Metamodel**: metamodel editor UI; type inheritance; package install (Essentials under its prefix); relationship and nesting rules (`block`/`warn`); breaking-edit migrations with preview.
2. **Diagrams**: diagram types (symbols, colour rules from value lists, labels, legend); nesting by placement; grid and nested auto-layout (ELK.js in a Web Worker); repeat markers (×N, sibling outline).
3. **Data**: catalogues (TanStack Table, live and editable); query-language parser v1; search (trigram + full text, ⌘K); XLSX import/export with preview; ArchiMate exchange import/export through the package mapping.
4. **Platform**: OIDC sign-in; roles (admin/modeller/viewer); folder permissions with "restricted" symbols; comments.

Exit test: validation scenario 1 (import 300 apps, link them to capabilities, open the landscape). The matrix and generated diagrams in that scenario are M3; M1 uses a catalogue and a manually drawn diagram instead.

### M2 Launch (8 weeks). Exit: 10 users, 4 weeks, no data incidents; cost within budget

Undo/redo from inverses; restore a version and "as of"; annotations; PNG/SVG export; public API + webhooks + TypeScript and Python SDKs (generated from `openapi.yaml`); multi-tenant guards (rate limits, statement timeouts, fair job queue with pg-boss, per-workspace metrics); performance pass at 50k objects against the budgets in architecture §7; deployment (container + managed Postgres in an EU region + S3).

### M3 / M4

As in features-and-roadmap.md. Two things are built in from M0 so these phases need no retrofit: scenario-aware reads, and a change log that can hold change requests.

## 3. Testing strategy

| Layer | How |
|---|---|
| Spec conformance | The examples in `05-structures/` are test fixtures. If the spec changes, the tests change with it |
| Engine | Table-driven unit tests: one case per rule and per concurrency row; property-based tests that apply a change and then its inverse and expect the original state |
| Database | Integration tests against a real Postgres 16: scenario reads, RLS isolation on every table, seq ordering under concurrent writers |
| API | Contract tests against `openapi.yaml` |
| End to end | Playwright with two browser contexts for the collaboration scenarios |
| Performance | A seeded 50k-object repository; budgets from architecture §7 checked in CI from M2 |

## 4. Risks to settle early

| Risk | Plan |
|---|---|
| Optimistic apply + rebase in the browser is the hardest part of M0 | Share the engine package between browser and server so both sides run identical logic; build 0.4 before any UI |
| The diagram editor can eat the schedule | Use SVG only (the spec allows SVG up to 2,000 occurrences); canvas rendering and culling wait until performance tests need them |
| JSONB property validation is the engine's job (ADR-006) | Validators are generated from the metamodel and cached per metamodel version |
| Spec gaps found while building | Fix them in `design/` in the same PR, and add an ADR when a decision changes |

## 5. Decisions taken before coding started

1. **Where to build:** this repository; the 3D demo was removed.
2. **Package manager:** npm workspaces.
3. **First step:** M0 slices 0.1–0.4.
