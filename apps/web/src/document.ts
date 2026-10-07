// Edits the document view makes (views-and-design-artifacts.md §7): new documents, linked diagrams created from a
// section, and relationships placed on a linked diagram, each as one change.
import type { DiagramRow, Metamodel, ModelState, ObjectRow } from "@connectome/engine";
import { SUBJECT_KEY, ulid, type DiagramType, type Edit, type Id } from "@connectome/model";
import { canBeSubject } from "@connectome/views";
import { GRID, snap, symbolFor } from "./diagram";

/** Where the subject sits on a new linked diagram, and how far its counterparts are placed around it. */
const CENTRE = { x: 480, y: 320 };
const RADIUS = 240;

/** Document types (templates) an object can be the subject of, for its "New ▸" menu. */
export function templatesFor(metamodel: Metamodel, object: ObjectRow): DiagramType[] {
  return metamodel
    .allDiagramTypes()
    .map((t) => t.definition)
    .filter((t) => t.kind === "document" && t.document && canBeSubject(metamodel, t.document, object));
}

/** A new document about `subject`, in the subject's folder. */
export function newDocumentPlan(template: DiagramType, subject: ObjectRow, id: Id = ulid()) {
  return {
    label: `New ${template.name} for ${subject.name}`,
    edits: [
      {
        edit: "createDiagram",
        id,
        name: `${subject.name} ${template.name.toLowerCase()}`,
        diagramType: template.key,
        folderId: subject.folderId,
        definition: { [SUBJECT_KEY]: subject.id },
      },
    ] satisfies Edit[],
  };
}

/** Creates the diagram a diagramLink section links to, with the subject in the middle, and links it: one change. */
export function createLinkedDiagramPlan(
  metamodel: Metamodel,
  document: DiagramRow,
  section: { key: string; title: string; config: { diagramType: string; placeSubject?: boolean } },
  subject: ObjectRow | undefined,
  id: Id = ulid(),
): { label: string; edits: Edit[] } {
  const name = subject
    ? `${subject.name} ${section.title.toLowerCase()}`
    : `${document.name} ${section.title.toLowerCase()}`;
  const edits: Edit[] = [
    { edit: "createDiagram", id, name, diagramType: section.config.diagramType, folderId: document.folderId },
  ];
  if (subject && section.config.placeSubject !== false) {
    const diagram = { ...document, id, diagramType: section.config.diagramType };
    const symbol = symbolFor(metamodel, diagram, subject.type);
    edits.push({
      edit: "addObjectOccurrence",
      diagramId: id,
      occurrence: occurrenceAt(ulid(), subject.id, CENTRE.x - symbol.width / 2, CENTRE.y - symbol.height / 2, symbol),
    });
  }
  edits.push({
    edit: "setViewDefinition",
    diagramId: document.id,
    baseVersion: document.version,
    set: { [section.key]: { diagramId: id } },
  });
  return { label: `Create ${name}`, edits };
}

/**
 * Draws a relationship on a diagram: its ends are placed first when missing (around the subject, or the first end
 * already there), then the line. `relationship` may be created in the same change, so its ends are passed in.
 */
export function placeRelationshipEdits(
  state: ModelState,
  metamodel: Metamodel,
  diagram: DiagramRow,
  relationship: { id: Id; sourceId: Id; targetId: Id },
  anchorId: Id | undefined,
): Edit[] {
  const edits: Edit[] = [];
  const existing = state.objectOccurrences.find("byDiagram", diagram.id);
  const occurrenceOf = (objectId: Id) => existing.find((o) => o.objectId === objectId && !o.parentOccurrenceId);
  const anchor =
    (anchorId && occurrenceOf(anchorId)) ?? occurrenceOf(relationship.sourceId) ?? occurrenceOf(relationship.targetId);
  const centre = anchor ? { x: anchor.x + anchor.w / 2, y: anchor.y + anchor.h / 2 } : CENTRE;
  let placed = existing.filter((o) => !o.parentOccurrenceId).length;
  const ends: Record<string, Id> = {};
  for (const objectId of [relationship.sourceId, relationship.targetId]) {
    const found = occurrenceOf(objectId) ?? (ends[objectId] ? { id: ends[objectId]! } : undefined);
    if (found) {
      ends[objectId] = found.id;
      continue;
    }
    const object = state.objects.get(objectId);
    if (!object) continue;
    const symbol = symbolFor(metamodel, diagram, object.type);
    // Around the anchor, a sixth of a turn apart, starting on the right.
    const angle = (placed * Math.PI) / 3;
    placed++;
    const id = ulid();
    ends[objectId] = id;
    edits.push({
      edit: "addObjectOccurrence",
      diagramId: diagram.id,
      occurrence: occurrenceAt(
        id,
        objectId,
        snap(centre.x + RADIUS * Math.cos(angle) - symbol.width / 2),
        snap(centre.y + RADIUS * 0.7 * Math.sin(angle) - symbol.height / 2),
        symbol,
      ),
    });
  }
  const source = ends[relationship.sourceId];
  const target = ends[relationship.targetId];
  if (source && target)
    edits.push({
      edit: "addRelationshipOccurrence",
      diagramId: diagram.id,
      occurrence: {
        id: ulid(),
        relationshipId: relationship.id,
        sourceOccurrenceId: source,
        targetOccurrenceId: target,
        shownAs: "line",
        route: { mode: "auto" },
        labelPosition: 0.5,
        style: {},
      },
    });
  return edits;
}

function occurrenceAt(id: Id, objectId: Id, x: number, y: number, size: { width: number; height: number }) {
  return {
    id,
    objectId,
    parentOccurrenceId: null,
    x: Math.max(GRID, snap(x)),
    y: Math.max(GRID, snap(y)),
    w: size.width,
    h: size.height,
    z: 1,
    style: {},
    drillDownDiagramId: null,
    pinned: false,
  };
}
