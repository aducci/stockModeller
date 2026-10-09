// How a canvas draws its symbols and lines, shared by the diagram editor and the read-only picture a document
// shows of a linked diagram, so the two always look the same (design/02-model/views-and-design-artifacts.md §7.2).
import type { CSSProperties } from "react";
import type {
  DiagramRow,
  Metamodel,
  ModelState,
  ObjectOccurrenceRow,
  RelationshipOccurrenceRow,
  RelationshipRow,
} from "@connectome/engine";
import type { Id } from "@connectome/model";
import { ON_LITERAL_FILL, lineFor, notationFor } from "../notation";
import { edgePoint, layoutBoxes, renditionFor, symbolFor, type Box } from "../diagram";
import { payloadText } from "../semantics";
import { GlyphUse } from "./Glyph";
import { OccurrenceShape } from "./OccurrenceShape";

/**
 * Arrowheads for the semantic kinds (design/02-model/notation-and-metamodel-admin.md §3). Open heads are filled
 * with the canvas colour so a line never shows through them. `prefix` keeps the ids of two pictures apart.
 */
export function ArrowMarkers({ prefix = "" }: { prefix?: string }) {
  return (
    <>
      <marker
        id={`${prefix}arrow`}
        viewBox="0 0 10 10"
        refX="10"
        refY="5"
        markerWidth="7"
        markerHeight="7"
        orient="auto"
      >
        <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
      </marker>
      <marker
        id={`${prefix}a-arrowOpen`}
        viewBox="0 0 10 10"
        refX="9"
        refY="5"
        markerWidth="8"
        markerHeight="8"
        orient="auto"
      >
        <path d="M1,1 L9,5 L1,9" fill="none" stroke="currentColor" strokeWidth={1.5} />
      </marker>
      <marker
        id={`${prefix}a-arrowSmall`}
        viewBox="0 0 10 10"
        refX="10"
        refY="5"
        markerWidth="5"
        markerHeight="5"
        orient="auto"
      >
        <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
      </marker>
      <marker
        id={`${prefix}a-triangleOpen`}
        viewBox="0 0 12 12"
        refX="11"
        refY="6"
        markerWidth="10"
        markerHeight="10"
        orient="auto"
      >
        <path d="M1,1 L11,6 L1,11 z" fill="var(--canvas)" stroke="currentColor" strokeWidth={1.2} />
      </marker>
      <marker
        id={`${prefix}a-diamond`}
        viewBox="0 0 14 8"
        refX="1"
        refY="4"
        markerWidth="12"
        markerHeight="7"
        orient="auto"
      >
        <path d="M1,4 L7,1 L13,4 L7,7 z" fill="currentColor" />
      </marker>
      <marker
        id={`${prefix}a-diamondOpen`}
        viewBox="0 0 14 8"
        refX="1"
        refY="4"
        markerWidth="12"
        markerHeight="7"
        orient="auto"
      >
        <path d="M1,4 L7,1 L13,4 L7,7 z" fill="var(--canvas)" stroke="currentColor" strokeWidth={1.2} />
      </marker>
      <marker id={`${prefix}a-dot`} viewBox="0 0 8 8" refX="4" refY="4" markerWidth="6" markerHeight="6" orient="auto">
        <circle cx={4} cy={4} r={3} fill="currentColor" />
      </marker>
    </>
  );
}

/** `arrow` is the plain head, shared with a pending connection, so the two look the same. */
export function markerUrl(head: string, prefix = "") {
  if (head === "none") return undefined;
  return head === "arrow" ? `url(#${prefix}arrow)` : `url(#${prefix}a-${head})`;
}

/** Larger symbols behind smaller ones, so nothing placed over a container is hidden by it. */
export function paintOrder(occurrences: ObjectOccurrenceRow[], boxes: Map<Id, Box>): ObjectOccurrenceRow[] {
  const area = (o: ObjectOccurrenceRow) => boxes.get(o.id)!.w * boxes.get(o.id)!.h;
  return occurrences.filter((o) => boxes.has(o.id)).sort((a, b) => area(b) - area(a) || a.z - b.z);
}

