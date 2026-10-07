# Diagram editor

Every gesture has a clear effect on the model, and the editor always says what it is.

## 1. Adding

| Gesture | Effect |
|---|---|
| Drag an object type from the palette | New object (in the type's default folder) + its occurrence; name editing starts at once. Esc with an empty name cancels both |
| Drag an object from the explorer or search | New occurrence of an **existing** object. If it already occurs on this diagram, its other occurrences briefly highlight so the repeat is deliberate |
| Type `/` on the canvas | Quick add: type an object type or an existing object's name |
| Drag from a symbol's handle to another symbol | Choose a relationship type from those the rules **allow** for that pair (most used first) → new relationship + its occurrence between exactly those two symbols. If the relationship already exists, only a new occurrence is drawn |
| Drag a handle onto empty space | New object + relationship in one step |
| Drop a symbol **inside** another | New nesting relationship (e.g. *contains*) + nested occurrence. Refused, with the reason, if no rule allows it |
| Paste | Pastes occurrences of the **same** objects. "Paste as new objects" creates copies |

## 2. Editing

| Gesture | Effect |
|---|---|
| F2 or double-click a label | Rename the object (everywhere) |
| Properties panel | Edit the selection's properties |
| Drag a line end to another symbol | Reconnect the relationship (rules re-checked) |
| Context menu → Change type | Change the object type, with a property-mapping dialog |
| Context menu → Style | Style override for this occurrence only (a dot marks it) |
| Drag a symbol out of its parent | Asks: remove the nesting relationship, or keep it and only change the picture |

## 3. Removing

| Key | Effect |
|---|---|
| `Delete` | **Remove from diagram**: the occurrence only. Toast: "Removed from diagram · Undo · Delete object" |
| `Shift+Delete` | **Delete object** from the model. A dialog shows its relationships, children and the other diagrams it occurs on |

## 4. Seeing what's related

| Feature | Behaviour |
|---|---|
| Faint lines | Relationships that exist between shown objects but aren't drawn appear on hover; click to show them |
| Add related | Context menu: pick a relationship type and direction; related objects are added and placed automatically |
| Expand | A ▸ marker on symbols whose nested objects are not shown; click to add them |
| Problems | Badge on symbols with rule findings; hover for the messages |
| Repeats | Selecting an occurrence outlines its sibling occurrences on the same diagram; a ×N marker shows on objects that occur more than once |
| Others | Coloured selection outlines with names, live cursors, a short highlight on items others just changed |

## 5. Layout

- Grid snap (8 px), smart guides, containers grow to fit their contents.
- Automatic layout on the selection or the whole diagram (`nested`, `layered`, `grid`, `radial`), animated and undoable.
- Lines route at right angles by default; manual bend points are kept per relationship occurrence.
- Layout edits never raise conflict prompts.

## 6. Keyboard

| Key | Action |
|---|---|
| `/` | Quick add |
| `F2` | Rename |
| `Delete` / `Shift+Delete` | Remove from diagram / delete object |
| `⌘D` | Duplicate occurrences (new occurrences of the same objects) |
| `⌘G` | Group the selection inside a new parent object (type offered by the rules) |
| `⌘L` | Auto-layout the selection |
| `⌘Z` / `⇧⌘Z` | Undo / redo |
| `Space` + drag, scroll | Pan, zoom |

## 7. Rendering

- SVG up to 2,000 occurrences; canvas above that.
- Simplified symbols when zoomed out below 40%: each occurrence draws as its glyph, or as the diagram type's own semantic zoom renditions ([notation §4](../02-model/notation-and-metamodel-admin.md#4-renditions-any-number-of-representations-per-object); built in slice N-2, where zoom is Ctrl/⌘ + wheel, `+`, `-` and `0`).
- Off-screen culling; layout runs in a background worker.

## 8. Semantic gestures

From [semantics](../02-model/semantics.md); built in slices Sem-2 to Sem-4. What a gesture does depends on the **kind** of the relationship type involved, never on its name.

### Hierarchies on the canvas

| Gesture | Effect |
|---|---|
| Draw a line whose type is a **containment** | The relationship is created and the content **moves inside** its container (the container grows; animated). Toast: "Placed inside Payments Platform · Show as line". On a diagram type with `nesting: "lines"` it stays a line |
| Draw a **composition** or **aggregation** line | Stays a line. Context menu **Show nested** moves the part inside the whole (`shownAs: "nesting"`); **Show as line** reverses it |
| Drop a symbol **inside** another | Offers the nesting types the rules allow for the pair: containment types first, then composition, then aggregation. One allowed type is used at once; several show a small picker at the drop point, pre-selecting the type last used for that pair of object types. None: refused with the reason |
| Drop a nested symbol into **another container** | The **same** relationship is reconnected to the new container (re-parenting keeps its id and history). If the content also occurs nested elsewhere, those occurrences follow (rule 6) |
| Drag a symbol **out** of its container | Asks, as today: *Take it out* (deletes the relationship; for containment it stays in the folder) or *Only change the picture* (the relationship becomes a line) |
| **Alt** while dropping | Opens the type picker even when only one type fits, so the connector type can be changed on the way in |
| Context menu on a nested symbol → **Change relationship type ▸** | `changeRelationshipType` to another allowed nesting type. Moving from containment to composition leaves the object in its folder; moving to containment applies "folder follows container" |
| ⌘G | Groups the selection in a new parent through the first containment type the rules allow (else composition, else aggregation) |

A diagram can show an object nested under one parent only per occurrence. When an object has a container and also composes into a whole shown on the same diagram, the editor nests it under the parent the user dropped it on and draws the other relationship as a line.

### Many relationships between the same symbols

- Relationships between the same pair of occurrences are drawn as **parallel lines**, evenly spaced; labels follow each line.
- Above three, they collapse into one **bundle** line labelled "5 flows", which expands on click. Opposite directions are bundled separately.
- Connecting two symbols that already have relationships lists the existing ones first (as today), then the allowed types; a new flow with a different payload is always a new relationship.

### Flows and interactions

| Feature | Behaviour |
|---|---|
| Payload | Flow labels show the payload by default (`{name} · {payload}`), e.g. "→ Payment Information". Dropping an object from the explorer **onto a flow line** adds it to the payload (Alt: replaces it) |
| Interaction | One thick line with a ⇄ marker and the operation as its label (`GET /orders/{id}`). Expanding it (click the marker) draws its messages as thin parallel lines, request toward the responder, response back, with their payloads |
| New interaction | Connecting with an interaction type creates the interaction and an empty request message; the properties panel asks for the payloads |
| Trace | Context menu **Trace ▸** (downstream, upstream, implementations, representations, payload) highlights the path on this diagram and lists the objects not on it, with **Add to diagram** |

### Structure view

The object page gets a **Structure** tab: the object's contents (and, with a toggle, its parts through composition and aggregation) drawn nested with the `nested` layout, generated on the fly and not stored. **Save as diagram** turns it into a normal diagram in the object's folder.
