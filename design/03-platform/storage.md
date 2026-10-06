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
