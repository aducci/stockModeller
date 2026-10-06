# Screens

All screens open inside the [workbench](workbench.md) unless marked *full page*.

## 1. Home *(full page)*

Shows:
- **Continue**: recent diagrams and catalogues;
- **Waiting for you**: reviews, objects you own that need data, @mentions;
- **Repositories**: size, scenarios, data-quality score.

## 2. Diagram

See [diagram-editor](diagram-editor.md). It has:
- a palette (from the diagram type);
- a mini-map;
- zoom, layout and legend controls;
- export;
- a "Show annotations" toggle.

## 3. Catalogue

```
┌ ▤ Applications   Query: type:application ✎   Columns ▾   Group by: Status ▾   ⤓ XLSX   ⤒ Import ┐
│ ☐ │ Name ▲         │ Key      │ Folder      │ Status      │ Owner     │ Tech fit │ Capabilities  │
│ ▾ Active (2)                                                                                     │
│ ☐ │ Claims Manager │ APP-0001 │ Applications│ ● Active    │ Dana Lee  │ ■ 2      │ Claim Intake  │
│ ☐ │ Payments Hub   │ —        │ Applications│ ● Active    │ Lee Chan  │ ■ 5      │ Settlement    │
│ ▾ Phase out (1)                                                                                  │
│ ☐ │ Legacy CRM ⚠   │ APP-0002 │ Applications│ ● Phase out │ (empty) ⚠ │ ■ 1      │               │
│   3 applications                                                                                 │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- Typed in-place editors.
- Paste from Excel (previewed, then applied as one change).
- Relationship columns edit relationships through chips.
- "+ New row" creates an object in the catalogue's default folder.

## 4. Matrix, roadmap, chart, dashboard

| Screen | Key interactions |
|---|---|
| Matrix | Rows and columns from two queries; click a cell to create or delete a relationship; group headers by hierarchy |
| Roadmap | Lifecycle bars per object; drag bar ends to edit dates; group by any property or hierarchy; overlay a scenario |
| Chart | Bar, pie, heatmap or bubble from a query + aggregation; click a segment to open the matching catalogue |
| Dashboard | Grid of tiles; shared filters (scenario, as of, owner); read-only share link |

## 5. Object page *(full page from the properties header)*

All property groups, relationships (with inline add), hierarchy position, "Occurs on" thumbnails, attachments, history, comments, external IDs and rule findings.

## 6. Metamodel editor *(admins)*

| Tab | Contents |
|---|---|
| Object types | Name, icon, symbol preview, parent type, assigned property types (drag from the library), name uniqueness, key pattern, default folder |
| Relationship types | Verb and inverse verb, line style, nesting / single parent, allowed pairs (a grid of source × target object types with block/warn cells) |
| Property types | Library by group: data type, value list, unit, validation, role, formula (tested live on a sample object) |
| Diagram types | Allowed types, symbols, colour rules, labels, layout, legend, generation, with a live preview on a sample diagram |
| Rules | Validation and derivation rules, each with usage and violation counts |
| Packages | Installed packages and versions; upgrade with migration preview |
| Publish | Pending metamodel edits; "Publish 1.4.0" shows the migration plan |

Additions (the metamodel map, the connection matrix, sentences, try-it and the notation studio): [notation and metamodel administration §8](../02-model/notation-and-metamodel-admin.md#8-administering-the-metamodel).

## 7. Scenario compare and change request review

```
┌ Compare: Target 2027 ⇄ Baseline ──────────────────────────────── [Raise change request ▸] ┐
│ +3 added · −1 removed · ~7 changed · 4 diagrams affected                                 │
│ ┌ Differences ───────────────────────────┐ ┌ Claims landscape (overlay) ───────────────┐ │
│ │ + Cloud CRM (SaaS application)         │ │  [Claims Mgr]──▶[Payments Hub]           │ │
│ │ ~ Legacy CRM  Status Active → Retired  │ │  ┄[Legacy CRM]┄  removed                  │ │
│ │ − Legacy CRM flows to Claims Manager   │ │  [Cloud CRM]     added                    │ │
│ └────────────────────────────────────────┘ └───────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

The review screen adds:
- reviewers and their decisions;
- rule findings (errors block approval);
- per-item comments;
- **Approve / Request changes / Reject**.

## 8. Automations *(hosted runtime, later; at launch: API tokens, webhooks and "call webhook" actions in Admin)*

| Screen | Contents |
|---|---|
| List | Name, triggers, last run, owner |
| Editor | Code editor with SDK types, parameter-form preview, triggers, requested permissions |
| Run | Generated parameter form; **Preview** is the default action, then **Run** |
| Report | Summary, warnings, created/changed/deleted items with links, files, "Undo run" |

## 9. Admin *(full page)*

Members and roles, groups, folder permissions, governance policies, sign-in, API tokens, webhooks, connectors, secrets, audit export, usage.
