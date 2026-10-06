// Engine rows → API shapes (design/03-platform/openapi.yaml). Bookkeeping fields stay internal.
import type { Diagram, ModelObject, Relationship } from "@connectome/model";
import type { ModelState, ObjectRow, RelationshipRow } from "@connectome/engine";

export function objectJson(r: ObjectRow): ModelObject {
  return {
    id: r.id,
    type: r.type,
    name: r.name,
    key: r.key,
    folderId: r.folderId,
    description: r.description,
    properties: r.properties,
    tags: r.tags,
    externalIds: r.externalIds,
    version: r.version,
    updatedAt: r.updatedAt ?? "",
    updatedBy: r.updatedBy ?? "",
  };
}

export function relationshipJson(r: RelationshipRow): Relationship {
  return {
    id: r.id,
    type: r.type,
    sourceId: r.sourceId,
    targetId: r.targetId,
    name: r.name,
    properties: r.properties,
    tags: r.tags,
    externalIds: r.externalIds,
    derivedBy: r.derivedBy,
    payload: r.payload,
    parentId: r.parentId,
    rank: r.rank,
    version: r.version,
    updatedAt: r.updatedAt ?? "",
    updatedBy: r.updatedBy ?? "",
  };
}

type Placed = { diagramId: string; deleted: boolean; scenarioId?: string; baseVersion?: number | null };

function strip<T extends Placed>(row: T): Omit<T, keyof Placed> {
  const { diagramId: _d, deleted: _x, scenarioId: _s, baseVersion: _b, ...rest } = row;
  return rest;
}

const byZThenId = <T extends { z?: number; id: string }>(a: T, b: T) =>
  (a.z ?? 0) - (b.z ?? 0) || a.id.localeCompare(b.id);

/** A diagram with its occurrences and annotations; undefined if there is no live diagram with this id. */
export function diagramJson(state: ModelState, id: string): Diagram | undefined {
  const d = state.diagrams.get(id);
  if (!d) return undefined;
  return {
    id: d.id,
    name: d.name,
    description: d.description,
    diagramType: d.diagramType,
    folderId: d.folderId,
    version: d.version,
    generatedBy: d.generatedBy,
    objectOccurrences: state.objectOccurrences.find("byDiagram", id).sort(byZThenId).map(strip),
    relationshipOccurrences: state.relationshipOccurrences.find("byDiagram", id).sort(byZThenId).map(strip),
    annotations: state.annotations.find("byDiagram", id).sort(byZThenId).map(strip),
  };
}
