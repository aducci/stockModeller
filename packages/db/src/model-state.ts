// Reading a scenario into engine state, and writing the rows a change touched (storage.md §1, §3).
import { sql } from "kysely";
import type { PropertyValue } from "@connectome/model";
import {
  COLLECTIONS,
  ModelState,
  type AnnotationRow,
  type CollectionName,
  type DiagramRow,
  type FolderRow,
  type ObjectOccurrenceRow,
  type ObjectRow,
  type RelationshipOccurrenceRow,
  type RelationshipRow,
  type Rows,
  type TouchedRow,
} from "@connectome/engine";
import type { Tx } from "./client";
import type { Database } from "./schema";
import { scenarioAncestry } from "./repositories";

type ScenarioTable =
  "object" | "relationship" | "diagram" | "object_occurrence" | "relationship_occurrence" | "annotation";

const TABLES: Record<CollectionName, keyof Database> = {
  folders: "folder",
  objects: "object",
  relationships: "relationship",
  diagrams: "diagram",
  objectOccurrences: "object_occurrence",
  relationshipOccurrences: "relationship_occurrence",
  annotations: "annotation",
};

const json = (value: unknown) => JSON.stringify(value);
const iso = (d: Date | string | null) => (d === null ? null : d instanceof Date ? d.toISOString() : d);

/**
 * Reads one scenario-aware table as seen from a scenario: for each id, the row of the nearest scenario
 * in the ancestry wins. Tombstones are included (the engine needs their versions).
 */
async function resolve<T extends ScenarioTable>(tx: Tx, table: T, repositoryId: string, ancestry: string[]) {
  const result = await sql<Database[T] extends infer R ? { [K in keyof R]: unknown } : never>`
    select distinct on (t.id) t.*
    from ${sql.table(table)} t
    join unnest(${ancestry}::text[]) with ordinality a(scenario_id, depth) on t.scenario_id = a.scenario_id
    where t.repository_id = ${repositoryId}
    order by t.id, a.depth`.execute(tx);
  return result.rows as Record<string, unknown>[];
}

/** Loads a repository as seen from a scenario, plus the repository's sequence number at that moment. */
export async function loadState(
  tx: Tx,
  repositoryId: string,
  scenarioId: string,
): Promise<{ state: ModelState; seq: number }> {
  const ancestry = await scenarioAncestry(tx, scenarioId);
  const { seq } = await tx
    .selectFrom("repository")
    .select("seq")
    .where("id", "=", repositoryId)
    .executeTakeFirstOrThrow();
  const state = new ModelState();

  const folders = await tx.selectFrom("folder").selectAll().where("repository_id", "=", repositoryId).execute();
  state.load(
    "folders",
    folders.map((r): FolderRow => ({
      id: r.id,
      parentId: r.parent_id,
      name: r.name,
      ...rank(r.rank),
      deleted: r.deleted,
    })),
  );

  const [objects, relationships, diagrams, occurrences, lines, annotations] = await Promise.all([
    resolve(tx, "object", repositoryId, ancestry),
    resolve(tx, "relationship", repositoryId, ancestry),
    resolve(tx, "diagram", repositoryId, ancestry),
    resolve(tx, "object_occurrence", repositoryId, ancestry),
    resolve(tx, "relationship_occurrence", repositoryId, ancestry),
    resolve(tx, "annotation", repositoryId, ancestry),
  ]);

  state.load("objects", objects.map(fromObject));
  state.load("relationships", relationships.map(fromRelationship));
  state.load("diagrams", diagrams.map(fromDiagram));
  state.load("objectOccurrences", occurrences.map(fromObjectOccurrence));
  state.load("relationshipOccurrences", lines.map(fromRelationshipOccurrence));
  state.load("annotations", annotations.map(fromAnnotation));
  return { state, seq };
}

// ------------------------------------------------------------------ database row → engine row

