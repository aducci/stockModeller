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
- Simplified symbols when zoomed out below 40%.
- Off-screen culling; layout runs in a background worker.
