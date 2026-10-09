---
name: ux-basics
description: Use when building or changing anything a person interacts with in apps/web, such as a new feature, panel, menu, dialog, view or canvas tool. Covers the basics every feature must support, standard gestures and keeping the screen simple.
---

# Experience

People work in Connectome for hours. They should learn it once and find it predictable everywhere. Powerful features are welcome, but they enter through gestures people already know, not through more on screen.

## 1. The basics come first

A feature isn't finished until these work in it, wherever they make sense:

| Basic                    | Expected                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Undo / redo              | Ctrl/⌘+Z, Ctrl/⌘+Shift+Z, and Undo on the toast. Free if every write is one change (see the `model-changes` skill) |
| Select                   | Click, Shift/Ctrl/⌘+click to add, Ctrl/⌘+A for all, Esc to clear. The selection is shared by every pane            |
| Rename                   | F2 or double-click on the name                                                                                     |
| Delete                   | Delete removes from the diagram. Deleting from the model is a separate, named action that shows its impact first   |
| Copy / paste / duplicate | Ctrl/⌘+C, V, D                                                                                                     |
| Open / drill in          | Double-click opens a symbol's child diagram or the object                                                          |
| Context actions          | Right-click shows what you can do here, built from `apps/web/src/components/commands.ts`                           |
| Keyboard                 | Every action is reachable without a mouse, and focus is always visible                                             |
| Drag and drop            | Drag to move, drop on something to nest or link (`dragdrop.ts`)                                                    |

If a basic is missing in the app (see "Areas that need work" in the principles pack), build it as a shared piece once rather than per component.

## 2. Power hides behind familiar gestures

- A new capability gets a menu item, a right-click entry, a double-click or a shortcut, in that order of preference. It does not get a new panel, toolbar or mode by default.
- Use the shortcuts people already know from Visio, EA, Office and IDEs. Depart from them only with a reason written in `design/04-ux/workbench.md`.
- Show a shortcut next to its menu item so it can be learned.

## 3. Resist complexity on screen

- Every new control replaces one or earns its place. Before adding one, say what it replaces or why the task can't be done without it.
- Show what the task needs first. Put the rest one step away: a submenu, a section that folds, a setting.
- Prefer one view with options to two similar views. Prefer one dialog that asks only what the kind needs (as _New diagram_ does) to a dialog per kind.

## 4. One of each

Extend these and never build a rival:

- **Selection:** `useWorkbench` in `apps/web/src/state/workbench.ts`.
- **Properties panel:** `Inspector.tsx` with its `EDITORS` registry. A new data type gets one editor, used in the panel, tables and dialogs alike.
- **Search and pick:** `SearchPicker.tsx` and `FindOrCreate.tsx`.
- **Menus:** `Menu.tsx` with items from `commands.ts`, so an action reads the same everywhere.
- **New views:** `NewDiagramDialog.tsx`.
- **Feedback:** `Toasts.tsx`, with Undo.

## 5. Words and safety

- Say exactly what happens: "Remove from diagram" or "Delete object", never a bare "Delete" on the canvas.
- Errors say what went wrong and how to fix it.
- No Save button. "All changes saved" or "Reconnecting…" is shown quietly.
- Keep speed in mind: your own edit shows within one frame, and a 500-symbol diagram opens within 800 ms.

## Before committing

- Try the feature with the keyboard only, and with several items selected.
- Add a Playwright step for the main gesture (`npm run e2e`).
- Update `design/04-ux/` if the behaviour is new.
