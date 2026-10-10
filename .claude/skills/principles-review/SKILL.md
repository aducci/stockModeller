---
name: principles-review
description: Use to review a diff, branch or pull request against the Connectome principles before it is committed or merged, or when asked whether a change follows the principles.
---

# Principles review

Check a change against the principles that matter most, and report only real problems with a file and line.

## Steps

1. Read the diff (`git diff origin/main...HEAD`, or the PR's files).
2. Load the skill for each area the diff touches: `model-changes` for `packages/` and server writes, `ux-basics` for behaviour in `apps/web`, and `visual-style` for CSS and component looks.
3. Work through the checklist below. For each failure, give the file and line, the principle, and the smallest fix.
4. Report the result. If nothing fails, say so in one line.

## Checklist

**Model and changes**

- Every write goes through a change and `apply.ts`. There's no direct row write and no second path.
- A new edit has an exact inverse and is covered by `inverse.test.ts`.
- There's no type-name check in code where a semantic kind, category or metamodel setting should decide.
- `design/` was updated in the same change, and the drift tests still pass.
- New endpoints are in `openapi.yaml`, and refusals carry a stable code.

**Experience**

- The feature supports the basics where they apply: undo, multi-select, rename, delete, copy and paste, double-click, right-click and keyboard.
- New capability enters through a menu item, gesture or shortcut, not a new panel or mode, unless the change says why.
- It reuses the shared selection, properties panel, editors, pickers, menus and dialogs rather than adding a rival.
- The words say exactly what happens. Destructive actions show their impact first.

**Visual style**

- Components use role tokens only: no hex, `rgb()` or palette tokens, and no inline colours except model data.
- Text sizes, spacing and radii are on the scales.
- Status isn't shown by colour alone, and focus is visible.
- It works in light and dark.

**Code**

- Names use the model's words. No `Manager`, `Helper`, `Util` or `Data` names, and no boolean flag that switches a function between two jobs.
- A shared abstraction is extracted at the third real use, not the first.
- The pure packages (`engine`, `semantics`, `views`) stay free of I/O, and the ESLint boundaries pass.
- Tests are named after the rule they prove.
