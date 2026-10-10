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
| Sections | Property groups and the other sections (Tags, Also known as, Possible duplicates, Payload, Messages) collapse; a group's header shows filled/total. Open or closed, Hide empty and the label width are remembered per browser |
| Identity (D-3) | An object's **Also known as** section takes abbreviations and former names, comma-separated; search and the explorer filter find them. A **Possible duplicates** section appears only when the object has some: each with its likeness, reasons and *Not duplicates* ([duplicates-and-identity.md](../02-model/duplicates-and-identity.md) §6) |
| Grid | Two columns with a draggable splitter, 24 px rows, fields borderless until hovered or focused, a clear button on hover, `*` for required. Below 260 px wide, labels sit above values |
| Editors | Chosen per property type (B23): text, multi-line, number and money (right-aligned, with unit or currency), date, URL (with an open link), switch or checkbox, dropdown (with the value's colour), segmented radio, rating pips, toggle chips, object picker (with a link to the object), read-only `ƒ` for calculated values. Relationship properties are read-only until `setProperties` covers relationships |
| Later | Several items selected: common properties, "Mixed" where they differ, one change for all. Rendered properties (gauge, ring, pips, bars) from a property's `scale`, as the notation's decorations draw them |

#### Property sets (slice P-2)

A property set is a named, ordered selection of a type's properties (B25). **Shared sets** are defined on object types in the metamodel package (`propertySets`), inherited, a subtype's set replacing one with the same key; later they are assigned to user profiles. **My sets** are the user's own per object type, kept in the browser until profiles exist: *Save as set…* keeps what is shown, *Edit this set…* puts a checkbox on every row. With a set chosen, its properties show in its order as one section named after it; the filter still applies. The choice is remembered per object type. Essentials 1.4.0 gives applications *Quarterly review*, *Ownership* and *Cost*.

#### Confirmations (slice P-3)

**Moved out of the properties panel** (October 2026 feedback, B61): reviews will be run from a *Manage reviews* menu over a set of elements (an object list or list view), started by people allowed to start one, and each reviewer sees the review waiting for them; see the [feature backlog](../feature-backlog.md). The engine's confirmations below stay; the panel no longer has the Review toggle or the confirmation column. What the panel did until then: **Review** in the toolbar adds a confirmation column and a bar saying how many shown values are due this quarter, with **Confirm all shown**. Each row shows "✓ 6 Oct" when confirmed this quarter, or **Confirm** when it was never confirmed, was confirmed in an earlier quarter, or changed since it was confirmed (amber); the tooltip says who confirmed it and when. Setting a value while reviewing confirms it in the same change. Choosing a property set first (Essentials' *Quarterly review*) limits the review to that set.

A confirmation is model data: the edit `confirmProperties` stamps each key with the change's author and time in the object's `confirmations`, and is refused for a value changed since the version the reviewer saw. Its inverse `setConfirmations` restores what was there, so Undo is exact (B26). Later (P-4): a review list per owner across many objects, using the same panel elements, reminders, and reviewers without modelling rights.

#### Tool windows (slice P-2)

The right column is a dock of two **tool windows**, each a tab strip over its content (Sparx EA, ABACUS): **Properties** (the inspector) above **Relations**, with a divider between them; either collapses to its tab strip. The whole dock **minimises** (» in its top tab strip) to a narrow rail of the windows' names, any of which brings it back on that window, and its left edge **resizes** it (240–720 px). Open tabs, collapsed windows, the divider, the width and the minimised state are remembered.

Moving tool windows around was weighed in the October 2026 feedback (B59). *Floating* windows cover the diagram being edited and get lost on small screens and second monitors; a full *docking* framework (drag a tab to any edge, split, stack) costs a layout engine, persistence per user and a reset, for little gain while there are two windows. So the dock stays fixed on the right, and what people asked for is covered by minimising and resizing it. The next step, when there are more windows (History, Comments), is to let a tab move between the right dock and a bottom dock by dragging it or from its menu, still docked, never floating. Tabs are entries in a registry, so History, Comments and an extension's view are one entry each.

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
| Double-click an object occurrence | Opens its drill-down diagram, or else renames it in place (F2 always renames). A symbol with a child diagram shows the drill marker in its corner, which opens it too. Right-click › *Child diagram ▸* makes one (a new canvas of each type that can draw the object, with it in the middle, B58) or links an existing view, and later opens or unlinks it |
| Alt+click | "Occurs on…": jump to other diagrams showing the object |
| ⌘K | Search objects, diagrams, catalogues and commands ("New application", "Switch scenario", "Run automation…") |
| Breadcrumb | Folder path of the selection; hierarchy path when the selection is nested |
| ⌘[ / ⌘] | Back and forward through visited diagrams and selections |

