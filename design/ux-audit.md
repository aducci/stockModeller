# Modelling experience audit (2026-10-07)

What is missing or rough in the web app today, ordered by how much it gets in the way of modelling. Items marked **verified** were tried in the running app (Playwright against a fresh seeded database, main at `0b1a1b0`); the others come from reading the code. Nothing here is fixed yet. [guide.md](guide.md) describes what works.

Size: S = a day or less, M = a few days, L = a slice of its own.

## P1: fix first (basic modelling gestures)

| # | Area | What is wrong | Evidence | Fix | Size |
|---|---|---|---|---|---|
| 1 | Canvas selection | Only one symbol can be selected. Ctrl-click and Shift-click replace the selection, there is no marquee and no Ctrl+A, so moving, removing or restyling several symbols means doing them one by one | **Verified**: Ctrl-click two symbols → 1 selected; marquee → 0; Ctrl+A → 0. `DiagramEditor.tsx` keeps one `selected` id | A selection set in the workbench store (workbench.md "Selection" already asks for several items). Ctrl/⇧-click toggles, drag on empty canvas draws a marquee, Ctrl+A selects all. Moving, Delete, Show as and `R` act on the whole set as **one change** | M |
| 2 | Multi drag to a diagram | Dragging several marked explorer rows onto a diagram does nothing, and says nothing | **Verified**: 2 marked objects dropped → 6 symbols before and after. `onDragStart` sets the object payload only when one item is dragged | Carry the list of ids; place the new symbols in a small grid at the drop point; one change; flash any repeats | S |
| 3 | Explorer multi-select | Ctrl/⌘-click marks rows and moving marked rows into a folder works (**verified**: "Move 2 items to Technology"). But: no Shift-click range; marked rows look the same as the selected row (14 % vs 15 % tint); `Delete` deletes only the focused row and ignores the others (**verified**); the right-click menu for marks offers only Group, Add to group and Clear | `styles.css` `.row.marked` / `.row.selected`; `commands.ts` `marksMenu` | Merge marks into the one selection set from #1. Shift-click range, a clear marked style (outline or check), and Delete, Move to…, Add to diagram for the whole set | M |
| 4 | Removing lines | A selected line cannot be removed from the diagram or deleted on the canvas: `Delete` acts only on a selected symbol, and lines have no menu. The only way is the delete button in the properties panel | `onKeyDown` returns when no symbol is selected; `line-hit` has no `onContextMenu` | `Delete` removes the line from the diagram, `Shift+Delete` deletes the relationship; a line menu (below) | S |
| 5 | Right-click on diagrams | Only symbols have a menu (Show as, Rename, Remove, Delete object). The empty canvas and lines have none (**verified**). The diagram row in the explorer offers only Open, New, Rename, Delete | `DiagramEditor.tsx` `occMenuEntries`; `commands.ts` `itemMenu` | **Canvas**: Add object ▸ (types), Paste, Select all, Zoom to fit, Diagram properties. **Symbol**: add Add related ▸, Trace ▸, Select in explorer, Change type, Style, Bring to front / send to back (all in diagram-editor.md §2 and §4). **Line**: Change type, Reverse, Remove from diagram, Delete relationship, Show nested / as line. **Diagram row**: Duplicate, Move to…, Properties | M |
| 6 | Text in symbols | The box rendition (the default) draws the name as one line with no wrapping or clipping, so long names run across neighbouring symbols. The name sits in the vertical middle, so a symbol placed on top of a parent hides the parent's name. Card, chip and glyph truncate with no tooltip. Nothing is configurable | **Verified** (screenshot: a 78-character name crosses two containers; "Claim Intake" shows as "Cla"). `OccurrenceShape.tsx` box branch has no `fitText` | Now: wrap to the box width, ellipsis on the last line, full name as an SVG `<title>`; a parent's name at the top when anything overlaps it. Later: label zones and per-type text settings (alignment, size, position) from notation §5.4 | S now, M later |

## P2: make it compact and configurable

| # | Area | What is wrong | Fix | Size |
|---|---|---|---|---|
| 7 | Explorer header | "+ Folder" and "+ Object" are text buttons that fill the header, and there is no add-diagram button (only right-click › New › New diagram) | Three icon buttons with tooltips (folder, object, diagram), plus collapse all. Use the glyph set for folder and diagram rows too: they still use 📁 and the ⧉ character while objects use glyphs | S |
| 8 | Relationships in the tree | Every object with relationships gets dimmed groups such as "⋯ Providers (1)" under it. The same information is in the Relationships tab | A "Show relationships in the explorer" switch, **off** by default, remembered per user. Containment (the real tree) and group members stay | S |
| 9 | Palette band (stencil) | The band lists every type the diagram type allows as wide text chips, in package order, with no grouping and no way to add a type the band does not list | Build stencils from the metamodel (notation §9.2, slice N-3): named sections per diagram type, each type with its drop rendition and preset values. An icon-only compact mode with tooltips. A **More types ▾** dropdown with search that lists the remaining object types; whether a type outside the diagram type's rules is refused or added with a warning is open (decision log, "Audit questions") | M–L |
| 10 | Keyboard | No Ctrl+Z / Ctrl+Y (undo only from the toast), no `/` quick add, no ⌘K search, no Space-drag to pan (all in the spec) | A keymap in the workbench store: undo and redo from the change inverses first, then `/` and ⌘K | M |
| 11 | Resizing and nesting by hand | Symbols cannot be resized on the canvas, and dropping a symbol inside another does not nest it (only drawing a containment line does). Dragging a symbol out of its parent does nothing to the model | Resize handles on the selection; drop-inside and drag-out per diagram-editor.md §1–2 | M |
| 12 | Lines | Straight centre-to-centre lines, labels at the midpoint, no bend points, no reconnecting an end, and a line under a symbol cannot be clicked | Right-angle routing, anchors and label placement are slice N-2a | L |
| 13 | Toasts | Every edit adds a toast and they stack (three after three edits) | Keep one toast; the newest replaces the last, Undo stays on it | S |
| 14 | Properties with several items | With several items marked, the panel shows only one | Common properties, one change for all (workbench.md "Selection"), once #1 lands | M |

## P3: later

- Align, distribute and auto-layout of the selection (diagram-editor.md §5).
- Copy and paste of occurrences, and Duplicate (⌘D).
- Faint lines for relationships that exist but are not drawn, and the ▸ expand marker (§4).
- The breadcrumb, back and forward (workbench.md "Navigation").

## Overlaps with other threads

| Item | Thread | Note |
|---|---|---|
| #6 later part, #9, #12 | Metamodel configuration and notation design | Label zones, stencils and routing are its slices N-2a and N-3. The quick text wrap in #6 can land before them |
| #9 More types | Metamodel configuration and notation design | The stencil needs a place in the metamodel admin tab (per diagram type) |
| #1, #5 | Diagram and view framework | V-1 adds new view kinds (matrix first). The selection set and menus should live in the workbench store so matrix and list views share them, not only the canvas |

## Suggested order

1. **U-1 Selection**: #1, #2, #3, #4, #14 (one selection set used everywhere).
2. **U-2 Menus and keys**: #5, #10, #13.
3. **U-3 Compact explorer and text**: #6 (now part), #7, #8.
4. **U-4 Stencils**: #9, with N-3.
5. Then #11 and #12 with N-2a.