/** An unranked row has no `rank` at all, exactly as the engine leaves it. */
function rank(value: string | null): { rank?: string } {
  return value === null ? {} : { rank: value };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function fromObject(r: any): ObjectRow {
  return {
    id: r.id,
    type: r.type_key,
    name: r.name,
    key: r.key,
    folderId: r.folder_id,
    description: r.description,
    ...rank(r.rank),
    properties: r.properties as Record<string, PropertyValue>,
    tags: r.tags,
    externalIds: r.external_ids,
    ...(r.confirmations ? { confirmations: r.confirmations } : {}),
    ...(r.aliases ? { aliases: r.aliases } : {}),
    ...(r.not_duplicates ? { notDuplicates: r.not_duplicates } : {}),
    version: r.version,
    fieldVersions: r.field_versions,
    deleted: r.deleted,
    updatedAt: iso(r.updated_at),
    updatedBy: r.updated_by,
    scenarioId: r.scenario_id,
    baseVersion: r.base_version,
  };
}

function fromRelationship(r: any): RelationshipRow {
  return {
    id: r.id,
    type: r.type_key,
    sourceId: r.source_id,
    targetId: r.target_id,
    name: r.name,
    properties: r.properties,
    tags: r.tags,
    externalIds: r.external_ids,
    derivedBy: r.derived_by,
    payload: r.payload,
    parentId: r.parent_id,
    rank: r.rank,
    version: r.version,
    fieldVersions: r.field_versions,
    deleted: r.deleted,
    updatedAt: iso(r.updated_at),
    updatedBy: r.updated_by,
    scenarioId: r.scenario_id,
    baseVersion: r.base_version,
  };
}

function fromDiagram(r: any): DiagramRow {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    diagramType: r.diagram_type_key,
    folderId: r.folder_id,
    ...rank(r.rank),
    generatedBy: r.generated_by,
    ...(r.definition && Object.keys(r.definition).length > 0 ? { definition: r.definition } : {}),
    ...(r.properties && Object.keys(r.properties).length > 0 ? { properties: r.properties } : {}),
    version: r.version,
    fieldVersions: r.field_versions,
    deleted: r.deleted,
    scenarioId: r.scenario_id,
  };
}

function fromObjectOccurrence(r: any): ObjectOccurrenceRow {
  return {
    id: r.id,
    diagramId: r.diagram_id,
    objectId: r.object_id,
    parentOccurrenceId: r.parent_occurrence_id,
    x: r.x,
    y: r.y,
    w: r.w,
    h: r.h,
    z: r.z,
    style: r.style,
    drillDownDiagramId: r.drill_down_diagram_id,
    pinned: r.pinned,
    deleted: r.deleted,
    scenarioId: r.scenario_id,
  };
}

function fromRelationshipOccurrence(r: any): RelationshipOccurrenceRow {
  return {
    id: r.id,
    diagramId: r.diagram_id,
    relationshipId: r.relationship_id,
    sourceOccurrenceId: r.source_occurrence_id,
    targetOccurrenceId: r.target_occurrence_id,
    shownAs: r.shown_as,
    route: r.route,
    labelPosition: r.label_position,
    style: r.style,
    ...(r.step !== null && r.step !== undefined ? { step: r.step } : {}),
    deleted: r.deleted,
    scenarioId: r.scenario_id,
  };
}