## Menus

One menu component serves the top bar's menu bar and the explorer's right-click menu, so an item reads and behaves the same in both. Arrows move, → opens a submenu and ← closes it, Enter runs, Esc closes. An item that cannot run now stays visible, greyed out, and its tooltip says why ("Not empty: holds 3 items").

| Menu | Items |
|---|---|
| **File** (top bar) | New object, New diagram, New folder, New group · Rename (F2) · Delete · Close tab, Close all tabs · Switch repository…, Sign out. New items go into the selected folder or the selected item's folder. New diagram opens the dialog with the types grouped by kind (B46), where the folder can be changed, so it needs no selection |
| **Review** (top bar) | Possible duplicates: opens a tab listing pairs of objects that may be one thing, with the likeness, the reasons and *Not duplicates* ([duplicates-and-identity.md](../02-model/duplicates-and-identity.md) §6, slice D-3) |
| **Tools** (top bar) | **CXN Builder**: an unsaved CXN Builder tab for linking sets of elements in bulk; an element's right-click menu has **Connect in CXN Builder…** with that element selected ([views](../02-model/views-and-design-artifacts.md) §15, slice CXN-1) |
| Explorer: folder | Object viewer · New ▸ (Object, Diagram, Folder, Group: the submenu does not repeat "New") · Rename · Move up, Move down · Delete folder (only when empty) |
| Explorer: object | Open · New ▸ (as a folder, then each canvas type that can draw it, *Sequence of its interactions* when it has some, and the documents it can be the subject of) · Rename · Add to group ▸ (the groups, then New group…) · Delete object… (the dialog listing what goes with it) |
| Explorer: group | As an object, plus Ungroup (deletes the group; its members stay) |
| Explorer: group member (↗) | Open · Remove from group |
| Explorer: diagram | Open · New ▸ · Rename · Delete diagram |
| Explorer: several marked rows | Group *n* items… · Add to group ▸ · Clear marks |
| Explorer: empty space | New folder at the top level · New diagram |

In the explorer, F2 renames the focused row in place, Ctrl/⌘+↑ and Ctrl/⌘+↓ move it one place among its siblings (as dropping it there would, so the order is stored and shared), Delete deletes it (on a member row: removes it from the group), Shift+F10 or the context-menu key opens its menu, and Ctrl/⌘-click marks rows to drag or group together (Esc clears the marks). Edit and View menus follow in later slices.

## Object viewer

Right-click a folder › **Object viewer** opens a centre tab listing everything under the folder as a tree, the way the explorer shows it: subfolders, the objects stored there, and under each object what it contains (containment, [semantics](../02-model/semantics.md) §3), each row with a ▾/▸ to close and open it. Diagrams are left out. It is for administering many objects at speed:

- **Quick add goes into the selected row** (B63). Clicking a row, or its **+**, makes it the target, named at the start of the add row (*Add to Processes*, *Add inside Handle Claim*); × beside it goes back to the viewed folder. Type a name and press Enter: the object is created, the box stays open and keeps its target, so a whole level is entered without the mouse.
  - In a **folder**, any type that can be created is offered (the type filter, when set, is the starting choice).
  - Inside an **object**, only the types a containment rule allows inside its type are offered, starting with the type most of its contents already have, else its own type when it may contain itself (a capability in a capability). The new object is stored in the container's folder and joined to it with the first containment type whose rules allow the pair. When no rule allows anything, the row says so instead of offering a type.
- the name (of objects and folders) and the property columns are edited in their cells: text, number, date, yes/no and list values; other values are shown and edited in the properties panel;
- **there are no property columns until the user picks some**: *Columns* lists the properties any listed type carries, and up to eight are chosen as editing shortcuts. The choice is remembered in the browser (per person, not per folder) until list views store it (V-6). A cell stays empty for an object whose type does not carry the property;
- a name or type filter turns the tree into a flat list of the matching objects with the folder each is in;
- objects are selected with their checkbox and deleted together in one change (one Undo); × on a row deletes one object through the dialog that lists what goes with it.

Every edit is an ordinary change. Sorting and saving a list as a view are for the list views of V-6 ([views](../02-model/views-and-design-artifacts.md) §8).

## Explorer rows

Rows are 12 px text on 22 px rows, indented 12 px a level, with a disclosure triangle (blank for a leaf) and then an icon. The icon tells the three kinds of item apart at a glance: **objects** draw their type's line glyph in its category colour (notation §2), **views** (diagrams, matrices, documents, sequences) a filled accent tile with the kind inside, and **folders** a plain grey folder outline, their names in medium weight.

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
