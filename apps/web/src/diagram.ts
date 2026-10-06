// The diagram editor's arithmetic and model look-ups (design/04-ux/diagram-editor.md), kept free of React so
// they can be tested on their own.
import type { DiagramRow, Metamodel, ModelState, ResolvedObjectType } from "@connectome/engine";
import type { Id, RelationshipType, SymbolStyle, TypeKey } from "@connectome/model";

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
    .filter((r) => r.targetId === targetId && shown(r.type))
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