function fromAnnotation(r: any): AnnotationRow {
  return {
    id: r.id,
    diagramId: r.diagram_id,
    parentOccurrenceId: r.parent_occurrence_id,
    x: r.x,
    y: r.y,
    w: r.w,
    h: r.h,
    z: r.z,
    content: r.content,
    style: r.style,
    deleted: r.deleted,
    scenarioId: r.scenario_id,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ------------------------------------------------------------------ engine row → database row

interface WriteContext {
  workspaceId: string;
  repositoryId: string;
  scenarioId: string;
}

/**
 * The base version recorded on a scenario's copy of a row: when the scenario first changes an item,
 * its copy remembers the version it started from (merge uses it to detect conflicts).
 */
function baseVersionOf(touched: TouchedRow<"objects" | "relationships">, scenarioId: string): number | null {
  const before = touched.before;
  if (!before) return null;
  if (before.scenarioId === scenarioId) return before.baseVersion ?? null;
  return before.version;
}

function toDatabase(touched: TouchedRow, ctx: WriteContext): Record<string, unknown> {
  const scoped = { workspace_id: ctx.workspaceId, repository_id: ctx.repositoryId, scenario_id: ctx.scenarioId };
  switch (touched.collection) {
    case "folders": {
      const r = touched.after as FolderRow;
      return {
        workspace_id: ctx.workspaceId,
        repository_id: ctx.repositoryId,
        id: r.id,
        parent_id: r.parentId,
        name: r.name,
        rank: r.rank ?? null,
        deleted: r.deleted,
      };
    }
    case "objects": {
      const r = touched.after as ObjectRow;
      return {
        ...scoped,
        id: r.id,
        type_key: r.type,
        folder_id: r.folderId,
        name: r.name,
        rank: r.rank ?? null,
        key: r.key,
        description: r.description,
        properties: json(r.properties),
        tags: r.tags,
        external_ids: json(r.externalIds),
        confirmations: r.confirmations ? json(r.confirmations) : null,
        aliases: r.aliases ? json(r.aliases) : null,
        not_duplicates: r.notDuplicates ? json(r.notDuplicates) : null,
        version: r.version,
        field_versions: json(r.fieldVersions),
        base_version: baseVersionOf(touched as TouchedRow<"objects">, ctx.scenarioId),
        deleted: r.deleted,
        updated_at: r.updatedAt ?? new Date().toISOString(),
        updated_by: r.updatedBy,
      };
    }
    case "relationships": {
      const r = touched.after as RelationshipRow;
      return {
        ...scoped,
        id: r.id,
        type_key: r.type,
        source_id: r.sourceId,
        target_id: r.targetId,
        name: r.name,
        properties: json(r.properties),
        tags: r.tags,
        external_ids: json(r.externalIds),
        derived_by: r.derivedBy,
        payload: r.payload,
        parent_id: r.parentId,
        rank: r.rank,
        version: r.version,
        field_versions: json(r.fieldVersions),
        base_version: baseVersionOf(touched as TouchedRow<"relationships">, ctx.scenarioId),
        deleted: r.deleted,
        updated_at: r.updatedAt ?? new Date().toISOString(),
        updated_by: r.updatedBy,
      };
    }
    case "diagrams": {
      const r = touched.after as DiagramRow;
      return {
        ...scoped,
        id: r.id,
        diagram_type_key: r.diagramType,
        folder_id: r.folderId,
        name: r.name,
        rank: r.rank ?? null,
        description: r.description,
        generated_by: r.generatedBy === null ? null : json(r.generatedBy),
        definition: json(r.definition ?? {}),
        properties: json(r.properties ?? {}),
        version: r.version,
        field_versions: json(r.fieldVersions),
        deleted: r.deleted,
      };
    }
    case "objectOccurrences": {
      const r = touched.after as ObjectOccurrenceRow;
      return {
        ...scoped,
        id: r.id,
        diagram_id: r.diagramId,
        object_id: r.objectId,
        parent_occurrence_id: r.parentOccurrenceId,
        x: r.x,
        y: r.y,
        w: r.w,
        h: r.h,
        z: r.z,
        style: json(r.style),
        drill_down_diagram_id: r.drillDownDiagramId,
        pinned: r.pinned,
        deleted: r.deleted,
      };
    }
    case "relationshipOccurrences": {
      const r = touched.after as RelationshipOccurrenceRow;
      return {
        ...scoped,
        id: r.id,
        diagram_id: r.diagramId,
        relationship_id: r.relationshipId,
        source_occurrence_id: r.sourceOccurrenceId,
        target_occurrence_id: r.targetOccurrenceId,
        shown_as: r.shownAs,
        route: json(r.route),
        label_position: r.labelPosition,
        style: json(r.style),
        step: r.step ?? null,
        deleted: r.deleted,
      };
    }
    case "annotations": {
      const r = touched.after as AnnotationRow;
      return {
        ...scoped,
        id: r.id,
        diagram_id: r.diagramId,
        parent_occurrence_id: r.parentOccurrenceId,
        x: r.x,
        y: r.y,
        w: r.w,
        h: r.h,
        z: r.z,
        content: json(r.content),
        style: json(r.style),
        deleted: r.deleted,
      };
    }
  }
}

/** Upserts the rows a change touched into the scenario (overlay rows outside the baseline). */
export async function writeTouchedRows(tx: Tx, touched: TouchedRow[], ctx: WriteContext): Promise<void> {
  // Parents before children: folders, then objects, … (foreign keys), keeping first-touch order within each.
  const ordered = [...touched].sort((a, b) => COLLECTIONS.indexOf(a.collection) - COLLECTIONS.indexOf(b.collection));
  for (const t of ordered) {
    const row = toDatabase(t, ctx);
    const table = TABLES[t.collection];
    const key = t.collection === "folders" ? ["id"] : ["repository_id", "scenario_id", "id"];
    const updates = Object.keys(row).filter((c) => !key.includes(c) && c !== "workspace_id");
    await tx
      .insertInto(table)
      .values(row as never)
      .onConflict((oc) =>
        oc
          .columns(key as never)
          .doUpdateSet((eb) => Object.fromEntries(updates.map((c) => [c, eb.ref(`excluded.${c}` as never)])) as never),
      )
      .execute();
  }
}

/** After a commit, records in the state where its rows now live (so the next write computes base versions right). */
export function markWritten(state: ModelState, touched: TouchedRow[], scenarioId: string): void {
  for (const t of touched) {
    if (t.collection === "folders") continue;
    const current = state.collection(t.collection).getAny(t.id) as Rows[CollectionName];
    const extra =
      t.collection === "objects" || t.collection === "relationships"
        ? { baseVersion: baseVersionOf(t as TouchedRow<"objects">, scenarioId) }
        : {};
    state.load(t.collection, [{ ...current, ...extra, scenarioId } as never]);
  }
}
