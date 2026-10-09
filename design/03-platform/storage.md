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
| Migration 012 renames the semantic level to abstraction (B62): `semantic.level` becomes `semantic.abstraction` in object properties, field stamps, confirmations, markers, filters and the change log (edits and inverses), and the object-type definition keys `level`, `levelFixed` and `uniquePerLevel` become `abstraction`, `abstractionFixed` and `uniquePerAbstraction` | So *level* is free for a custom property, and undoing a change made before the rename still sets the right property |
| Relationship-type `semantic`, `semanticDirection`, `cascadeDelete` and `payload`, object-type `category`, `abstraction` and `abstractionFixed` are kept in `definition` (no migration; slice Sem-1) | They are definition fields like `verb` and `symbol`. The core package is never stored: every compile merges it in |
| `rank text` on `folder`, `object` and `diagram` (migration 005; slice 0.8b) | The explorer's order. A fractional-index key, so placing an item between two others rewrites one row; `NULL` (absent in the API) sorts after ranked siblings, by name. An object's siblings are its folder's root objects, or its container's contents (semantics §3) |
| `rendition` in an occurrence's `style`, and `renditions` (`default`, `semanticZoom`) on a diagram type (no migration; slice N-2) | `style` is already `jsonb` and diagram types live in the package. The engine accepts only the built-in keys (`box`, `card`, `glyph`, `chip`, `container`) until packages can declare their own (slice N-3) |
| Relationship rules are published by replacing the `relationship` rows of `rule` and setting `repository.metamodel_version` to the next patch version, in one transaction that also notifies `connectome_metamodel` (no migration; slice A-1) | Every server instance drops its compiled metamodel and sends its open sessions `resync`, so nobody keeps editing against old rules. Existing relationships are never changed; those the new rules refuse are listed before publishing |
| `diagram.properties jsonb NOT NULL DEFAULT '{}'` (migration 008) and `properties` on a diagram type (in `definition`; slice A-1b) | Diagrams carry property values like objects do, from their diagram type's `properties`. Absent in the API and the engine when empty |
| The whole metamodel is published by rewriting `value_list`, `property_type`, `object_type`, `relationship_type`, `rule` and `diagram_type` for the repository and setting the next patch version, in one transaction that notifies `connectome_metamodel` (no migration; slice A-1b) | `PUT /repositories/{repo}/metamodel`. Before writing, the server validates the package and diagram types against their schemas, compiles them, and checks the baseline model: a removed type still in use, a changed data type with values, or a removed list value in use is refused. Stored values are never rewritten |
| `diagram.definition jsonb NOT NULL DEFAULT '{}'` (migration 009; slice V-1) | A view's own settings ([views](../02-model/views-and-design-artifacts.md) §2): a matrix's rows, columns and relationships, later a document's components. Its keys are merged over the diagram type's (`matrix` on the type); `{}` means "as the type says" and is absent in the API |
| A document's `definition` holds `subject` (an object id) and one key per template section holding that section's state (prose, the linked diagram's id, ignored rows) (slice V-2; no migration) | One key per section keeps conflicts per section, so two authors writing different sections never conflict. `setViewDefinition` checks that a `subject` names an object (a deleted one is allowed, so undo can always put it back) |
| `relationship_occurrence.step text` (migration 010; slice V-3) | A message's place in a sequence diagram: a fractional rank (`[0-9A-Za-z]{1,64}`) compared as a string, per occurrence so one message can sit in several sequences in different orders (V5). NULL elsewhere; a sequence draws unstepped messages after the stepped ones, in their interaction's message order |
| A `relationTable` section's state may hold `sequences: { relationshipId: diagramId }` (slice V-3; no migration) | The per-row sequence of a table with `perRow` (B38): created on demand and linked in the same change |
| A document's `definition.layout` holds what authors changed within each section's lock and the sections they added in regions (slice V-4; no migration) | `{ sections: { key: { hidden, title, properties, hiddenColumns, columns } }, regions: { region: [section definitions] } }` (B42, B43). `layout`, like `subject`, is reserved: no section may use the key. A repeater's state is `{ rows: { relationshipId: { childKey: state } } }` |
| `repository.settings.metamodel.documentPatterns` (slice V-4; no migration) | The package's document patterns (B40), stored and published with `layers` and `exchangeMappings`. Absent for repositories created before V-4 |
| Starting over (slice R-1; no migration): a repository is created from any metamodel, and deleted with everything in it | `POST /repositories` takes an optional `metamodel` (`{ package, diagramTypes }`, the snapshot's shape and the exported file's), checked like a publish (schema, then compile), version 1.0.0 when it has none; without it the repository gets Essentials. `DELETE /repositories/{repo}` deletes the `change_log`, occurrence and annotation rows (no foreign key to the repository) and then the repository row, whose other tables cascade. The web app exports a metamodel as `{ format: "connectome.metamodel", package, diagramTypes }` and imports one as an unpublished draft, which publishing checks like any other |
| The example repository's diagrams may carry `definition`, and its relationship occurrences `step` (slice U-2; no migration) | So the example holds views of every kind: `baselineChange()` passes a diagram's `definition` to `createDiagram`, and an occurrence's `step` goes through `addRelationshipOccurrence` unchanged |

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
| `confirmProperties`, `setConfirmations` | New (slice P-3): `confirmProperties` stamps the listed property keys with the change's author and time in the object's `confirmations` (migration 007, column `confirmations jsonb`, NULL = none); it conflicts on `properties.<key>`, so a value changed since the reviewer's version cannot be confirmed. Its inverse `setConfirmations` puts the previous entries back (`null` removes one). `createObject` takes optional `confirmations` so restoring a deleted object is exact |
| `setAliases`, `setNotDuplicates` | New (slice D-3, [duplicates-and-identity.md](../02-model/duplicates-and-identity.md) §6): `setAliases` replaces an object's other names (`aliases`, at most 50, none blank or repeated); `setNotDuplicates` replaces the objects it was judged not to duplicate (`notDuplicates`, `{ of, name, otherName }` with both names as they were, never itself). Each inverse is the same edit with the previous list. Both are optional on `createObject` so restoring a deleted object is exact, and both are left out of the object when empty. Migration 011 adds `aliases jsonb` and `not_duplicates jsonb` (NULL = none) |
| `setRelationshipProperties`, `setDiagramProperties` | New (slice A-1b): set or clear (`null`) property values of a relationship or a diagram, checked against what its type carries, as `setProperties` does for objects. Conflicts per property; the inverse sets the previous values. `createDiagram` takes optional `properties`, so restoring a deleted diagram is exact |
| `setRank` | New (slice 0.8b): places a folder, object or diagram among its siblings. Last writer wins (no base version), like layout. Deleting a ranked item logs a `setRank` after the re-create in its inverse, so restoring it is exact |
| `setViewDefinition` | New (slice V-1): `{ diagramId, baseVersion, set }` patches keys of a diagram's `definition`, `null` removing one, so its inverse (the previous values, `null` for keys that were absent) is exact. Conflicts per `definition.<key>`; keys are camelCase and the whole definition at most 256 KB |
| `createDiagram` | Optional `definition` (slice V-1), so restoring a deleted view is exact |
| `setMessageStep` | New (slice V-3): `{ diagramId, occurrenceId, step }` sets or clears (`null`) a message's step on one diagram. Last writer wins, like layout; the inverse puts back the previous step. `addRelationshipOccurrence` takes the optional `step` too |
| `setDrillDown` | New: `{ diagramId, occurrenceId, drillDownDiagramId }` links a symbol to the diagram it drills down to (`object_occurrence.drill_down_diagram_id`, already in migration 001), or removes the link (`null`). Not to the symbol's own diagram. Last writer wins, like layout; the inverse puts back the previous link. Deleting a diagram clears the links to it first, so its inverse restores the diagram before the links |
| `createObject` | A new object gets its type's abstraction (`semantic.abstraction`) unless the edit sets that property (B57) |
| `createObject`, `createRelationship` | External ids are checked (slice D-1): a `system: id` pair already held by another live object (or relationship) is refused as `invalid` on `externalIds.<system>`. No index: the check runs in the engine, and only for edits that carry external ids |
| Object-type `uniqueAcross`, `uniquePerAbstraction`, `onClash`, `uniqueName: container` and relationship-type `distinct` are kept in `definition` (no migration; slice D-2) | Definition fields like `uniqueName` already was. The engine checks names on `createObject`, `renameObject`, `changeObjectType`, `setProperties` (of `semantic.abstraction`), `moveToFolder` and containment edits; `distinct` adds findings on relationship edits |
| A diagram's subject on any kind (slice DOC-1): `definition.subject`, checked by `createDiagram` as by `setViewDefinition` | Every view may be about an element (views-and-design-artifacts.md §12); a canvas or sequence made from an element records it, with no new column |
| `many` on url property types (slice DOC-1): the value is a JSON array of links, `https://…` or `diagram:<id>` | An element's documentation lists several links, including the documents about it. The engine checks each link's form only, so an import may store a link before its diagram and a link to a deleted diagram can be restored by undo |
| `decomposes` on diagram types and `definition.ignoredParts` (slice DOC-1b) | A decomposition makes what is drawn on a diagram about X a part of X through an ordinary relationship, created in the same change; the parts its banner should no longer offer are a list of object ids in the diagram's definition. No migration: diagram types and definitions are JSON |
| `many` on objectRef property types, `abstraction` on relationship types and `lineAbstraction` on diagram types (slice DOC-2) | A reference property's value may be a JSON array of object ids; deleting an object rewrites the references that held it (each with its inverse in the change). A relationship's `semantic.abstraction` is an ordinary property value. No migration |
| The `link` table and the edits `createLink`, `updateLink`, `deleteLink` (migration 013; slice DOC-R2) | Links from an element to a document, diagram, element or web page, with a kind and an optional label, indexed by source and by each target so *Linked from* stays fast in a large repository (B70). Exactly one target column is set (a check constraint). Rows are not versioned: the last writer wins, as for occurrences. `deleteObject` deletes the links from and to the object and `deleteDiagram` the links to the diagram, each with its inverse in the change. The same kind and target twice from one element is refused |
| `linkKinds` kept in `repository.settings.metamodel`, and a diagram type's `subject.linkKind` replacing `subject.linkProperty` (migration 013) | Link kinds are package settings like `layers`. Migration 013 adds Essentials' kinds where a repository has none, rewrites `linkProperty` to `linkKind` (`document` for document types, `drillDown` otherwise), turns every *Documentation* (`documentation.link`) value into a link (`diagram:<id>` to a `document` or `drillDown` link by the diagram's kind, web addresses to `web`) and removes the property's values |
