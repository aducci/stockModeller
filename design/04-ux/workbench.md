# Workbench

One page per repository:
- an **explorer** on the left;
- **tabs** of diagrams and catalogues in the centre;
- **properties** on the right.

Everything opens in place.

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ ◧ Insurance Group EA ▾ │ Scenario [Baseline ▾]  As of [Today ▾] │ ⌘K Search… │ ●● Dana Lee +3 │ ⚙ │
├──────────────────┬────────────────────────────────────────────────────────┬──────────────────┤
│ EXPLORER         │ ⧉ Claims landscape ● │ ▤ Applications │ ⊞ Apps × Caps   │ PROPERTIES       │
│ [Folders|Types|Hierarchies|Queries]                                       │ Claims Manager   │
│ ▾ 📁 Business    │ ┌palette──┐  ┌─ Claims Management ─────────────────┐   │ Application ·    │
│   ▸ 📁 Capabilities │ ▭ Application │ ┌ Claim Intake ┐ ┌ Settlement ┐ │   │ APP-0001         │
│ ▾ 📁 Applications│ │ ▭ SaaS app │ │ [Claims Mgr]─┼─┼▶[Payments] │ │   │ 📁 Applications  │
│   ▸ 📁 Finance   │ │ ⟶ flows to │ └──────────────┘ └────────────┘ │   │ ─ Lifecycle ──── │
│   ▭ Claims Mgr   │ │ ⟶ serves   └──────────────────────────────────┘   │ Status ● Active  │
│   ▭ Legacy CRM   │ └────────────┘          ◉ Lee (cursor)               │ ─ Ownership ──── │
│ ▾ 📁 Diagrams    │                                                        │ Owner  Dana Lee  │
│   ⧉ Claims landscape                                                       │ ─ Relationships ─│
│ ▸ 📁 Catalogues  │ [−] 100% [+]  ⤢ fit  ⊞ layout  ◐ legend  ⤓ export     │ realizes → Intake│
├──────────────────┴────────────────────────────────────────────────────────┤ serves → Handle  │
│ Problems (3) │ Changes │ Comments (2) │ History │ Automation runs          │ Occurs on (4) ▸  │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

## Regions

