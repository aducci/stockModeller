// Edits the document view makes (views-and-design-artifacts.md §7): new documents, linked diagrams created from a
// section, and relationships placed on a linked diagram, each as one change.
import type { DiagramRow, Metamodel, ModelState, ObjectRow } from "@connectome/engine";
import { ulid, type DiagramType, type Edit, type Id } from "@connectome/model";
import { canBeSubject } from "@connectome/views";
import { GRID, snap, symbolFor } from "./diagram";
import { aboutEdits } from "./subjects";

/** Where the subject sits on a new linked diagram, and how far its counterparts are placed around it. */
const CENTRE = { x: 480, y: 320 };
const RADIUS = 240;

/** Document types (templates) an object can be the subject of, for its "New ▸" menu. */
export function templatesFor(metamodel: Metamodel, object: ObjectRow): DiagramType[] {
  return metamodel
    .allDiagramTypes()
    .filter((t) => t.definition.kind === "document" && t.template && canBeSubject(metamodel, t.template, object))
    .map((t) => t.definition);
}

/** A new document about `subject`, in the subject's folder, linked from the subject's documentation (DOC-1). */
export function newDocumentPlan(
  state: ModelState,
  metamodel: Metamodel,
  template: DiagramType,
  subject: ObjectRow,
  id: Id = ulid(),
): { label: string; edits: Edit[] } {
  const about = aboutEdits(state, metamodel, template.key, subject.id, id);
  return {
    label: `New ${template.name} for ${subject.name}`,
    edits: [
      {
        edit: "createDiagram",
        id,
        name: `${subject.name} ${template.name.toLowerCase()}`,
        diagramType: template.key,
        folderId: subject.folderId,
        definition: about.definition,
      },
      ...about.edits,
    ],
  };
}

/** Creates the diagram a diagramLink section links to, with the subject in the middle, and links it: one change. */
export function createLinkedDiagramPlan(
  state: ModelState,
  metamodel: Metamodel,
  document: DiagramRow,
  section: { key: string; title: string; config: { diagramType: string; placeSubject?: boolean } },
  subject: ObjectRow | undefined,
  id: Id = ulid(),
): { label: string; edits: Edit[] } {
  const name = subject
    ? `${subject.name} ${section.title.toLowerCase()}`
    : `${document.name} ${section.title.toLowerCase()}`;
  // The linked diagram is about the document's subject too (DOC-1), so the subject's documentation links it.
  const about = subject ? aboutEdits(state, metamodel, section.config.diagramType, subject.id, id) : undefined;
  const edits: Edit[] = [
    {
      edit: "createDiagram",
      id,
      name,
      diagramType: section.config.diagramType,
      folderId: document.folderId,
      ...(about ? { definition: about.definition } : {}),
    },
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
  edits.push(...(about?.edits ?? []));
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

/**
 * Draws several relationships on a diagram against a growing picture: ends placed by an earlier one (or listed in
 * `placed`, occurrences added in the same change) are reused, new ones go around the anchor.
 */
export function placeRelationshipsEdits(
  state: ModelState,
  metamodel: Metamodel,
  diagram: DiagramRow,
  relationships: readonly { id: Id; sourceId: Id; targetId: Id }[],
  anchorId: Id | undefined,
  placed: readonly { id: Id; objectId: Id; x: number; y: number; w: number; h: number }[] = [],
): Edit[] {
  const edits: Edit[] = [];
  const top = [
    ...state.objectOccurrences.find("byDiagram", diagram.id).filter((o) => !o.parentOccurrenceId),
    ...placed,
  ];
  const at = new Map(top.map((o) => [o.objectId, o.id]));
  const anchor = top.find((o) => o.objectId === anchorId) ?? top[0];
  const centre = anchor ? { x: anchor.x + anchor.w / 2, y: anchor.y + anchor.h / 2 } : CENTRE;
  let count = Math.max(0, top.length - 1);
  for (const r of relationships) {
    for (const objectId of [r.sourceId, r.targetId]) {
      if (at.has(objectId)) continue;
      const object = state.objects.get(objectId);
      if (!object) continue;
      const symbol = symbolFor(metamodel, diagram, object.type);
      const angle = (count * Math.PI) / 3 + (count >= 6 ? Math.PI / 6 : 0);
      const radius = count >= 6 ? RADIUS * 1.6 : RADIUS;
      count++;
      const id = ulid();
      at.set(objectId, id);
      edits.push({
        edit: "addObjectOccurrence",
        diagramId: diagram.id,
        occurrence: occurrenceAt(
          id,
          objectId,
          centre.x + radius * Math.cos(angle) - symbol.width / 2,
          centre.y + radius * 0.7 * Math.sin(angle) - symbol.height / 2,
          symbol,
        ),
      });
    }
    const source = at.get(r.sourceId);
    const target = at.get(r.targetId);
    if (source && target)
      edits.push({
        edit: "addRelationshipOccurrence",
        diagramId: diagram.id,
        occurrence: {
          id: ulid(),
          relationshipId: r.id,
          sourceOccurrenceId: source,
          targetOccurrenceId: target,
          shownAs: "line",
          route: { mode: "auto" },
          labelPosition: 0.5,
          style: {},
        },
      });
  }
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
