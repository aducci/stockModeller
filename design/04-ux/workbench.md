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
| **Explorer** | Four tabs: **Folders** (everything, as stored), **Types** (objects grouped by object type), **Hierarchies** (trees built from nesting relationships), **Queries** (saved queries). Filter box; drag items onto a diagram |
| **Centre** | Tabs for diagrams, catalogues and other views; split left/right or top/bottom; a dot on a tab when others changed it |
| **Properties** | Header (name, type, key, folder, badges), then property groups, Relationships (grouped by type and direction, with inline add), "Occurs on" diagrams, tags, external IDs. Footer tabs: History, Comments |
| **Bottom panel** | Problems (rule findings), Changes (yours, scenario differences; later: pending review), Comments, History (activity, including API and webhook-driven changes) |
| **Panels** | Extension panels dock like built-in ones |

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
| Explorer: folder | New ▸ (folder, object, diagram) · Rename · Delete folder (only when empty) |
| Explorer: object | Open · New ▸ · Rename · Delete object… (the dialog listing what goes with it) |
| Explorer: diagram | Open · New ▸ · Rename · Delete diagram |
| Explorer: empty space | New folder at the top level |

In the explorer, F2 renames the focused row in place, Delete deletes it, and Shift+F10 or the context-menu key opens its menu. Edit and View menus, drag and drop in the explorer, and groups follow in later slices.

## States

| State | Indicator |
|---|---|
| In a scenario other than the baseline | Coloured top border + scenario chip; edits go to that scenario |
| "As of" is not today | Hatched date chip; inactive objects are faded |
| Read-only | Lock chip; editing controls disabled, with the reason |
| Held for review | Amber "Pending review" badge on affected properties and objects |
| Reconnecting | Thin banner; edits queue; editing pauses after 2 minutes |
