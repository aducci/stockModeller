# Storage

DDL: [schema.sql](schema.sql). It is tested on PostgreSQL 16, including the scenario lookup below.

## 1. Principles

1. **Current state + change log.** Tables hold the current state for fast reads. `change_log` holds every edit ever made, with its inverse. History, undo, audit and catch-up all come from the log, which is append-only.
2. **Tables follow the vocabulary:**
   - `object_type`, `relationship_type`, `property_type`, `diagram_type`;
   - `folder`, `object`, `relationship`;
   - `diagram`, `object_occurrence`, `relationship_occurrence`, `annotation`;
   - `catalogue`.
3. **Property values in JSONB**, validated by the change engine against the metamodel ([ADR-006](../06-decisions/ADR-006-property-values-jsonb.md)).
4. **Scenarios as overlay rows.** Model rows carry a `scenario_id`. Baseline rows are the base; a scenario row with the same `id` overrides it, or hides it with `deleted = true`.
5. **Diagrams store only references and layout.** Occurrences point to objects and relationships; nothing about the object is copied.

## 2. Tables

| Group | Tables |
|---|---|
| Accounts | `workspace`, `app_user`, `membership`, `user_group`, `group_member` |
| Repository | `repository`, `scenario`, `folder` |
| Metamodel | `object_type`, `relationship_type`, `property_type`, `value_list`, `rule`, `diagram_type` |
| Model | `object`, `relationship` |
| Views | `diagram`, `object_occurrence`, `relationship_occurrence`, `annotation`, `catalogue`, `saved_query`, `dashboard` |
| Changes | `change`, `change_log`, `change_request` |
| Collaboration | `comment`, `attachment`, `rule_finding` |
| Security | `access_grant`, `secret` |
| Automation | `automation`, `automation_run` |

Scenario-aware tables (they carry `scenario_id`):
- `object`, `relationship`;
- `diagram`, `object_occurrence`, `relationship_occurrence`, `annotation`.

So a scenario can change a picture as well as the model.

## 3. Reading a scenario

The ancestry of a scenario is known and short (≤ 3): nearest first.

```sql
SELECT * FROM (
  SELECT DISTINCT ON (o.id) o.*
  FROM object o
  JOIN unnest(:ancestry::text[]) WITH ORDINALITY a(scenario_id, depth) ON o.scenario_id = a.scenario_id
  WHERE o.repository_id = :repo
  ORDER BY o.id, a.depth            -- the nearest scenario's row wins
) r
WHERE NOT r.deleted;
```

- The same pattern applies to every scenario-aware table.
- Large repositories keep a per-scenario resolution cache, refreshed from the change log.
- The first edit of an object in a scenario copies its current row into that scenario and records `base_version`, which merge uses to detect conflicts.

## 4. The change log

One row per edit, storing the edit and its inverse:

```json
{ "edit": "setProperties", "id": "01J…", "set": { "lifecycle.status": "retired" },
  "inverse": { "edit": "setProperties", "id": "01J…", "set": { "lifecycle.status": "active" } } }
```

Undo or revert = a new change built from inverses. Edit types: [05-structures/changes.ts](../05-structures/changes.ts).

## 5. Key indexes

| Index | Serves |
|---|---|
| `object (repository, scenario, type)`, `(…, folder)` | Palettes, explorer, folder listings |
| `relationship (…, source)`, `(…, target)` | Traversal, impact, hierarchies |
| `object` GIN on `properties` | Property filters |
| `object` trigram on name + full text on name/description | Search |
| `object_occurrence (object_id)` | "Occurs on…", clean-up on delete |
| `change_log (repository, seq)`, `(repository, item_id, seq)` | Catch-up, per-item history |

## 6. Retention

- The change log is kept in full (it is the audit trail). After 18 months it moves to object storage (Parquet), still exportable.
- Nightly snapshots of each repository's baseline go to object storage for fast restore and analytics.

## 7. Additions made while building

