// The glyph sprite: every glyph is defined once as an SVG <symbol>, and each icon on screen is one <use>
// (design/02-model/notation-and-metamodel-admin.md §2). One DOM node per icon, whatever the diagram's size.
import { GLYPHS } from "@connectome/model";

export const glyphId = (key: string) => `g-${key}`;

/** Rendered once, near the top of the app. */
export function GlyphSprite() {
  return (
    <svg className="glyph-sprite" aria-hidden="true" focusable="false">
      <defs>
        {Object.entries(GLYPHS).map(([key, d]) => (
          <symbol key={key} id={glyphId(key)} viewBox="0 0 16 16">
            <path
              d={d}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </symbol>
        ))}
      </defs>
    </svg>
  );
}

/** A glyph inside an existing <svg>, e.g. on a diagram symbol. */
export function GlyphUse({
  glyph,
  x,
  y,
  size = 14,
  colour,
}: {
  glyph: string;
  x: number;
  y: number;
  size?: number;
  colour?: string;
}) {
  return <use href={`#${glyphId(glyph)}`} x={x} y={y} width={size} height={size} style={{ color: colour }} />;
}

/** A glyph in ordinary markup, e.g. an explorer row or the palette. */
export function Glyph({ glyph, size = 14, colour }: { glyph: string; size?: number; colour?: string }) {
  return (
    <svg
      className="glyph"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
      focusable="false"
    >
      <GlyphUse glyph={glyph} x={0} y={0} size={size} colour={colour} />
    </svg>
  );
}
