// The CXN Builder's wires (design/02-model/views-and-design-artifacts.md §15.1): a line in the gutter between the
// panes for each existing connection, from the row on the left to the row on the right. Pure, so it is tested
// without a browser; the view measures the rows and draws what this returns.
import type { Id } from "@connectome/model";

/** Where a row sits, top and bottom, in the gutter's coordinates. */
export interface RowBox {
  top: number;
  bottom: number;
}

/** What one pane shows: its rows by object id, and the part of the gutter its list is scrolled to. */
export interface PaneBoxes {
  rows: ReadonlyMap<Id, RowBox>;
  view: RowBox;
}

export interface Wire {
  left: Id;
  right: Id;
  /** Each end's height in the gutter, kept inside its pane's list. */
  y1: number;
  y2: number;
  /** An end whose row is scrolled out of its list sits on the list's edge, pointing the way to scroll. */
  off1: "above" | "below" | null;
  off2: "above" | "below" | null;
  /** Touches a selected or hovered row: drawn strong, and the rest faint. */
  strong: boolean;
}

/** Most wires drawn at once; past it the existing-links line still counts them all. */
export const MAX_WIRES = 400;

const end = (box: RowBox | undefined, view: RowBox) => {
  if (!box) return null;
  const y = (box.top + box.bottom) / 2;
  if (y < view.top) return { y: view.top, off: "above" as const };
  if (y > view.bottom) return { y: view.bottom, off: "below" as const };
  return { y, off: null };
};

/**
 * The wires to draw: one per pair whose rows are both shown (not hidden or filtered out by search) and at least one
 * of which is in view, in the order of `pairs` (so hovering one does not reorder them under the pointer).
 */
export function layoutWires(
  pairs: readonly (readonly [Id, Id])[],
  left: PaneBoxes,
  right: PaneBoxes,
  emphasis: ReadonlySet<Id> = new Set(),
): Wire[] {
  const out: Wire[] = [];
  for (const [l, r] of pairs) {
    const a = end(left.rows.get(l), left.view);
    const b = end(right.rows.get(r), right.view);
    if (!a || !b || (a.off && b.off)) continue;
    out.push({
      left: l,
      right: r,
      y1: a.y,
      y2: b.y,
      off1: a.off,
      off2: b.off,
      strong: emphasis.has(l) || emphasis.has(r),
    });
  }
  if (out.length <= MAX_WIRES) return out;
  let room = MAX_WIRES - out.filter((w) => w.strong).length;
  return out.filter((w) => w.strong || room-- > 0);
}

/** The ids on the other side wired to `id`: its partners, marked on their rows while `id` is hovered. */
export function partnersOf(pairs: readonly (readonly [Id, Id])[], id: Id | null): Set<Id> {
  const out = new Set<Id>();
  if (!id) return out;
  for (const [l, r] of pairs) {
    if (l === id) out.add(r);
    else if (r === id) out.add(l);
  }
  return out;
}

/** A wire's path across a gutter `width` wide: a flat S-curve, so lines leave and meet the rows level. */
export function wirePath(w: Pick<Wire, "y1" | "y2">, width: number): string {
  const c = width / 2;
  return `M0 ${w.y1} C${c} ${w.y1} ${c} ${w.y2} ${width} ${w.y2}`;
}
