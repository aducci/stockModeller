// Decomposition diagrams (design/02-model/views-and-design-artifacts.md §12, slice DOC-1b): a diagram type that
// `decomposes` makes what is drawn on a diagram about X a part of X, through its relationship type. L0 to L3 is depth
// in that tree, followed by the breadcrumb, not four diagram types. Pure.
import type { DiagramRow, Metamodel, ModelState, ObjectRow, ResolvedDiagramType } from "@connectome/engine";
import { ulid, type Edit, type Id, type TypeKey } from "@connectome/model";
import { GRID, snap, symbolFor } from "./diagram";
import { placeRelationshipsEdits } from "./document";
import { aboutEdits, diagramsAbout, subjectIdOf } from "./subjects";

/** The key in a decomposition diagram's definition that lists the parts its banner no longer offers. */
export const IGNORED_PARTS = "ignoredParts";

export interface Decomposing {
  subject: ObjectRow;
  relationship: TypeKey;
  childTypes?: TypeKey[];
}

/** What a diagram decomposes: its live subject and the relationship type to its parts, when its type decomposes. */
export function decompositionOf(
  state: ModelState,
  metamodel: Metamodel,
  diagram: DiagramRow | undefined,
): Decomposing | undefined {
  const decomposes = diagram && metamodel.diagramType(diagram.diagramType)?.definition.decomposes;
  const subjectId = subjectIdOf(diagram);
  const subject = subjectId ? state.objects.get(subjectId) : undefined;
  if (!decomposes || !subject) return undefined;
  return { subject, relationship: decomposes.relationship, childTypes: decomposes.childTypes };
}

/** An element's parts through a relationship type, in the order they were added. */
export function partsOf(state: ModelState, objectId: Id, relationship: TypeKey): ObjectRow[] {
  return state.relationships
    .find("bySource", objectId)
    .filter((r) => r.type === relationship && !r.parentId)
    .flatMap((r) => state.objects.get(r.targetId) ?? []);
}

/**
 * The edit that makes an element drawn on a decomposition diagram a part of its subject, when the type is one of its
 * child types and a rule allows it; nothing when it already is. `note` says why an element could not become a part.
 */
export function partEdits(
  state: ModelState,
  metamodel: Metamodel,
  diagram: DiagramRow,
  object: { id: Id; type: TypeKey },
): { edits: Edit[]; note?: string } {
  const d = decompositionOf(state, metamodel, diagram);
  if (!d || object.id === d.subject.id) return { edits: [] };
  if (d.childTypes && !d.childTypes.some((t) => metamodel.isA(object.type, t))) return { edits: [] };
  const toParent = state.relationships.find("byTarget", object.id).filter((r) => r.type === d.relationship);
  if (toParent.some((r) => r.sourceId === d.subject.id)) return { edits: [] };
  const type = metamodel.allowedRelationshipTypes(d.subject.type, object.type).find((t) => t.key === d.relationship);
  if (!type) return { edits: [] };
  const other = toParent.map((r) => state.objects.get(r.sourceId)).find(Boolean);
  if (other && type.singleParent) {
    const name = state.objects.get(object.id)?.name ?? "It";
    return { edits: [], note: `${name} is already part of ${other.name}, so it was not added to ${d.subject.name}` };
  }
  return {
    edits: [
      { edit: "createRelationship", id: ulid(), type: d.relationship, sourceId: d.subject.id, targetId: object.id },
    ],
  };
}

/** The subject's parts the diagram does not show and has not been told to ignore, that its type can show. */
export function missingParts(state: ModelState, metamodel: Metamodel, diagram: DiagramRow): ObjectRow[] {
  const d = decompositionOf(state, metamodel, diagram);
  const type = metamodel.diagramType(diagram.diagramType);
  if (!d || !type) return [];
  const shown = new Set(state.objectOccurrences.find("byDiagram", diagram.id).map((o) => o.objectId));
  const ignored = new Set((diagram.definition?.[IGNORED_PARTS] as Id[] | undefined) ?? []);
  return partsOf(state, d.subject.id, d.relationship).filter(
    (p) => !shown.has(p.id) && !ignored.has(p.id) && metamodel.diagramAllowsObjectType(type, p.type),
  );
}

const ROW_GAP = 40;

/**
 * Edits that draw parts in a row, left to right in their order, below what the diagram already shows, with the lines
 * between them (and what is already drawn) that the diagram type shows.
 */
