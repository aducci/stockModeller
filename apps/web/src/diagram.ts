// The diagram editor's arithmetic and model look-ups (design/04-ux/diagram-editor.md), kept free of React so
// they can be tested on their own.
import type {
  DiagramRow,
  Metamodel,
  ModelState,
  ObjectRow,
  ResolvedObjectType,
  ResolvedRelationshipType,
} from "@connectome/engine";
import {
  DEFAULT_SEMANTIC_ZOOM,
  RENDITIONS,
  isRendition,
  type Edit,
  type Id,
  type PropertyValue,
  type RelationshipType,
  type Rendition,
  type SymbolStyle,
  type TypeKey,
} from "@connectome/model";

export const GRID = 8;
const DEFAULT_SIZE = { width: 120, height: 48 };

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const snap = (n: number) => Math.round(n / GRID) * GRID;

/** A symbol's look: the object type's symbol, overridden by the diagram type's, then by the occurrence's. */
export function symbolFor(
  metamodel: Metamodel,
  diagram: DiagramRow,
  type: TypeKey,
  override: Partial<SymbolStyle> = {},
): Partial<SymbolStyle> & { width: number; height: number } {
  const objectType = metamodel.objectType(type);
  const byDiagram = metamodel.diagramType(diagram.diagramType)?.definition.symbols ?? {};
  // A diagram type's symbol for a parent type applies to its subtypes, the nearest one winning.
  const inherited = [...(objectType?.lineage ?? [type])].reverse().map((t) => byDiagram[t] ?? {});
  return { ...DEFAULT_SIZE, ...objectType?.symbol, ...Object.assign({}, ...inherited), ...override };
}

/**
 * The rendition an occurrence is drawn in (notation-and-metamodel-admin.md §4): below a semantic zoom level the
 * level's rendition wins; otherwise the occurrence's own, then its symbol's (type or diagram type), then the diagram
 * type's default, then a box.
 */
export function renditionFor(
  metamodel: Metamodel,
  diagram: DiagramRow,
  symbol: Partial<SymbolStyle>,
  zoom = 1,
): { key: string } & Rendition {
  const config = metamodel.diagramType(diagram.diagramType)?.definition.renditions;
  const levels = [...(config?.semanticZoom ?? DEFAULT_SEMANTIC_ZOOM)].sort((a, b) => a.below - b.below);
  const zoomed = levels.find((level) => zoom < level.below)?.rendition;
  const key = [zoomed, symbol.rendition, config?.default].find((k): k is string => !!k && isRendition(k)) ?? "box";
  return { key, ...RENDITIONS[key]! };
}

/** The size an occurrence takes when it switches to a rendition: the rendition's own, or the type's for a box. */
export function renditionSize(rendition: Rendition, typeSymbol: { width: number; height: number }) {
  return { w: rendition.width ?? typeSymbol.width, h: rendition.height ?? typeSymbol.height };
}

export interface CardRow {
  label: string;
  text: string;
  /** A list value's own colour, drawn as a dot before the text. */
  colour?: string;
}

/** The property rows a card shows: the object's values that are set, in its type's order, up to `rows`. */
export function cardRows(metamodel: Metamodel, object: ObjectRow, rows: number): CardRow[] {
  const keys = [...(metamodel.objectType(object.type)?.properties ?? [])];
  const out: CardRow[] = [];
  for (const key of keys) {
    const value = object.properties[key];
    const pt = metamodel.propertyType(key);
    if (value === undefined || value === null || value === "" || !pt) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    const list = pt.valueList ? metamodel.valueList(pt.valueList) : undefined;
    const entry = (k: unknown) => list?.values.find((v) => v.key === k);
    const text = list
      ? (Array.isArray(value) ? value : [value]).map((k) => entry(k)?.label ?? String(k)).join(", ")
      : formatValue(value);
    out.push({ label: pt.name, text, colour: Array.isArray(value) ? undefined : entry(value)?.color });
    if (out.length === rows) break;
  }
  return out;
}

