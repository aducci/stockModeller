// Views of every kind in the workbench (design/02-model/views-and-design-artifacts.md §2): their glyphs and names,
// and the plans that create one from an element in a single change.
import type { DiagramRow, Metamodel, ModelState, ObjectRow, ResolvedDiagramType } from "@connectome/engine";
import { SUBJECT_KEY, ulid, type Edit, type Id, type ViewKind } from "@connectome/model";
import { placeRelationshipsEdits } from "./document";
import { interactionPartners, newSequenceEdits } from "./sequence";
import { symbolFor } from "./diagram";
import { aboutEdits, canBeAbout } from "./subjects";
import { decompositionPlan } from "./decompose";

export const KIND_GLYPH: Record<ViewKind, string> = { canvas: "⧉", matrix: "▦", document: "▤", sequence: "⇅" };

export const KIND_NAME: Record<ViewKind, string> = {
  canvas: "Diagram",
  matrix: "Matrix",
  document: "Document",
  sequence: "Sequence",
};

/** The kinds in the order the New diagram dialog lists them, with their group names. */
export const KINDS: { kind: ViewKind; name: string; description: string }[] = [
  { kind: "canvas", name: "Diagrams", description: "Boxes and lines you arrange by hand" },
  { kind: "matrix", name: "Matrices", description: "Rows × columns of relationships, edited by clicking cells" },
  { kind: "document", name: "Documents", description: "Design artifacts about one element, built from a template" },
  { kind: "sequence", name: "Sequences", description: "Lifelines and the messages between them, in order" },
];

export const kindOfType = (type: ResolvedDiagramType | undefined): ViewKind => type?.definition.kind ?? "canvas";

/** Which kind a diagram is: its diagram type's kind (§2). */
export function viewKind(state: ModelState, metamodel: Metamodel, id: Id): ViewKind {
  const diagram = state.diagrams.get(id);
  return kindOfType(diagram && metamodel.diagramType(diagram.diagramType));
}

/** Canvas types an object can be drawn on and be the subject of, for its "New ▸" menu. */
export function canvasTypesFor(metamodel: Metamodel, object: ObjectRow): ResolvedDiagramType[] {
  return metamodel
    .allDiagramTypes()
    .filter(
      (t) =>
        kindOfType(t) === "canvas" &&
        metamodel.diagramAllowsObjectType(t, object.type) &&
        canBeAbout(metamodel, t, object),
    );
}

/**
 * A new canvas with the object in the middle and what it is related to around it: every relationship of a type the
 * diagram type allows, to an element it allows (at most 12), as one change. A decomposition type (DOC-1b) shows the
 * object's parts instead.
 */
export function diagramAroundPlan(
  state: ModelState,
  metamodel: Metamodel,
  type: ResolvedDiagramType,
  object: ObjectRow,
  id: Id = ulid(),
): { label: string; edits: Edit[] } {
  if (type.definition.decomposes) return decompositionPlan(state, metamodel, type, object, id);
  const name = `${object.name} ${type.definition.name.toLowerCase()}`;
  const diagram = { id, diagramType: type.definition.key } as DiagramRow;
  const symbol = symbolFor(metamodel, diagram, object.type);
  const centre = {
    id: ulid(),
    objectId: object.id,
    parentOccurrenceId: null,
    x: 480 - symbol.width / 2,
    y: 320 - symbol.height / 2,
    w: symbol.width,
    h: symbol.height,
    z: 1,
    style: {},
    drillDownDiagramId: null,
    pinned: false,
  };
  const allowedRel = type.definition.relationshipTypes;
  const related = [
    ...state.relationships.find("bySource", object.id),
    ...state.relationships.find("byTarget", object.id),
  ]
    .filter((r) => !r.parentId && r.sourceId !== r.targetId)
    .filter((r) => !allowedRel?.length || allowedRel.includes(r.type))
    .filter((r) => {
      const other = state.objects.get(r.sourceId === object.id ? r.targetId : r.sourceId);
      return other && metamodel.diagramAllowsObjectType(type, other.type);
    })
    .slice(0, 12);
  // The diagram is about the object (DOC-1): its subject, and a link in the object's documentation.
  const about = aboutEdits(state, metamodel, type.definition.key, object.id, id);
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
      { edit: "addObjectOccurrence", diagramId: id, occurrence: centre },
      ...placeRelationshipsEdits(state, metamodel, diagram, related, object.id, [centre]),
      ...about.edits,
    ],
  };
}

/** A new sequence of an object's interactions: it and its partners as lifelines, then their messages. */
export function sequenceOfPlan(
  state: ModelState,
  metamodel: Metamodel,
  type: ResolvedDiagramType,
  object: ObjectRow,
  id: Id = ulid(),
): { label: string; edits: Edit[] } {
  const name = `${object.name} interactions`;
  const about = aboutEdits(state, metamodel, type.definition.key, object.id, id);
  return {
    label: `New ${name}`,
    edits: [
      ...newSequenceEdits(state, metamodel, [object.id, ...interactionPartners(state, metamodel, object.id)], {
        id,
        name,
        diagramType: type.definition.key,
        folderId: object.folderId,
        definition: about.definition,
      }),
      ...about.edits,
    ],
  };
}

/** The first sequence-kind diagram type, for "New ▸ Sequence". */
export const sequenceType = (metamodel: Metamodel) =>
  metamodel.allDiagramTypes().find((t) => kindOfType(t) === "sequence");

const mentions = (value: unknown, id: Id): boolean =>
  value === id ||
  (Array.isArray(value)
    ? value.some((v) => mentions(v, id))
    : !!value && typeof value === "object"
      ? Object.values(value).some((v) => mentions(v, id))
      : false);

/** The documents a view is part of: those whose sections link it (a diagram link, a sequence link). */
export function documentsLinking(state: ModelState, metamodel: Metamodel, id: Id): DiagramRow[] {
  return [...state.diagrams.live()].filter(
    (d) =>
      d.id !== id &&
      kindOfType(metamodel.diagramType(d.diagramType)) === "document" &&
      Object.entries(d.definition ?? {}).some(([k, v]) => k !== SUBJECT_KEY && mentions(v, id)),
  );
}
