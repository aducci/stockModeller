# Design system

Quiet, dense, professional chrome: the colourful part is the customer's diagrams.

## 1. Tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#e8ecf1` | `#0f141a` | App background |
| `--pane` / `--pane-2` | `#fdfdfe` / `#f4f6f9` | `#161d26` / `#1b2430` | Panels / headers, hovers |
| `--line` | `#c9d2dc` | `#2b3746` | Borders |
| `--fg` / `--fg-2` | `#1d2733` / `#5b6b7c` | `#e3e9f0` / `#97a7b8` | Text / secondary text |
| `--accent` | `#2c5d98` | `#7fb0ea` | Selection, links, primary buttons |
| `--added` | `#1d7a4a` | `#6fd3a0` | Added |
| `--changed` | `#a3620a` | `#f0b45c` | Changed, warnings, pending review |
| `--removed` | `#b0322a` | `#f08a80` | Removed, errors, destructive actions |
| `--canvas` / `--grid` | `#fbfcfd` / `#edf0f4` | `#121922` / `#1a232e` | Diagram surface |

- Added / changed / removed colours mean the same thing everywhere: compare, review, properties and diagrams.
- Spacing: 2, 4, 8, 12, 16, 24, 32.
- Radius: `--radius-sm` 2 (inputs, small marks), `--radius` 4 (cards, menus, dialogs), 999 (chips, pills, switches); 50% for round dots.
- Type: IBM Plex Sans (fallback system-ui) in three sizes for the workbench: `--text-sm` 11 px (labels, meta, chips), `--text-md` 12 px (body, tables, the explorer), `--text-lg` 14 px (panel titles). Two places read differently and have their own tokens: the sign-in card's title (`--text-title` 18 px) and the document page, which is reading content (`--doc-text` 13 px, `--doc-heading` 16 px, `--doc-title` 22 px). Text drawn on a canvas scales with the drawing. IBM Plex Mono for keys, IDs and queries.
- Theme: light by default, dark when the system asks for it. View → Theme overrides the system with Light or Dark for this browser (`data-theme` on `<html>`, kept in localStorage). Text on a strong fill (primary and danger buttons, error toasts) uses `--pane`, so it flips with the theme.

## 2. UI building blocks

| Building block | Notes |
|---|---|
| Explorer tree | Virtualised; folder, object-type and diagram icons; status dot; keyboard navigation |
| Tabs | View kind icon, name, change dot, close |
| Property row | Label · editor · unit · state icon (ƒ calculated, ⚠ finding, ● pending review, 🔒 owned by an external system) |
| Editors | Text, rich text, number + unit, money, date, list (coloured chips), multi-list, object picker, person picker |
| Chips | Object type, list value, scenario, difference |
| Table (catalogue) | Virtualised, frozen name column, typed editors, group rows, totals |
| Toast | Every edit gets one, with **Undo** |
| Impact dialog | Counts by category, expandable lists, confirm by typing the object name for large deletions |

## 3. Diagram defaults

| Item | Default |
|---|---|
| Object occurrence | 1 px stroke, radius 4, fill from the object type's symbol, 12 px label. Containers have a bold label at the top left |
| Relationship occurrence | 1.5 px line, right-angle routing, arrows from the relationship type, label on a small pill |
| Faint relationship | 1 px dashed, 40% opacity |
| Selection | 3 px accent outline; other users in their presence colour with a name tag |
| Differences | Added: green dashed halo; changed: amber dashed halo; removed: red, 50% opacity, struck-through label |
| Annotation | Grey dashed outline when selected; never uses object-type colours |

## 4. Writing

- Say exactly what happens: "Remove from diagram" vs "Delete object". Never a bare "Delete" on the canvas.
- Errors explain what went wrong and how to fix it: "*Server* can't be placed inside *Application*. Allowed: Location."
- No "Save" button. Show "All changes saved" or "Reconnecting…" quietly.
- Right-align numbers with tabular figures; use ISO dates in data and local formats on screen.

## 5. Accessibility

WCAG 2.2 AA:
- full keyboard modelling (quick add, keyboard connect, arrow-key move);
- an accessible tree that mirrors the diagram;
- colour never the only signal;
- text contrast of at least 4.5:1 in both themes.
