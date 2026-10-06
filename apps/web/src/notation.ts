// What a type looks like in the workbench (design/02-model/notation-and-metamodel-admin.md §2–3): the glyph and
// hue come from the object type's semantic category, the line from the relationship type's semantic kind, and a
// type's own `symbol`/`line` wins over both. Pure, so it is unit-tested.
import type { Metamodel, ResolvedObjectType } from "@connectome/engine";
import {
  GLYPHS,
  glyphForCategory,
  lineForKind,
  type ArrowHead,
  type Hue,
  type LineNotation,
  type LineStyle,
  type TypeKey,
} from "@connectome/model";

/** Icon names Essentials already uses, mapped onto the default glyph set. */
const ALIASES: Readonly<Record<string, string>> = {
  people: "actor",
  app: "component",
  data: "information",
  pin: "location",
  db: "database",
};

/** Ink for a glyph on a colour a package chose itself (notation §2: hex stays allowed, hues are theme-aware). */
const ON_LITERAL_FILL = "#1d2733";

export interface Notation {
  /** A key of GLYPHS. */
  glyph: string;
  hue: Hue;
  /** Fill and stroke as CSS values: the type's own colours, else the hue's. */
  fill: string;
  stroke: string;
  /** The glyph's colour. */
  ink: string;
}

/** An object type's glyph, hue and colours. */
export function notationFor(objectType: ResolvedObjectType | undefined): Notation {
  const { glyph, hue } = glyphForCategory(objectType?.category);
  const named = objectType?.symbol?.icon;
  const own = named ? (ALIASES[named] ?? named) : undefined;
  const fill = objectType?.symbol?.fill;
  return {
    glyph: own && own in GLYPHS ? own : glyph,
    hue,
    fill: fill ?? `var(--${hue}-fill)`,
    stroke: objectType?.symbol?.stroke ?? `var(--${hue}-ink)`,
    // A hue follows the theme, so its ink always reads on its fill. A colour the package chose itself does not,
    // and it is light in both themes, so the glyph takes a dark ink instead of the theme's.
    ink: objectType?.symbol?.stroke ?? (fill ? ON_LITERAL_FILL : `var(--${hue}-ink)`),
  };
}

export interface Line extends LineNotation {
  /** `stroke-dasharray` for the style, or undefined for a solid line. */
  dash: string | undefined;
}

const DASH: Record<LineNotation["style"], string | undefined> = {
  solid: undefined,
  dashed: "6 4",
  dotted: "1.5 3",
};

/** A type's own arrowheads use the metamodel's smaller vocabulary (model.ts `LineStyle`). */
const ARROWS: Record<NonNullable<LineStyle["startArrow"]>, ArrowHead> = {
  none: "none",
  arrow: "arrow",
  diamond: "diamond",
  circle: "dot",
};

/** The line a relationship type draws: its kind's default, overridden by the type's own `line`. */
export function lineFor(metamodel: Metamodel, type: TypeKey | undefined): Line {
  const rt = type ? metamodel.relationshipType(type) : undefined;
  const base = lineForKind(rt?.semantic ?? "association");
  const own = rt?.line;
  const style = own?.style ?? base.style;
  const line: Line = {
    ...base,
    style,
    dash: DASH[style],
    start: own?.startArrow ? ARROWS[own.startArrow] : base.start,
    end: own?.endArrow ? ARROWS[own.endArrow] : base.end,
  };
  // A type that reads against its kind's direction keeps its own arrows pointing the way the type reads.
  if (rt?.semanticDirection === "reverse") return { ...line, start: line.end, end: line.start };
  return line;
}
