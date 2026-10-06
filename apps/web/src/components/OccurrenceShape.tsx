// An occurrence drawn in its rendition (design/02-model/notation-and-metamodel-admin.md §4): a box, a card with
// property rows, a glyph tile, a chip or a container. The outer rect is always the occurrence's whole box, so
// selection, hit-testing and connecting work the same in every form.
import type { ObjectRow } from "@connectome/engine";
import type { RenditionForm } from "@connectome/model";
import { cardRows, fitText, type Box } from "../diagram";
import type { notationFor } from "../notation";
import { useModel } from "../state/workbench";
import { GlyphUse } from "./Glyph";

const HEADER = 24;
const ROW = 16;

export function OccurrenceShape(props: {
  box: Box;
  form: RenditionForm;
  rows: number;
  object: ObjectRow | undefined;
  notation: ReturnType<typeof notationFor>;
  fill: string | undefined;
  stroke: string | undefined;
  shape: string | undefined;
  /** Whether other occurrences are nested inside it. */
  container: boolean;
  /** The canvas zoom: a glyph's name keeps its on-screen size, so it stays readable when zoomed out. */
  zoom?: number;
}) {
  const { metamodel } = useModel();
  const { box: b, form, object, notation, fill, stroke, shape, container, zoom = 1 } = props;
  const square = shape === "rect";
  const name = object?.name ?? "(deleted)";

  if (form === "glyph") {
    // Zoomed out, the tile keeps about 24px on screen even if that is more than the box; at 100% it fits inside.
    const tile = zoom < 1 ? 24 / zoom : Math.min(40, b.w, b.h - 16);
    const tx = b.x + (b.w - tile) / 2;
    const ty = zoom < 1 ? b.y + b.h / 2 - tile / 2 : b.y + 2;
    return (
      <>
        <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={6} fill="transparent" stroke="none" />
        <rect className="tile" x={tx} y={ty} width={tile} height={tile} rx={tile / 5} fill={fill} stroke={stroke} />
        <GlyphUse
          glyph={notation.glyph}
          x={tx + tile * 0.2}
          y={ty + tile * 0.2}
          size={tile * 0.6}
          colour={notation.ink}
        />
        <text
          x={b.x + b.w / 2}
          y={ty + tile + 13 / Math.min(1, zoom)}
          textAnchor="middle"
          className="on-canvas"
          style={{ fontSize: 12 / Math.min(1, zoom) }}
        >
          {fitText(name, zoom < 1 ? 140 : b.w)}
        </text>
      </>
    );
  }

  if (form === "chip") {
    return (
      <>
        <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={b.h / 2} fill={fill} stroke={stroke} />
        <GlyphUse glyph={notation.glyph} x={b.x + 6} y={b.y + (b.h - 14) / 2} colour={notation.ink} />
        <text x={b.x + 24} y={b.y + b.h / 2 + 4}>
          {fitText(name, b.w - 32)}
        </text>
      </>
    );
  }

  if (form === "card" || form === "container") {
    const rows = form === "card" && object ? cardRows(metamodel, object, props.rows) : [];
    return (
      <>
        <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={square ? 0 : 4} fill={fill} stroke={stroke} />
        <line className="divider" x1={b.x} y1={b.y + HEADER} x2={b.x + b.w} y2={b.y + HEADER} stroke={stroke} />
        <GlyphUse glyph={notation.glyph} x={b.x + 6} y={b.y + 5} colour={notation.ink} />
        <text x={b.x + 24} y={b.y + 16} className="container-label">
          {fitText(name, b.w - 32)}
        </text>
        {rows.map((r, i) => {
          const y = b.y + HEADER + 14 + i * ROW;
          const dot = r.colour ? 10 : 0;
          return (
            <g key={r.label} className="card-row">
              <text x={b.x + 8} y={y} className="card-label">
                {fitText(r.label, b.w * 0.42)}
              </text>
              {r.colour && <circle cx={b.x + b.w * 0.45 + 4} cy={y - 4} r={4} fill={r.colour} />}
              <text x={b.x + b.w * 0.45 + dot} y={y}>
                {fitText(r.text, b.w * 0.55 - dot - 8)}
              </text>
            </g>
          );
        })}
        {form === "card" && rows.length === 0 && (
          <text x={b.x + 8} y={b.y + HEADER + 14} className="card-label">
            No properties set
          </text>
        )}
      </>
    );
  }

  return (
    <>
      <rect
        x={b.x}
        y={b.y}
        width={b.w}
        height={b.h}
        rx={square ? 0 : shape === "ellipse" ? b.h / 2 : 4}
        fill={fill}
        stroke={stroke}
      />
      <GlyphUse glyph={notation.glyph} x={b.x + b.w - 20} y={b.y + 5} colour={notation.ink} />
      <text x={b.x + 6} y={b.y + (container ? 16 : b.h / 2 + 4)} className={container ? "container-label" : ""}>
        {name}
      </text>
    </>
  );
}