Found while building the change engine (M0 slices 0.2–0.4). `schema.sql` stays the baseline (migration 001); these are later migrations in `packages/db/migrations/`.

| Addition | Why |
|---|---|
| `field_versions jsonb` on `object`, `relationship`, `diagram` (migration 002) | Per-property conflict checks need to know which version last changed each field and who changed it: `{ "name": {"v": 4, "by": "01J…"}, "*": {"v": 1, "by": "…"} }`. `"*"` covers every field and is written on create and restore |
| `folder.deleted` + a unique index over live folder names only (migration 002) | Deleted objects and diagrams are kept as tombstones, so versions keep rising when they are restored. Tombstones still name their folder, so folders are tombstoned too |
| Row-level security on **every** table with `workspace_id`, forced for table owners; `workspace` by `id`; `group_member` through its group; role `connectome_app` (migration 003) | `schema.sql` showed the pattern on `object` only. `app_user` stays global (one person, many workspaces) |
| Package-level `layers` and `exchangeMappings` are kept in `repository.settings.metamodel` | No table holds them yet |
| `change.outcome jsonb` (migration 004) | Resending a change id returns its original outcome (versions and findings), as api.md §1 promises |
| `change.committed_at` equals the `updatedAt` the change stamps on its rows | The server passes one timestamp to the engine and to the commit, so a browser replaying a committed change (with its `committedAt`) produces exactly the rows the server stored (decision B17) |
| `change_log.inverse` holds a **list** of edits | One edit can cascade (deleting an object deletes its relationships and occurrences). Undo applies each entry's list, last entry first |
| `relationship.payload text[]` (GIN index), `relationship.parent_id` (index) and `relationship.rank` (migration 006; slice Sem-3) | Payloads and interaction messages ([semantics §5–§6](../02-model/semantics.md#5-relationships-carry-meaning-payloads)). The engine indexes payloads both ways, so deleting an object finds the relationships that carry it |
| Relationship-type `semantic`, `semanticDirection`, `cascadeDelete` and `payload`, object-type `category`, `level` and `levelFixed` are kept in `definition` (no migration; slice Sem-1) | They are definition fields like `verb` and `symbol`. The core package is never stored: every compile merges it in |
| `rank text` on `folder`, `object` and `diagram` (migration 005; slice 0.8b) | The explorer's order. A fractional-index key, so placing an item between two others rewrites one row; `NULL` (absent in the API) sorts after ranked siblings, by name. An object's siblings are its folder's root objects, or its container's contents (semantics §3) |

Edit types added in [changes.ts](../05-structures/changes.ts) (marked `build:`):

| Edit | Change |
|---|---|
| `removeAnnotation` | New: annotations could be added and updated but not removed |
| `styleOccurrence` | A style value of `null` removes that override, so every style edit has an exact inverse |
| `createRelationship` | Optional `tags`, `externalIds`, so restoring a deleted relationship is exact |
| `createDiagram` | Optional `description`, for the same reason |
| `changeRelationshipType` | New (slice Sem-2). Besides `propertyMap` it takes `set`: the inverse puts back the values the change dropped, which `changeObjectType`'s inverse does through a separate `setProperties` |
| `setPayload` | New (slice Sem-3): replaces what a relationship carries |
| `createRelationship` | Optional `payload`, `parentId` and `rank` (slice Sem-3); a message's `rank` defaults to after its interaction's last message |
| `deleteObject` | Optional `contents: "moveUp" \| "deleteContents"` (slice Sem-2). The inverse list restores contents and their containment relationships, deepest first |
| `setDescription` | New (slice P-1): sets an object's description, which `createObject` could set but nothing could change. Conflicts per field like `renameObject`; at most 10,000 characters |
| `setRank` | New (slice 0.8b): places a folder, object or diagram among its siblings. Last writer wins (no base version), like layout. Deleting a ranked item logs a `setRank` after the re-create in its inverse, so restoring it is exact |



