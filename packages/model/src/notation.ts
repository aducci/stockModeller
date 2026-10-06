// The default notation: what a type looks like before anyone configures anything
// (design/02-model/notation-and-metamodel-admin.md §2 and §3). A glyph is one stroke-only SVG path on a
// 16x16 grid, at most 256 bytes, drawn with stroke="currentColor"; a package may override both tables in its
// own `notation` section (slice N-3).
import type { SemanticCategory, SemanticKind } from "./model";

/** The largest a glyph's path may be, so a package of 60 types stays a few kilobytes. */
export const GLYPH_MAX_BYTES = 256;

/** Glyph paths by key, on a 16x16 grid. */
export const GLYPHS: Readonly<Record<string, string>> = {
  actor: "M8 2.5a2.5 2.5 0 1 1 0 5a2.5 2.5 0 1 1 0-5M3 14c0-3 2.2-5 5-5s5 2 5 5",
  capability: "M2 13h12V3h-4v3.5H6V10H2z",
  behaviour: "M2 5h8l4 3-4 3H2l2-3z",
  event: "M2 4h9l3 4-3 4H2l3-4z",
  service: "M5 4h6a4 4 0 0 1 0 8H5a4 4 0 0 1 0-8",
  interface: "M2 8h6M11 5a3 3 0 1 1 0 6a3 3 0 1 1 0-6",
  api: "M6 3c-2 0-2 1-2 2.5S3.5 8 2.5 8c1 0 1.5 1 1.5 2.5S4 13 6 13M10 3c2 0 2 1 2 2.5s.5 2.5 1.5 2.5c-1 0-1.5 1-1.5 2.5S12 13 10 13",
  component: "M5.5 2.5h8v11h-8zM3 5h4.5v2H3zM3 9h4.5v2H3z",
  information: "M3 3h10v10H3zM3 6.5h10",
  database: "M3 4c0-1.1 2.2-2 5-2s5 .9 5 2-2.2 2-5 2-5-.9-5-2v8c0 1.1 2.2 2 5 2s5-.9 5-2V4",
  technology: "M2 5.5l3-3h9v8l-3 3H2zM2 5.5h9v8M11 5.5l3-3",
  server: "M3 2.5h10v4.5H3zM3 9h10v4.5H3zM5.5 4.8h.01M5.5 11.2h.01",
  cloud: "M4.5 12.5h7a3 3 0 0 0 .3-6A4 4 0 0 0 4.3 7.2a2.7 2.7 0 0 0 .2 5.3z",
  location: "M8 14s-4.5-4.4-4.5-8a4.5 4.5 0 0 1 9 0c0 3.6-4.5 8-4.5 8zM8 6h.01",
  motivation: "M8 2a6 6 0 1 1 0 12A6 6 0 1 1 8 2M8 5.5a2.5 2.5 0 1 1 0 5a2.5 2.5 0 1 1 0-5",
  requirement: "M4.5 3.5H14l-2.5 9H2z",
  group: "M2 4h4.5l1.5 1.5h6V13H2z",
  other: "M3 3h10v10H3z",
  warning: "M8 2l6.5 11.5h-13zM8 6.5v3M8 11.5h.01",
  info: "M8 2a6 6 0 1 1 0 12A6 6 0 1 1 8 2M8 7.5v3.5M8 5h.01",
  check: "M3 8.5l3 3 7-7",
  clock: "M8 2a6 6 0 1 1 0 12A6 6 0 1 1 8 2M8 5v3.2l2.2 1.6",
  lock: "M3.5 7.5h9v6h-9zM5.5 7.5V5a2.5 2.5 0 0 1 5 0v2.5",
  noOwner: "M8 3a2 2 0 1 1 0 4a2 2 0 1 1 0-4M4 13c0-2.5 1.8-4 4-4s4 1.5 4 4M2.5 2.5l11 11",
  star: "M8 2l1.8 3.8 4.2.5-3.1 2.9.8 4.1L8 11.2l-3.7 2.1.8-4.1L2 6.3l4.2-.5z",
  drill: "M9 2.5h4.5V7M13.5 2.5L7.5 8.5M11.5 9.5v4h-9v-9h4",
  interaction: "M2 6h11l-2.5-2.5M14 10H3l2.5 2.5",
};

/** The notation palette's hues. Each one has a fill and an ink value per theme in the web app's stylesheet. */
export type Hue = "sky" | "teal" | "green" | "amber" | "sand" | "rose" | "violet" | "slate";

export interface CategoryNotation {
  glyph: string;
  hue: Hue;
}

/** An object type's default look, from its semantic category (§2). */
export const CATEGORY_NOTATION: Readonly<Record<SemanticCategory, CategoryNotation>> = {
  actor: { glyph: "actor", hue: "amber" },
  capability: { glyph: "capability", hue: "sand" },
  behaviour: { glyph: "behaviour", hue: "amber" },
  service: { glyph: "service", hue: "sky" },
  interface: { glyph: "interface", hue: "sky" },
  component: { glyph: "component", hue: "sky" },
  information: { glyph: "information", hue: "teal" },
  technology: { glyph: "technology", hue: "green" },
  location: { glyph: "location", hue: "rose" },
  motivation: { glyph: "motivation", hue: "violet" },
  other: { glyph: "other", hue: "slate" },
};

/** How a line is drawn. `LineStyle` in model.ts is the metamodel field that may override it. */
export type StrokeStyle = "solid" | "dashed" | "dotted";
export type ArrowHead =
  "none" | "arrow" | "arrowOpen" | "arrowSmall" | "triangleOpen" | "diamond" | "diamondOpen" | "dot";

export interface LineNotation {
  style: StrokeStyle;
  start: ArrowHead;
  end: ArrowHead;
  /** Stroke width in pixels; the default is 1.5. */
  width?: number;
  /** A glyph drawn at the line's midpoint. */
  mid?: string;
}

/** A relationship type's default line, from its semantic kind (§3). */
export const KIND_NOTATION: Readonly<Record<SemanticKind, LineNotation>> = {
  containment: { style: "solid", start: "dot", end: "none" },
  composition: { style: "solid", start: "diamond", end: "none" },
  aggregation: { style: "solid", start: "diamondOpen", end: "none" },
  association: { style: "solid", start: "none", end: "none" },
  realisation: { style: "dashed", start: "none", end: "triangleOpen" },
  representation: { style: "dotted", start: "none", end: "triangleOpen" },
  serving: { style: "solid", start: "none", end: "arrowOpen" },
  access: { style: "dotted", start: "none", end: "arrowSmall" },
  flow: { style: "dashed", start: "none", end: "arrow" },
  trigger: { style: "solid", start: "none", end: "arrow" },
  assignment: { style: "solid", start: "dot", end: "arrow" },
  influence: { style: "dashed", start: "none", end: "arrowOpen" },
  specialisation: { style: "solid", start: "none", end: "triangleOpen" },
  interaction: { style: "solid", start: "none", end: "none", width: 3, mid: "interaction" },
};

/** The glyph for a category, falling back to `other` for a type with no category. */
export function glyphForCategory(category: SemanticCategory | undefined): CategoryNotation {
  return CATEGORY_NOTATION[category ?? "other"];
}

/** The line a relationship type draws, from its kind (§3). */
export function lineForKind(kind: SemanticKind): LineNotation {
  return KIND_NOTATION[kind];
}
