# Connectome in one page

A short guide to what is built today (October 2026). The rest of this pack holds the full design; this page is the way in.

## The idea

You model the organisation once, as **objects** joined by **relationships**. Diagrams, the explorer and the panels are only views of that one model. Drawing a symbol creates or reuses an object; drawing a line creates a relationship. Nothing is a separate drawing, and every edit is saved, shared live and undoable.

| Rules (metamodel) | Facts (model) | Picture (diagram) |
|---|---|---|
| Object type: Application, Capability… | Object: Claims Manager | Symbol (an *occurrence*) |
| Relationship type: serves, flows to, contains… | Relationship: Claims Manager *serves* Handle Claim | Line |
| Property type: Owner, Status, Cost… | Value: Owner = Dana | Panel, labels, colours |
| Diagram type: Application landscape… | Diagram: Claims landscape | The canvas |

Every relationship type has a **meaning** (one of 14 semantic kinds such as containment, flow, serving). The meaning decides how the line looks, how traces follow it, and which object is the container of another.

## The screen

```
┌ Top bar: repository · File · Metamodel · Scenario · who is here · "All changes saved" ┐
│ Explorer      │ Centre tabs: diagrams, object pages, Metamodel   │ Properties      │
│ folders,      │                                                  │ ─────────────── │
│ objects,      │ Diagram: palette band on top, canvas below        │ Relationships · │
│ diagrams      │                                                  │ Trace · Occurs on│
└───────────────┴──────────────────────────────────────────────────┴─────────────────┘
```

- **Explorer**: folders, objects and diagrams in the order you put them. Contained objects sit under their container. Right-click any row for New, Rename, Delete and groups.
- **Diagram**: the palette band lists the object types this diagram type allows. Zoom with Ctrl + wheel, `+`, `-`, `0`.
- **Properties**: everything about the selection, in sections, with a filter, Hide empty, property sets and a Review mode for confirming values.
- **Relationships, Trace, Occurs on**: what the selection is connected to, read by meaning, by object, as flows or dependencies.
- **Metamodel tab**: types, the connection matrix, rule sentences and Try a connection. Rule edits are a draft until you publish them.

## Doing things

| To | Do |
|---|---|
| Create an object | Explorer: right-click › New › New object. On a diagram: drag a type from the palette, type a name, Enter |
| Put an existing object on a diagram | Drag it from the explorer onto the canvas (a repeat flashes its other symbols) |
| Connect two objects | Select a symbol, drag its handle (the dot on the right edge) onto another, pick a relationship type |
| Move | Drag a symbol (snaps to an 8 px grid), or drag rows in the explorer to reorder or move them |
| Contain | Drop an object onto another in the explorer. Alt+drop to choose the relationship type |
| Change how a symbol looks | Right-click › Show as (box, card, glyph, chip, container), or press `R` |
| Rename | `F2` or double-click |
| Remove from a diagram / delete the object | `Delete` / `Shift+Delete` (the dialog lists what goes with it) |
| Group several objects | Ctrl/⌘-click rows in the explorer, right-click › Group |
| Undo | The Undo button on the toast every edit shows |
| Change the rules | Metamodel › Connection matrix, tick or block cells, then Review and publish |

## Where things live

| Topic | Read |
|---|---|
| The model and its rules | [02-model/overview.md](02-model/overview.md), [semantics.md](02-model/semantics.md) |
| Notation, stencils and rule admin | [02-model/notation-and-metamodel-admin.md](02-model/notation-and-metamodel-admin.md) |
| Screens and gestures | [04-ux/workbench.md](04-ux/workbench.md), [04-ux/diagram-editor.md](04-ux/diagram-editor.md) |
| What is built and what is next | [build-plan.md](build-plan.md) |
| What is missing or rough today | [ux-audit.md](ux-audit.md) |
