# Diagrams, catalogues and other views

**Views never own facts.** A view only selects objects and decides how they look. Deleting a diagram deletes no object. Renaming an object on a diagram renames it everywhere.

## 1. Diagrams

A diagram belongs to a folder, is based on a **diagram type**, and contains three kinds of items:

| Item | Shows | Stored |
|---|---|---|
| **Object occurrence** | One object, as a symbol | Object id, position and size, optional parent occurrence (when nested), style overrides, drill-down link |
| **Relationship occurrence** | One relationship, as a line between two specific object occurrences, or as nesting | Relationship id, source and target occurrence ids, route (automatic or waypoints), label position |
| **Annotation** | Text, a frame, a note, an image or a free shape: **not model** | Content, position, style |

## 2. How diagram actions change the model

| Action on the diagram | Model change |
|---|---|
| Add a symbol from the palette | Creates an object (in the object type's default folder) + its occurrence |
| Add an existing object (from the explorer or search) | Creates an occurrence only, even if the object already occurs on this diagram |
| Draw a line between two symbols | Creates a relationship (the type is chosen from those the rules allow) + its occurrence |
| Show an existing relationship | Creates an occurrence only. Existing relationships between shown objects are offered as faint lines (between the nearest pair of occurrences when an object occurs more than once) |
| Place a symbol **inside** another | Creates a **nesting relationship** (e.g. *contains*) + a nested occurrence. Refused, with the reason, if no nesting rule allows it |
| Move a symbol **out** of its parent | Asks whether to remove the nesting relationship or only change the picture |
| Rename on the diagram | Renames the object |
| `Delete` | Removes the occurrence only |
| `Shift+Delete` | Deletes the object from the model (impact shown first) |

*From slice Sem-2:* which of these happen depends on the relationship type's semantic kind: drawing a containment line nests the content, dropping inside offers containment types first, and moving a nested symbol into another container reconnects the same relationship ([diagram editor §8](../04-ux/diagram-editor.md#8-semantic-gestures)).

**Nested occurrences** store their position relative to the parent occurrence. A diagram type can choose to show nesting relationships as lines instead of nesting (`nesting: "lines"`).

**Many occurrences, one object.** An object may occur several times on the same diagram (e.g. a shared service drawn next to each consumer). Every occurrence points to the same object, so editing through any of them changes the object everywhere. Selecting one occurrence highlights its siblings, and the symbol shows a small ×N marker when the object occurs more than once on the diagram.

## 3. Diagram types

A diagram type is a reusable definition, e.g. "Application landscape", "Capability map", "Process flow" or "Integration diagram". Schema: [diagram-type.schema.json](../05-structures/diagram-type.schema.json); example: [example-diagram-type.json](../05-structures/example-diagram-type.json).

| Section | Defines |
|---|---|
| `objectTypes`, `relationshipTypes` | What may appear (drives the palette and the connection picker) |
| `nesting` | Show nesting relationships as `nested` symbols or as `lines` |
| `symbols` | Per-object-type overrides of the default symbol |
| `colourRules` | Ordered rules: colour by a list property (uses the list colours), colour gradient by a number, badge if a condition holds (e.g. "no owner"), fade if a condition holds (e.g. retired as of the chosen date) |
| `labels` | Label templates, e.g. `{name}` or `{name}\n{lifecycle.status}` |
| `layout` | Default automatic layout: `nested`, `layered`, `grid`, `radial` or `none` |
| `legend` | Automatic legend of the symbols and colours in use |
| `generate` | Optional rules that create and maintain diagrams automatically (§4) |

## 4. Generated diagrams

A diagram type can generate diagrams: *for each object matching a query, build a diagram showing these related objects, with this layout, name and folder.*

```json
{
  "forEach": "type:capability AND NOT exists(<-contains-)",
  "include": [ { "path": "-contains->", "depth": 2 }, { "path": "<-realizes- type:application" } ],
  "layout": "nested",
  "name": "{name} – application landscape",
  "folder": "Diagrams/Generated/Landscapes",
  "orphans": "archive"
}
```

- Each generated diagram remembers its rule and focus object, so regenerating **updates the same diagram** and never duplicates it.
- Occurrences a user moved or added are kept on regeneration; occurrences a user removed stay removed.
- Triggers: manual, when matching objects change, or nightly.

## 5. Catalogues

A catalogue is a live, editable table backed by a query.

| Column kind | Example |
|---|---|
| Object field | Name, key, type, folder |
| Property | Status, Owner, Run cost (edited in place, typed editors) |
| Related objects | "Capabilities" = objects reached by `-realizes->`; edited with a chip picker (creates or deletes relationships) |
| Hierarchy | Parent through a nesting type; indent mode |
| Aggregate | `count(<-serves-)`, `sum(-contains->.cost.runCost)` |

Features:
- grouping and sorting;
- footer totals;
- bulk edit (one change);
- paste from Excel (previewed);
- XLSX round trip (export includes hidden IDs, so re-import updates instead of duplicating).

## 6. Other views

*Proposed 2026-10-07:* every view kind becomes a diagram with a `kind` and a `definition`, and design artifacts compose them into templated documents ([views and design artifacts](views-and-design-artifacts.md)).

| View | Shows | Edits |
|---|---|---|
| **Matrix** | Objects (rows) × objects (columns); a cell = a relationship of a chosen type | Clicking a cell creates or deletes the relationship |
| **Roadmap** | Lifecycle bars over time, grouped by any property or hierarchy | Dragging bar ends edits dates |
| **Chart** | Bar, pie, heatmap or bubble from a query + aggregation | Read-only |
| **Dashboard** | Tiles of diagrams, catalogues, charts and figures, with shared filters | Layout only |

## 7. Navigation between views

- An object occurrence can link to another diagram (drill-down). Links back are automatic. As built (B58): the link is made from the symbol's right-click *Child diagram ▸* (a new canvas around the object, or an existing view) with the edit `setDrillDown`; the symbol shows a drill marker, double-clicking it opens the child, and deleting the child removes the link (Undo restores both). Links back are not shown yet.
- "Occurs on…" lists every diagram where the selected object occurs.
- Export: PNG and SVG (MVP); PDF and PowerPoint (v1); read-only share links.