export function placePartsEdits(
  state: ModelState,
  metamodel: Metamodel,
  diagram: DiagramRow,
  parts: readonly ObjectRow[],
): Edit[] {
  const type = metamodel.diagramType(diagram.diagramType);
  const existing = state.objectOccurrences.find("byDiagram", diagram.id).filter((o) => !o.parentOccurrenceId);
  const top = existing.length ? snap(Math.max(...existing.map((o) => o.y + o.h)) + ROW_GAP * 2) : GRID * 10;
  let x = GRID * 5;
  const placed = parts.map((part) => {
    const symbol = symbolFor(metamodel, diagram, part.type);
    const occurrence = {
      id: ulid(),
      objectId: part.id,
      parentOccurrenceId: null,
      x,
      y: top,
      w: symbol.width,
      h: symbol.height,
      z: 1,
      style: {},
      drillDownDiagramId: null,
      pinned: false,
    };
    x = snap(x + symbol.width + ROW_GAP);
    return occurrence;
  });
  const onDiagram = new Set([...existing.map((o) => o.objectId), ...parts.map((p) => p.id)]);
  const added = new Set(parts.map((p) => p.id));
  const drawn = new Set(state.relationshipOccurrences.find("byDiagram", diagram.id).map((l) => l.relationshipId));
  const lines = parts
    .flatMap((p) => [...state.relationships.find("bySource", p.id), ...state.relationships.find("byTarget", p.id)])
    .filter(
      (r, i, all) =>
        all.findIndex((s) => s.id === r.id) === i &&
        !r.parentId &&
        !drawn.has(r.id) &&
        r.sourceId !== r.targetId &&
        onDiagram.has(r.sourceId) &&
        onDiagram.has(r.targetId) &&
        (added.has(r.sourceId) || added.has(r.targetId)) &&
        (!type || metamodel.diagramAllowsRelationshipType(type, r.type)),
    );
  return [
    ...placed.map((occurrence): Edit => ({ edit: "addObjectOccurrence", diagramId: diagram.id, occurrence })),
    ...placeRelationshipsEdits(state, metamodel, diagram, lines, undefined, placed),
  ];
}

/** A new decomposition of an element: a diagram about it that shows the parts it already has, as one change. */
export function decompositionPlan(
  state: ModelState,
  metamodel: Metamodel,
  type: ResolvedDiagramType,
  object: ObjectRow,
  id: Id = ulid(),
): { label: string; edits: Edit[] } {
  const name = `${object.name} ${type.definition.name.toLowerCase()}`;
  const about = aboutEdits(state, metamodel, type.definition.key, object.id, id);
  const diagram = { id, diagramType: type.definition.key, definition: about.definition } as unknown as DiagramRow;
  const relationship = type.definition.decomposes!.relationship;
  const parts = partsOf(state, object.id, relationship).filter((p) => metamodel.diagramAllowsObjectType(type, p.type));
  return {
    label: `New ${name}`,
    edits: [
      {
        edit: "createDiagram",
        id,
        name,
        diagramType: type.definition.key,
        folderId: object.folderId,
        definition: about.definition,
      },
      ...placePartsEdits(state, metamodel, diagram, parts),
      ...about.edits,
    ],
  };
}

export interface Crumb {
  object: ObjectRow;
  /** The element's decomposition diagram, when it has one; absent for the diagram's own subject. */
  diagramId?: Id;
}

/**
 * The way up from a decomposition diagram: its subject's parents through the same relationship type, outermost first,
 * each with its decomposition diagram if it has one. Empty when the subject has no parent.
 */
export function breadcrumb(state: ModelState, metamodel: Metamodel, diagram: DiagramRow): Crumb[] {
  const d = decompositionOf(state, metamodel, diagram);
  if (!d) return [];
  const crumbs: Crumb[] = [{ object: d.subject }];
  const seen = new Set([d.subject.id]);
  let current = d.subject;
  for (let depth = 0; depth < 8; depth++) {
    const up = state.relationships
      .find("byTarget", current.id)
      .filter((r) => r.type === d.relationship && !r.parentId)
      .map((r) => state.objects.get(r.sourceId))
      .find((o): o is ObjectRow => !!o && !seen.has(o.id));
    if (!up) break;
    seen.add(up.id);
    const decomposition = diagramsAbout(state, metamodel, up.id).find(
      (v) => metamodel.diagramType(v.diagramType)?.definition.decomposes?.relationship === d.relationship,
    );
    crumbs.unshift({ object: up, diagramId: decomposition?.id });
    current = up;
  }
  return crumbs.length > 1 ? crumbs : [];
}