| Region | Contents |
|---|---|
| **Top bar** | Repository, scenario and "as of" pickers (they apply to every open tab), search and commands (⌘K), who is here, notifications, settings |
| **Explorer** | Four tabs: **Folders** (everything, as stored), **Types** (objects grouped by object type), **Hierarchies** (trees built from nesting relationships), **Queries** (saved queries). Filter box; drag items onto a diagram. Objects show their contents and their relationships by kind ([below](#explorer-a-semantic-navigator)) |
| **Centre** | Tabs for diagrams, catalogues and other views; split left/right or top/bottom; a dot on a tab when others changed it |
| **Properties** | One generic inspector for every kind of item ([below](#properties-panel)): header (name, type, key, folder, badges, description), then property groups, Relationships (grouped by semantic kind, then type and direction, with inline add; flows show payloads, interactions their messages), "Occurs on" diagrams, tags, external IDs. Footer tabs: History, Comments |
| **Bottom panel** | Problems (rule findings), Changes (yours, scenario differences; later: pending review), Comments, History (activity, including API and webhook-driven changes) |
| **Panels** | Extension panels dock like built-in ones |

### Properties panel

Built in slice P-1. One inspector serves objects, relationships, diagrams and folders; each fills it with its own sections, so a new kind of item or a new section is one entry, not a new panel.

| Part | Behaviour |
|---|---|
| Header | Name, edited in place; one line with the type, key and folder (the folder hides when the panel is narrow); the description, clamped to two lines until focused. Enter commits, Shift+Enter adds a line, Esc reverts. Objects (`setDescription`) and diagrams have descriptions; folders and relationships do not (B24) |
| Toolbar | Sticky. A **property set** picker (P-2), then a filter over property names, keys and displayed values (`/` focuses it; other sections hide while it is in use); **Hide empty**, which says how many fields it hides; collapse or expand all |
| Sections | Property groups and the other sections (Tags, Payload, Messages) collapse; a group's header shows filled/total. Open or closed, Hide empty and the label width are remembered per browser |
| Grid | Two columns with a draggable splitter, 24 px rows, fields borderless until hovered or focused, a clear button on hover, `*` for required. Below 260 px wide, labels sit above values |
| Editors | Chosen per property type (B23): text, multi-line, number and money (right-aligned, with unit or currency), date, URL (with an open link), switch or checkbox, dropdown (with the value's colour), segmented radio, rating pips, toggle chips, object picker (with a link to the object), read-only `ƒ` for calculated values. Relationship properties are read-only until `setProperties` covers relationships |
| Later | Several items selected: common properties, "Mixed" where they differ, one change for all. Rendered properties (gauge, ring, pips, bars) from a property's `scale`, as the notation's decorations draw them |

#### Property sets (slice P-2)

A property set is a named, ordered selection of a type's properties (B25). **Shared sets** are defined on object types in the metamodel package (`propertySets`), inherited, a subtype's set replacing one with the same key; later they are assigned to user profiles. **My sets** are the user's own per object type, kept in the browser until profiles exist: *Save as set…* keeps what is shown, *Edit this set…* puts a checkbox on every row. With a set chosen, its properties show in its order as one section named after it; the filter still applies. The choice is remembered per object type. Essentials 1.4.0 gives applications *Quarterly review*, *Ownership* and *Cost*.

#### Tool windows (slice P-2)

The right column is a dock of two **tool windows**, each a tab strip over its content (Sparx EA, ABACUS): **Properties** (the inspector) above **Relations**, with a divider between them; either collapses to its tab strip. Open tabs, collapsed windows and the divider are remembered. Tabs are entries in a registry, so History, Comments and an extension's view are one entry each.

| Relations tab | Content |
|---|---|
| Relationships | A view picker and a filter (name, type, verb, group, payload). *By meaning* (grouped by kind and direction, payloads, messages), *By object* (each related object once, with every relationship to it), *Data flows (2 steps)* and *Dependencies (n steps, 1–6)* (traces both ways, with the steps and the object they came through), *Structure* (containment, composition, aggregation, specialisation). The views are built in; package-defined views come with lenses |
| Trace | The traces of Sem-4, highlighted on diagrams |
| Occurs on | One row per diagram with its folder and ×N when the object repeats; opens the diagram; **Add to ‹open diagram›** when the open diagram does not show it yet (below what is drawn) |
| Stencils (later) | The open diagram's stencils and patterns (notation §9.2–9.3), after slice N-3 |

The object page in the centre shows the same three views as sections.

## Explorer: a semantic navigator

From the [connection framework](../01-product/connection_framework.md) §15 and [semantics](../02-model/semantics.md) (built in slices Sem-2 and Sem-4). The explorer shows **structure** (folders and containment) and, on demand, **meaning** (relationships grouped by semantic kind).

```
▾ 📁 Platforms
  ▾ ▭ Payments Platform                ← root object in the folder
      ▭ Payment API                    ← contents (containment): real tree rows
    ▸ ▭ Payment Service
      ▭ Payment Database
    ▸ ⋯ Realises (1)                   ← semantic groups: collapsed, dimmed, after the contents
    ▾ ⋯ Serves (2)
        ↗ Mobile Application           ← references: open and select, but are stored elsewhere
        ↗ Web Application
    ▸ ⋯ Accesses (1)
    ▸ ⋯ Flows (2)                      ← flows show their payloads: "→ Ledger · Settlement Information"
  ⧉ Payments overview
```

| Row | Shows | Drag and drop |
|---|---|---|
| Folder | Subfolders, root objects and diagrams, ordered by `rank` | Drop into it: move there. A contained object dropped on a folder leaves its container (one change: delete the containment, move) |
| Object | Its **contents** first (containment, ordered by `rank`), then one **semantic group** per kind and direction that has relationships | Drop an object **onto** it: make it a content (table below). Drop **between** contents: re-parent and place |
| Semantic group | *Contents* is never a group: contents are the tree. Groups are labelled with the types' own verbs (*Serves*, *Is realised by*), grouped and ordered by kind (§9.1 of semantics), with counts | Not a drop target |
| Reference (↗) | An object reached through a semantic group | Dragging it out copies a reference (e.g. onto a diagram), never moves it |

**Dropping an object onto an object** creates or changes a **containment**:

| Situation | Result (one change, one Undo) |
|---|---|
| The pair is allowed by one containment type | New containment relationship; the object (and its contents) moves into the container's folder |
| Several containment types allow the pair | The one the object already uses, if allowed; otherwise the first in package order. **Alt+drop** opens a menu to choose |
| The object already has a container | The **same** relationship is reconnected to the new container (id, properties and history kept); its type changes with `changeRelationshipType` only if the old type does not allow the new pair |
| No containment rule allows the pair, the drop would create a loop, or a name clashes in the target folder | Refused: "not allowed" cursor, and the reason (naming the rule) in a hint under the tree while the pointer is there |
| Alt+drop menu | *Contain as ▸ (containment types)*, plus *Add as part ▸ (composition and aggregation types)*, which link without moving |

The object's context menu adds **Change container type ▸** (switches the containment relationship to another allowed containment type), **Take out of *container*** (detaches; it stays in the folder) and **Trace ▸** (§9 of semantics).

The **Hierarchies** tab picks any hierarchy (containment, a composition or aggregation type, specialisation) and shows it as a tree; drops there create or reconnect relationships of that type, and move nothing.

## Selection

- One selection is shared by every region. Selecting an object occurrence selects the object: the explorer reveals it, the properties panel shows it, catalogue rows highlight, and its other occurrences on the diagram are outlined.
- With several items selected, the panel shows the common properties. An edit applies to all of them as **one change**.

## Navigation

| Action | Result |
|---|---|
| Double-click an object occurrence | Opens its drill-down diagram, or else the object's full page |
| Alt+click | "Occurs on…": jump to other diagrams showing the object |
| ⌘K | Search objects, diagrams, catalogues and commands ("New application", "Switch scenario", "Run automation…") |
| Breadcrumb | Folder path of the selection; hierarchy path when the selection is nested |
| ⌘[ / ⌘] | Back and forward through visited diagrams and selections |

## Menus

One menu component serves the top bar's menu bar and the explorer's right-click menu, so an item reads and behaves the same in both. Arrows move, → opens a submenu and ← closes it, Enter runs, Esc closes. An item that cannot run now stays visible, greyed out, and its tooltip says why ("Not empty: holds 3 items").

| Menu | Items |
|---|---|
| **File** (top bar) | New folder, New object, New diagram · Rename (F2) · Delete · Close tab, Close all tabs · Switch repository…, Sign out. New items go into the selected folder or the selected item's folder |
| Explorer: folder | New ▸ (folder, object, diagram, group) · Rename · Delete folder (only when empty) |
| Explorer: object | Open · New ▸ · Rename · Add to group ▸ (the groups, then New group…) · Delete object… (the dialog listing what goes with it) |
| Explorer: group | As an object, plus Ungroup (deletes the group; its members stay) |
| Explorer: group member (↗) | Open · Remove from group |
| Explorer: diagram | Open · New ▸ · Rename · Delete diagram |
| Explorer: several marked rows | Group *n* items… · Add to group ▸ · Clear marks |
| Explorer: empty space | New folder at the top level |

In the explorer, F2 renames the focused row in place, Delete deletes it (on a member row: removes it from the group), Shift+F10 or the context-menu key opens its menu, and Ctrl/⌘-click marks rows to drag or group together (Esc clears the marks). Edit and View menus follow in later slices.

## Drag and drop in the explorer

Folders, diagrams and objects are dragged to reorder or move them. Where the pointer is on a row decides the drop: its top quarter places the item **before** the row, its bottom quarter **after** it (a line shows where), and its middle drops it **into** a folder, a container or a group (the row is outlined). A diagram row has no middle. The empty space below the tree takes folders, to the end of the top level.

| Drag | Onto | Result (one change, one Undo) |
|---|---|---|
| Any item | Before or after a row | Placed there among that row's siblings, moving to the row's folder or container if it is elsewhere |
| Folder, diagram or object | The middle of a folder | Moved into it, at the end. A contained object leaves its container |
| Object | The middle of an object | Contained in it (table above); Alt+drop chooses the type |
| Object(s) | The middle of a group | Added to the group; nothing moves |
| Member row (↗) | Another group | Moves the membership. Elsewhere it only copies (e.g. onto a diagram) |

The order is stored (`rank`, decision B21) and is the same for everyone. Unranked items follow ranked ones: folders, diagrams, then objects, each by name. A drop is refused with its reason (a folder into itself, a name already used in the target folder, a non-folder at the top level, a folder or diagram into an object, an object already in the group). A closed folder or container opens after the pointer rests on it for 600 ms. Esc cancels a drag.

## States

| State | Indicator |
|---|---|
| In a scenario other than the baseline | Coloured top border + scenario chip; edits go to that scenario |
| "As of" is not today | Hatched date chip; inactive objects are faded |
| Read-only | Lock chip; editing controls disabled, with the reason |
| Held for review | Amber "Pending review" badge on affected properties and objects |
| Reconnecting | Thin banner; edits queue; editing pauses after 2 minutes |