export interface DrawnLine {
  l: RelationshipOccurrenceRow;
  p: { x: number; y: number };
  q: { x: number; y: number };
  rel: RelationshipRow | undefined;
  type: ReturnType<Metamodel["relationshipType"]>;
  interaction: boolean;
  label: string;
}

/** Line geometry and labels. Lines between the same two symbols are drawn side by side, never on top of each other. */
export function drawnLines(state: ModelState, metamodel: Metamodel, diagramId: Id, boxes: Map<Id, Box>): DrawnLine[] {
  const lines = state.relationshipOccurrences.find("byDiagram", diagramId).filter((l) => l.shownAs !== "nesting");
  const parallel = new Map<Id, { index: number; count: number }>();
  const pairs = new Map<string, Id[]>();
  for (const l of [...lines].sort((x, y) => x.id.localeCompare(y.id))) {
    const key = [l.sourceOccurrenceId, l.targetOccurrenceId].sort().join("|");
    pairs.set(key, [...(pairs.get(key) ?? []), l.id]);
  }
  for (const ids of pairs.values()) ids.forEach((lineId, index) => parallel.set(lineId, { index, count: ids.length }));
  return lines.flatMap((l) => {
    const a = boxes.get(l.sourceOccurrenceId);
    const b = boxes.get(l.targetOccurrenceId);
    if (!a || !b) return [];
    const centre = (x: Box) => ({ x: x.x + x.w / 2, y: x.y + x.h / 2 });
    const p0 = edgePoint(a, centre(b));
    const q0 = edgePoint(b, centre(a));
    const { index, count } = parallel.get(l.id)!;
    const len = Math.hypot(q0.x - p0.x, q0.y - p0.y) || 1;
    const flip = l.sourceOccurrenceId < l.targetOccurrenceId ? 1 : -1;
    const shift = (index - (count - 1) / 2) * 12 * flip;
    const nx = (-(q0.y - p0.y) / len) * shift;
    const ny = ((q0.x - p0.x) / len) * shift;
    const rel = state.relationships.get(l.relationshipId);
    const type = rel ? metamodel.relationshipType(rel.type) : undefined;
    const interaction = type?.semantic === "interaction";
    const operation = rel?.properties["interaction.operation"];
    // An interaction shows its operation; a flow what it carries (design/04-ux/diagram-editor.md §8).
    const label = interaction
      ? `⇄ ${typeof operation === "string" ? operation : (type?.name ?? "")}`
      : rel && rel.payload.length > 0
        ? payloadText(state, rel)
        : "";
    const p = { x: p0.x + nx, y: p0.y + ny };
    const q = { x: q0.x + nx, y: q0.y + ny };
    return [{ l, p, q, rel, type, interaction, label }];
  });
}

/** A symbol's look on a diagram: its rendition, notation and colours. */
export function symbolLook(
  state: ModelState,
  metamodel: Metamodel,
  diagram: DiagramRow,
  o: ObjectOccurrenceRow,
  zoom: number,
) {
  const object = state.objects.get(o.objectId);
  const symbol = symbolFor(metamodel, diagram, object?.type ?? "", o.style);
  const typeNotation = notationFor(object ? metamodel.objectType(object.type) : undefined);
  // A literal fill (set by a diagram type or on the occurrence) is light in either theme, so it takes dark ink.
  const notation = symbol.fill ? { ...typeNotation, ink: ON_LITERAL_FILL } : typeNotation;
  const ink = symbol.fill ? ON_LITERAL_FILL : "var(--fg)";
  const container = state.objectOccurrences.count("byParent", o.id) > 0;
  // Semantic zoom never collapses a container: what is nested inside it stays visible.
  const rendition = renditionFor(metamodel, diagram, symbol, container ? 1 : zoom);
  return { object, symbol, notation, ink, container, rendition };
}

