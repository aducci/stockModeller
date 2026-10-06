// The engine's view of stored items: the model types plus the bookkeeping the change engine needs.
import type {
  Annotation,
  Diagram,
  Id,
  ModelObject,
  ObjectOccurrence,
  Relationship,
  RelationshipOccurrence,
} from "@connectome/model";

/** Which version of an item last changed a field, and who changed it. `"*"` covers every field (set on create). */
export interface FieldStamp {
  v: number;
  by: Id;
}

/**
 * Bookkeeping on every stored row.
 * - `deleted` rows are tombstones: kept so that versions keep increasing when an item is restored.
 * - `scenarioId` / `baseVersion` describe where a resolved row came from. The engine copies them
 *   through untouched; the storage layer uses them to write scenario overlay rows.
 */
export interface RowMeta {
  deleted: boolean;
  scenarioId?: Id;
  baseVersion?: number | null;
}

export interface Versioned extends RowMeta {
  version: number;
  fieldVersions: Record<string, FieldStamp>;
}

export type ObjectRow = Omit<ModelObject, "updatedAt" | "updatedBy"> &
  Versioned & { updatedAt: string | null; updatedBy: Id | null };
export type RelationshipRow = Omit<Relationship, "updatedAt" | "updatedBy"> &
  Versioned & { updatedAt: string | null; updatedBy: Id | null };
export type DiagramRow = Omit<Diagram, "objectOccurrences" | "relationshipOccurrences" | "annotations" | "version"> &
  Versioned;
export type FolderRow = { id: Id; parentId: Id | null; name: string } & RowMeta;
export type ObjectOccurrenceRow = ObjectOccurrence & { diagramId: Id } & RowMeta;
export type RelationshipOccurrenceRow = RelationshipOccurrence & { diagramId: Id } & RowMeta;
export type AnnotationRow = Annotation & { diagramId: Id } & RowMeta;

export interface Rows {
  objects: ObjectRow;
  relationships: RelationshipRow;
  folders: FolderRow;
  diagrams: DiagramRow;
  objectOccurrences: ObjectOccurrenceRow;
  relationshipOccurrences: RelationshipOccurrenceRow;
  annotations: AnnotationRow;
}

export type CollectionName = keyof Rows;
export const COLLECTIONS: readonly CollectionName[] = [
  "folders",
  "objects",
  "relationships",
  "diagrams",
  "objectOccurrences",
  "relationshipOccurrences",
  "annotations",
];

/** The collections whose rows carry a version (and take part in per-property conflict checks). */
export type VersionedCollection = "objects" | "relationships" | "diagrams";
