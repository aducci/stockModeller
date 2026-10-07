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
| 0.8b Explorer menus, drag and drop, groups | ✅ Built (PR #10): File menu in the top bar and a right-click menu in the explorer (new, rename, delete, groups), see workbench.md "Menus"; drag and drop in the explorer that reorders (stored `rank`, edit `setRank`, migration 005, B21) and moves folders, diagrams and objects, contains objects (Alt+drop picks the type) and adds objects to groups (Essentials 1.2.0 `group` + `groups`, B22). Playwright: reorder, move, refuse, reload, undo, group, Alt+drop |
| 0.9 History panel | Next |
| P-1 Properties panel | ✅ Built: one generic inspector for objects, relationships, diagrams and folders (workbench.md "Properties panel"): compact header with the description (new edit `setDescription`), filter, Hide empty, collapsible sections with filled/total, a resizable two-column grid and an editor registry chosen by the property type or its new `editor` hint (B23): rating pips, segmented radio, switch, chips, dropdown with colours. Playwright: describe, rate, clear, filter, hide empty, collapsed sections survive a reload |
| P-2 Property sets and tool windows | ✅ Built: property sets (shared on object types in the package, B25; my sets in the browser), the dock of tabbed tool windows (Properties above Relations), the Relationships tab with views (by meaning, by object, flows 2 steps, dependencies n steps, structure) and a filter, Trace, Occurs on with ×N and *Add to open diagram*, links shown as links (Essentials 1.4.0 `documentation.link`). Playwright: sets, my sets, link, views, occurs on |
| P-3 Confirmations | ✅ Built: Review mode in the properties panel (a confirmation column, "n to confirm this quarter", Confirm all shown; a value set while reviewing is confirmed in the same change), edits `confirmProperties` / `setConfirmations` with exact inverses, `confirmations` on objects (migration 007), B26. Playwright: confirm one, confirm all, a changed value is due again, reload |
| N-1 Notation from semantics | ✅ Built: the default glyph set (27 stroke-only paths on a 16×16 grid, one SVG sprite, one `<use>` per icon), glyph and hue per semantic category, line notation per semantic kind (dashes, arrowheads, the interaction marker), glyphs in the explorer, the palette and on diagram symbols, and Essentials 1.3.0 with its hand-set lines and fills removed so it draws from its semantics ([notation](02-model/notation-and-metamodel-admin.md) §2–3) |
| N-2 Renditions and semantic zoom | ✅ Built: an occurrence can be a box, card, glyph, chip or container (right-click › Show as, or `R`), switching is one change with one undo, the editor zooms 25–200 %, and below 40 % (or a diagram type's own levels) occurrences draw as glyphs with readable names ([notation](02-model/notation-and-metamodel-admin.md) §4) |
| A-1 Metamodel administration | ✅ Built: a Metamodel menu and tab with Types, a connection matrix (click a cell to tick relationship types, block or warn), rule sentences (add, remove, filter, usage counts) and Try a connection (what the connect menu offers, nesting, why a pair is refused), over one draft of the relationship rules; *Review and publish* shows what existing relationships the new rules refuse, then publishes the next metamodel version (`PUT …/metamodel/relationship-rules`), which every open session picks up ([notation](02-model/notation-and-metamodel-admin.md) §10.6). Playwright: add a rule in the matrix, review, publish, a second browser sees the new version; refusal explained; discard |
| V-1 View framework and matrix | ✅ Built: diagram-type `kind` (`canvas`, `matrix`) and `matrix` defaults, diagram `definition` and the edit `setViewDefinition` (migration 009, B30), the pure package `packages/views` (structured scopes, `projectMatrix`), the centre tab choosing a renderer by kind, the matrix view (rows and columns by type, relationships by type or kind and direction, create and delete from a cell, group rows by containment, swap, hide empty, totals, B31) on the grid shared with the connection matrix, canvases only for occurrences (B29), the Essentials *Capability × application matrix* type. A new matrix is made with *New diagram* and that type. Not yet: the component registry (moves to V-2), rows and columns chosen by path in the toolbar (the definition supports `steps`), virtualised cells and keyboard navigation |
| V-2 Document core | ✅ Built: the `document` kind and template (`subject`, `sections`, B32), the component registry with `heading`, `prose` (mentions and creating elements from the text, B34), `facts`, `diagramLink` (create with the subject in the middle, link existing, live preview, *Open*) and `relationTable` (rows from a linked diagram's connectors or the subject's relationships, cells edited in place, *to describe*, the missing banner, *+ Add* placed on the diagram, B35), completeness in the header, relationship properties edited in tables through A-1b's `setRelationshipProperties` (B36), right-click an object › *New › High-level design*; Essentials *Context diagram* and *High-level design* types. Not yet: patterns, locks and regions (V-4), the designer (V-5), per-row sequences (V-3), export (V-8) |
| V-3 Sequence view | ✅ Built: the `sequence` kind, the message `step` on occurrences (migration 010) and the edit `setMessageStep` (B37), `projectSequence` in `packages/views` (lanes by `x`, messages by step, activation bars paired per interaction, B39), the sequence view (add lifelines, reorder or remove them, drag between lanes or *Add message*: an existing undrawn message, a new request or response in an interaction, a new interaction with its request, or a plain flow; *Add response*; move up and down; *Add N existing messages*; the steps table), and the per-row *Sequence* column of the HLD integrations table that creates the sequence for an interaction (B38); the Essentials *Sequence diagram* type. Not yet: fragments, self-calls, payload drop on a message, *Show as canvas* |
| V-4…V-8 Views and design artifacts | Proposed: patterns, template designer, list and specification views, RACI and CRUD, export ([views](02-model/views-and-design-artifacts.md) §8, §11) |
| A-1b Property administration | ✅ Built: a Properties view in the Metamodel tab (property types by group; name, group, data type, unit, editor, required, help; list values with colours and order; *Used by* across object, relationship and diagram types) and an editable Types view (a type's own, inherited and built-in properties; add, remove, create). The whole metamodel is one draft, published with `PUT …/metamodel` after a schema, compile and impact check (types in use, data types with values and list values in use cannot be removed or changed). Relationships and diagrams get editable properties (`setRelationshipProperties`, `setDiagramProperties`, migration 008), and the panel lists values a type no longer carries under *Not on this type* ([notation](02-model/notation-and-metamodel-admin.md) §10.6b). Playwright: two new properties published and shown in a second browser's open panel; a list property on a diagram; a property taken away, its value kept and cleared |
| Sem-1 Semantic metamodel | ✅ Done: 14 semantic kinds on relationship types (`semantic`, `semanticDirection`), categories and levels on object types, the core package (`semantic.level`, `access.mode`, `influence.effect`, `interaction.*`) merged into every metamodel with its keys reserved, Essentials 1.1.0 (every type classified; `service`, `interface`, `composedOf`, `represents`, `calls`, `triggers`, `specialises`), kind checks when a metamodel compiles, fixed levels enforced, and the properties panel grouping relationships by kind |
| Sem-2 Containment | ✅ Done: one container per object across all containment types, folder follows container (moves cascade to contents, a content cannot leave its container's folder alone), re-parenting reconnects the same relationship, `deleteObject.contents` (`moveUp` by default, or `deleteContents`), composition `cascadeDelete`, the `changeRelationshipType` edit; the explorer shows contents under their container and accepts drops onto objects (contain) and folders (take out); drawing a containment line on a nested diagram nests the content; the delete dialog asks what happens to the contents. The Alt+drop type menu waits for the explorer slice |
| Sem-3 Flows and interactions | ✅ Done: relationship `payload`, `parentId` and `rank` (migration 006, GIN-indexed payload), relationship-type `payload` (`none`/`optional`/`expected`), the `setPayload` edit; deleting an object takes it out of every payload, an interaction's messages stay on its two objects, follow it when it is reconnected and are deleted with it (all with exact inverses); Essentials lets flows run between applications and interfaces, and the application landscape shows interfaces and *calls*; the properties panel selects relationships, edits payloads and adds requests and responses; diagrams label flows with their payload and interactions with ⇄, draw parallel lines side by side, take an object dropped on a line as payload, and give a new interaction its request. Not yet: expanding an interaction into message lines on a diagram, Alt+drop to replace a payload, and editing relationship properties (`setProperties` covers objects only), so `interaction.operation` is set through the API for now |
| Sem-4 Navigation and trace | ✅ Done: `packages/semantics` with traces by meaning (`levels`, `flow`, `payload`, `dependency`, forward and backward, optionally across contents) answering the framework's §6 and §14 examples in a test; `GET …/objects/{id}/trace`; `category:` and `level:` query filters; a Trace section in the properties panel that lays the result out by level and highlights it on diagrams; explorer semantic groups under each object (on demand, with references). Not yet: query paths by kind (`-@flow->`) need M1's query parser; **Trace ▸** in the right-click menus, *Add to diagram* for traced objects not on the diagram, the Hierarchies tab and the Structure view follow with the next workbench slice |

Decisions taken on the way: [decision-log.md](decision-log.md#found-while-building-m0) (B1–B22) and [storage.md §7](03-platform/storage.md#7-additions-made-while-building).

The original 3D demo in this repository was removed; the repository now holds only Connectome.

## 1. Repository layout (npm workspaces, TypeScript everywhere)

```
/apps
  web/          React + Vite + Zustand: workbench, diagram renderer (SVG), catalogues   (0.7)
  server/       Fastify. Starts as role=web or role=worker (one image, ADR-002)         (0.5)
/packages
  model/        types from 05-structures + Zod schemas + JSON Schema validation
  engine/       the change engine: pure functions (state, change) → (new state, log rows) | rejection
  semantics/    traces and other graph logic by semantic kind; pure, over the engine's rows        (Sem-4)
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
