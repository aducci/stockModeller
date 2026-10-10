---
name: visual-style
description: Use when writing or changing CSS, colours, text sizes, spacing or the look of a component in apps/web. Covers the token layers, the type and spacing scales, and comfort over long working days.
---

# Visual style

The chrome is quiet so the customer's diagrams carry the colour. The light theme is the reference, and dark mode must work just as well.

## 1. Colour comes in three layers

1. **Palette:** raw values, defined only in `:root` at the top of `apps/web/src/styles.css`, for example `--slate-fill` or `--sky-ink`.
2. **Roles:** named by purpose, such as `--bg`, `--pane`, `--line`, `--fg`, `--fg-2`, `--accent`, `--added`, `--changed` and `--removed`. They point at palette values, and dark mode redefines them.
3. **Components:** use roles only. No hex, `rgb()` or palette token in a component rule, and no colour in an inline `style={{}}` unless it comes from model data (a symbol's fill).

A new purpose gets a new role in `:root` and in both dark blocks (the system one and `[data-theme="dark"]`), and a row in `design/04-ux/design-system.md` §1. A theme or customer brand changes layers 1 and 2 and never touches a component.

## 2. A colour means one thing

| Role        | Means                                           |
| ----------- | ----------------------------------------------- |
| `--accent`  | Selected, focused, link, the one primary button |
| `--added`   | Added, or valid                                 |
| `--changed` | Changed, a warning, or pending review           |
| `--removed` | Removed, an error, or destructive               |

Never show status by colour alone. Pair it with an icon, a shape or a word.

## 3. Built for long days

- No pure white or pure black on large areas. Panels use an off-white surface, and text is a dark grey.
- Body text contrast is at least 4.5:1 (WCAG AA) in both themes, without going to maximum.
- Saturated colour stays on small marks: dots, chips, a selection outline. Large fills use the pale notation fills.
- Dark mode follows the system, and a user choice overrides it.
- Motion only shows where something went, stays under 200 ms, and switches off under `prefers-reduced-motion`.
- Every focusable control shows a `:focus-visible` ring in `--accent`.

## 4. Few sizes, used strictly

Use the scales in `design/04-ux/design-system.md` §1 and nothing between them:

- **Text:** `var(--text-sm)`, `var(--text-md)` or `var(--text-lg)`: small for labels, meta and chips; base for body, tables and the explorer; large for panel titles. Never a raw pixel size. Only the document page (`--doc-*`) and the sign-in title (`--text-title`) have their own tokens.
- **Spacing:** 2, 4, 8, 12, 16, 24, 32 px.
- **Radius:** `var(--radius-sm)` for inputs, `var(--radius)` for cards and menus, 999px for chips and pills, 50% for round dots.
- **Font:** IBM Plex Sans, with IBM Plex Mono for keys, ids and queries. Use tabular figures for numbers.

A value outside a scale needs a comment saying why. When touching a rule that already breaks a scale, move it onto the scale in the same change.

## Before committing

- Check the change in light and dark (View → Theme).
- Check `npm run check` (Prettier formats the CSS).