/** A symbol drawn as the canvas draws it. */
export function SymbolShape(props: { look: ReturnType<typeof symbolLook>; box: Box; zoom: number }) {
  const { look, box, zoom } = props;
  return (
    <OccurrenceShape
      box={box}
      form={look.rendition.form}
      rows={look.rendition.rows ?? 3}
      object={look.object}
      notation={look.notation}
      fill={look.symbol.fill ?? look.notation.fill}
      stroke={look.symbol.stroke ?? look.notation.stroke}
      shape={look.symbol.shape}
      container={look.container}
      zoom={zoom}
    />
  );
}

/** A line drawn as the canvas draws it: the kind's dash and heads, then its mid glyph or its label. */
export function LineShape(props: { metamodel: Metamodel; line: DrawnLine; selected?: boolean; markerPrefix?: string }) {
  const { metamodel, line: drawn, selected = false, markerPrefix = "" } = props;
  const { p, q, rel, type, interaction, label } = drawn;
  const line = lineFor(metamodel, rel?.type);
  return (
    <g>
      <line
        className={["line", interaction && "interaction", selected && "selected"].filter(Boolean).join(" ")}
        data-relationship={type?.verb}
        x1={p.x}
        y1={p.y}
        x2={q.x}
        y2={q.y}
        strokeDasharray={line.dash}
        markerStart={markerUrl(line.start, markerPrefix)}
        markerEnd={markerUrl(line.end, markerPrefix)}
      />
      {line.mid && !label && (
        <GlyphUse glyph={line.mid} x={(p.x + q.x) / 2 - 8} y={(p.y + q.y) / 2 - 8} size={16} colour="var(--fg-2)" />
      )}
      {label && rel && (
        <text className="line-label" x={(p.x + q.x) / 2} y={(p.y + q.y) / 2 - 4}>
          {label}
        </text>
      )}
    </g>
  );
}

const PAD = 24;

/**
 * A read-only picture of a canvas, drawn exactly as the editor draws it, scaled to fit. Used where a diagram is
 * shown inside another view, e.g. a document's linked context diagram.
 */
export function DiagramPicture(props: {
  state: ModelState;
  metamodel: Metamodel;
  diagramId: Id;
  maxHeight?: number;
  onOpen?(): void;
}) {
  const { state, metamodel, diagramId, maxHeight = 360, onOpen } = props;
  const diagram = state.diagrams.get(diagramId);
  const occurrences = state.objectOccurrences.find("byDiagram", diagramId);
  if (!diagram || occurrences.length === 0) return null;
  const boxes = layoutBoxes(state, diagramId);
  const all = [...boxes.values()];
  const minX = Math.min(...all.map((b) => b.x)) - PAD;
  const minY = Math.min(...all.map((b) => b.y)) - PAD;
  const maxX = Math.max(...all.map((b) => b.x + b.w)) + PAD;
  const maxY = Math.max(...all.map((b) => b.y + b.h)) + PAD;
  const prefix = `pic-${diagramId}-`;
  return (
    <div className="canvas picture">
      <svg
        role="img"
        aria-label="Diagram preview"
        viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
        style={{ maxHeight: Math.min(maxHeight, maxY - minY) }}
        onDoubleClick={onOpen}
      >
        <defs>
          <ArrowMarkers prefix={prefix} />
        </defs>
        {paintOrder(occurrences, boxes).map((o) => {
          const look = symbolLook(state, metamodel, diagram, o, 1);
          return (
            <g
              key={o.id}
              className="occ"
              data-name={look.object?.name}
              style={{ "--occ-ink": look.ink } as CSSProperties}
            >
              <SymbolShape look={look} box={boxes.get(o.id)!} zoom={1} />
            </g>
          );
        })}
        {drawnLines(state, metamodel, diagramId, boxes).map((line) => (
          <LineShape key={line.l.id} metamodel={metamodel} line={line} markerPrefix={prefix} />
        ))}
      </svg>
    </div>
  );
}