function formatValue(value: PropertyValue): string {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) return `${value.amount} ${value.currency}`;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return Array.isArray(value) ? value.join(", ") : String(value);
}

/** Shortens text to fit a width at the canvas's 12px font, with an ellipsis. */
export function fitText(text: string, width: number, charWidth = 6.6): string {
  const max = Math.max(1, Math.floor(width / charWidth));
  return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1))}…`;
}

export const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.8, 1, 1.25, 1.5, 2] as const;

/** The next zoom step in a direction from the current zoom. */
export function stepZoom(zoom: number, direction: 1 | -1): number {
  const steps = direction > 0 ? ZOOM_STEPS : [...ZOOM_STEPS].reverse();
  return steps.find((z) => (direction > 0 ? z > zoom + 1e-6 : z < zoom - 1e-6)) ?? steps[steps.length - 1]!;
}

/** Diagram positions of every occurrence on a diagram (nested ones are stored relative to their parent). */
export function layoutBoxes(state: ModelState, diagramId: Id, offset?: { id: Id; dx: number; dy: number }) {
  const boxes = new Map<Id, Box>();
  const place = (occId: Id, seen: Set<Id>): Box | undefined => {
    const known = boxes.get(occId);
    if (known) return known;
    const occ = state.objectOccurrences.get(occId);
    if (!occ || seen.has(occId)) return undefined;
    seen.add(occId);
    const parent = occ.parentOccurrenceId ? place(occ.parentOccurrenceId, seen) : undefined;
    const moved = offset?.id === occId ? offset : { dx: 0, dy: 0 };
    const box = {
      x: occ.x + moved.dx + (parent?.x ?? 0),
      y: occ.y + moved.dy + (parent?.y ?? 0),
      w: occ.w,
      h: occ.h,
    };
    boxes.set(occId, box);
    return box;
  };
  for (const o of state.objectOccurrences.find("byDiagram", diagramId)) place(o.id, new Set());
  return boxes;
}

/** Where the line from a box's centre towards a point leaves the box. */
export function edgePoint(box: Box, toward: { x: number; y: number }): { x: number; y: number } {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const scale = Math.min(
    dx === 0 ? Infinity : box.w / 2 / Math.abs(dx),
    dy === 0 ? Infinity : box.h / 2 / Math.abs(dy),
  );
  return { x: cx + dx * scale, y: cy + dy * scale };
}

/** Object types the palette offers for a diagram: those its type shows, abstract ones left out, in package order. */
export function paletteTypes(metamodel: Metamodel, diagram: DiagramRow): ResolvedObjectType[] {
  const type = metamodel.diagramType(diagram.diagramType);
  if (!type) return [];
  return metamodel
    .allObjectTypes()
    .filter((t) => !t.definition.abstract && metamodel.diagramAllowsObjectType(type, t.definition.key));
}

/**
 * The folder a new object of a type goes to: its type's default folder (a path of folder names) if that exists,
 * else the diagram's folder (decision B19).
 */
export function defaultFolderFor(state: ModelState, metamodel: Metamodel, type: TypeKey, diagram: DiagramRow): Id {
  const path = metamodel.objectType(type)?.definition.defaultFolder;
  if (path) {
    let parent = "";
    let found: Id | null = null;
    for (const name of path.split("/").filter(Boolean)) {
      found = state.folders.find("byParent", parent).find((f) => f.name === name)?.id ?? null;
      if (!found) break;
      parent = found;
    }
    if (found) return found;
  }
  return diagram.folderId;
}

/**
 * Where a symbol added without a drop point goes: the first place in `area` (the part of the diagram in view) where it
 * covers no other symbol, scanning rows from the top left; the middle of the area when it is full.
 */
export function freeSpot(boxes: Iterable<Box>, size: { w: number; h: number }, area: Box): { x: number; y: number } {
  const taken = [...boxes];
  const gap = 16;
  const clear = (x: number, y: number) =>
    taken.every(
      (b) => x + size.w + gap <= b.x || b.x + b.w + gap <= x || y + size.h + gap <= b.y || b.y + b.h + gap <= y,
    );
  for (let y = snap(area.y + gap); y + size.h <= area.y + area.h; y += GRID * 2)
    for (let x = snap(area.x + gap); x + size.w <= area.x + area.w; x += GRID * 2) if (clear(x, y)) return { x, y };
  return { x: snap(area.x + area.w / 2 - size.w / 2), y: snap(area.y + area.h / 2 - size.h / 2) };
}

/** How a symbol dropped inside another is nested: by an existing relationship, a new one of `type`, or not at all. */
export type NestingChoice = { type: ResolvedRelationshipType; existingId?: Id } | { refused: string };

/**
 * What nests an object of `childType` (an existing object, or a new one when `childId` is null) inside `parentId` on
 * a diagram (design/04-ux/diagram-editor.md §8): a nesting relationship already between them, else the nesting types
 * the rules allow, containment first, then the most used. Null when the diagram shows nesting as lines.
 */
export function nestingChoice(
  state: ModelState,
  metamodel: Metamodel,
  diagram: DiagramRow,
  parentId: Id,
  childType: TypeKey,
  childId: Id | null,
): NestingChoice | null {
  const diagramType = metamodel.diagramType(diagram.diagramType);
  const parent = state.objects.get(parentId);
  if (!diagramType || diagramType.nesting !== "nested" || !parent) return null;
  const shown = (t: TypeKey) => metamodel.diagramAllowsRelationshipType(diagramType, t);
  const nests = (t: TypeKey) => metamodel.relationshipType(t)?.nesting === true && shown(t);
  if (childId) {
    const existing = state.relationships
      .find("bySource", parentId)
      .find((r) => r.targetId === childId && nests(r.type));
    if (existing) return { type: metamodel.relationshipType(existing.type)!, existingId: existing.id };
  }
  const uses = new Map<TypeKey, number>();
  for (const r of state.relationships.live()) uses.set(r.type, (uses.get(r.type) ?? 0) + 1);
  const [type] = metamodel
    .allowedRelationshipTypes(parent.type, childType)
    .filter((t) => nests(t.key))
    .sort(
      (a, b) =>
        Number(b.semantic === "containment") - Number(a.semantic === "containment") ||
        (uses.get(b.key) ?? 0) - (uses.get(a.key) ?? 0) ||
        a.name.localeCompare(b.name),
    );
  const typeName = metamodel.objectType(childType)?.definition.name ?? childType;
  if (!type) return { refused: `No rule lets ${article(typeName)} ${typeName} go inside ${parent.name}` };
  // One parent only: an object already inside something else stays there.
  const other = childId
    ? state.relationships.find("byTarget", childId).find((r) => r.type === type.key && r.sourceId !== parentId)
    : undefined;
  if (other && type.singleParent) {
    const child = state.objects.get(childId!)!;
    return {
      refused: `${child.name} is already inside ${state.objects.get(other.sourceId)?.name ?? "another object"}`,
    };
  }
  return { type };
}

const article = (word: string) => (/^[aeiou]/i.test(word) ? "an" : "a");

export interface ConnectChoice {
  type: RelationshipType;
  /** An existing relationship between the two objects: choosing it only draws a new line. */
  existingId?: Id;
}

/**
 * What a connection from one object to another can be: existing relationships between them first, then the types
 * the rules allow for the pair and the diagram type shows, most used in the repository first.
 */
export function connectChoices(
  state: ModelState,
  metamodel: Metamodel,
  diagram: DiagramRow,
  sourceId: Id,
  targetId: Id,
): ConnectChoice[] {
  const source = state.objects.get(sourceId);
  const target = state.objects.get(targetId);
  const diagramType = metamodel.diagramType(diagram.diagramType);
  if (!source || !target || !diagramType) return [];
  const shown = (t: TypeKey) => metamodel.diagramAllowsRelationshipType(diagramType, t);

  const existing = state.relationships
    .find("bySource", sourceId)
    .filter((r) => r.targetId === targetId && r.parentId === null && shown(r.type)) // messages go with their interaction
    .flatMap((r) => {
      const type = metamodel.relationshipType(r.type);
      return type ? [{ type, existingId: r.id }] : [];
    });

  const uses = new Map<TypeKey, number>();
  for (const r of state.relationships.live()) uses.set(r.type, (uses.get(r.type) ?? 0) + 1);
  const allowed = metamodel
    .allowedRelationshipTypes(source.type, target.type)
    .filter((t) => shown(t.key))
    .sort((a, b) => (uses.get(b.key) ?? 0) - (uses.get(a.key) ?? 0) || a.name.localeCompare(b.name))
    .map((type) => ({ type }));
  return [...existing, ...allowed];
}

/**
 * What deleting an object takes with it, for the Shift+Delete dialog: its relationships, its children (the objects
 * it nests, which stay in the model) and the diagrams other than `diagramId` it occurs on.
 */
export function deletionImpact(state: ModelState, metamodel: Metamodel, objectId: Id, diagramId: Id | null) {
  const relationships = [
    ...state.relationships.find("bySource", objectId),
    ...state.relationships.find("byTarget", objectId),
  ];
  const children = [
    ...new Set(
      state.relationships
        .find("bySource", objectId)
        .filter((r) => metamodel.relationshipType(r.type)?.nesting)
        .map((r) => r.targetId),
    ),
  ];
  const diagrams = [...new Set(state.objectOccurrences.find("byObject", objectId).map((o) => o.diagramId))]
    .filter((d) => d !== diagramId)
    .flatMap((d) => state.diagrams.get(d) ?? []);
  // Contents (containment) can be kept, moving up a level, or deleted too (semantics.md §7).
  const contents = state.relationships
    .find("bySource", objectId)
    .filter((r) => metamodel.relationshipType(r.type)?.semantic === "containment")
    .map((r) => r.targetId);
  return { relationships, children, contents, diagrams };
}

/**
 * Adds an object to a diagram from outside the editor (the Relations window's "Add to open diagram"): one occurrence
 * at the left edge, below everything already drawn. An error when the diagram type does not admit the object's type.
 */
export function addToDiagramPlan(
  state: ModelState,
  metamodel: Metamodel,
  diagramId: Id,
  objectId: Id,
  occurrenceId: Id,
): { label: string; edits: Edit[] } | { error: string } {
  const diagram = state.diagrams.get(diagramId);
  const object = state.objects.get(objectId);
  if (!diagram || !object) return { error: "That diagram or object was deleted meanwhile." };
  const diagramType = metamodel.diagramType(diagram.diagramType);
  if (diagramType && !metamodel.diagramAllowsObjectType(diagramType, object.type)) {
    const typeName = metamodel.objectType(object.type)?.definition.name ?? object.type;
    return { error: `${diagram.name} does not show objects of type ${typeName}.` };
  }
  const symbol = symbolFor(metamodel, diagram, object.type);
  const occurrences = state.objectOccurrences.find("byDiagram", diagramId);
  const bottom = Math.max(0, ...[...layoutBoxes(state, diagramId).values()].map((b) => b.y + b.h));
  return {
    label: `Add ${object.name} to ${diagram.name}`,
    edits: [
      {
        edit: "addObjectOccurrence",
        diagramId,
        occurrence: {
          id: occurrenceId,
          objectId,
          parentOccurrenceId: null,
          x: GRID * 5,
          y: snap(bottom + GRID * 5),
          w: symbol.width,
          h: symbol.height,
          z: Math.max(0, ...occurrences.map((o) => o.z)) + 1,
          style: {},
          drillDownDiagramId: null,
          pinned: false,
        },
      },
    ],
  };
}
