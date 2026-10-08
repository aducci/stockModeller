// Workspaces, repositories, scenarios and the metamodel tables.
import type { DiagramType, MetamodelPackage, PropertyType, ObjectType, RelationshipType } from "@connectome/model";
import { Metamodel } from "@connectome/engine";
import { sql } from "kysely";
import type { Tx } from "./client";

const json = (value: unknown) => JSON.stringify(value);

/** Fields of a definition other than the ones stored in their own columns. */
function rest<T extends object, K extends keyof T>(value: T, keys: K[]): Omit<T, K> {
  const copy = { ...value };
  for (const k of keys) delete copy[k];
  return copy;
}

export async function createWorkspace(tx: Tx, workspace: { id: string; name: string }): Promise<void> {
  await tx
    .insertInto("workspace")
    .values({ id: workspace.id, name: workspace.name, settings: json({}) })
    .execute();
}

export interface NewRepository {
  id: string;
  workspaceId: string;
  name: string;
  baselineScenarioId: string;
  metamodel: MetamodelPackage;
  diagramTypes: DiagramType[];
  settings?: { currency: string };
}

/**
 * Deletes a repository and everything in it: its metamodel, scenarios, model, diagrams and change log (storage §7,
 * "Starting over"). Tables without a foreign key to the repository (the change log, occurrences, annotations) are
 * cleared first; the rest go with the repository row. Returns false when there was no such repository.
 */
export async function deleteRepository(tx: Tx, repositoryId: string): Promise<boolean> {
  const tables = ["change_log", "object_occurrence", "relationship_occurrence", "annotation"] as const;
  for (const table of tables) await tx.deleteFrom(table).where("repository_id", "=", repositoryId).execute();
  const deleted = await tx.deleteFrom("repository").where("id", "=", repositoryId).executeTakeFirst();
  return deleted.numDeletedRows > 0n;
}

/** Creates a repository with its baseline scenario and installs its metamodel. */
export async function createRepository(tx: Tx, repo: NewRepository): Promise<void> {
  Metamodel.compile(repo.metamodel, repo.diagramTypes); // refuse a broken metamodel before writing anything
  const { name, version, layers, exchangeMappings, documentPatterns } = repo.metamodel;
  await tx
    .insertInto("repository")
    .values({
      id: repo.id,
      workspace_id: repo.workspaceId,
      name: repo.name,
      metamodel_version: version,
      // Package-level parts with no table of their own (yet).
      settings: json({
        ...(repo.settings ?? { currency: "EUR" }),
        metamodel: { name, layers, exchangeMappings, documentPatterns },
      }),
    })
    .execute();
  await tx
    .insertInto("scenario")
    .values({
      id: repo.baselineScenarioId,
      workspace_id: repo.workspaceId,
      repository_id: repo.id,
      parent_id: null,
      name: "Baseline",
      state: "baseline",
      branched_at_seq: null,
    })
    .execute();
  await installMetamodel(tx, repo.workspaceId, repo.id, repo.metamodel, repo.diagramTypes);
}

export async function createScenario(
  tx: Tx,
  scenario: { id: string; workspaceId: string; repositoryId: string; parentId: string; name: string },
): Promise<void> {
  const ancestry = await scenarioAncestry(tx, scenario.parentId);
  if (ancestry.length >= 3) throw new Error("Scenarios nest at most 3 levels deep (ADR-004)");
  const { seq } = await tx
    .selectFrom("repository")
    .select("seq")
    .where("id", "=", scenario.repositoryId)
    .executeTakeFirstOrThrow();
  await tx
    .insertInto("scenario")
    .values({
      id: scenario.id,
      workspace_id: scenario.workspaceId,
      repository_id: scenario.repositoryId,
      parent_id: scenario.parentId,
      name: scenario.name,
      branched_at_seq: seq,
    })
    .execute();
}

/** A scenario and its ancestors, nearest first, ending with the baseline (storage.md §3). */
export async function scenarioAncestry(tx: Tx, scenarioId: string): Promise<string[]> {
  const ancestry: string[] = [];
  for (let id: string | null = scenarioId; id;) {
    if (ancestry.includes(id)) throw new Error(`Scenario ${scenarioId} has a cycle in its ancestry`);
    const row: { parent_id: string | null } | undefined = await tx
      .selectFrom("scenario")
      .select("parent_id")
      .where("id", "=", id)
      .executeTakeFirst();
    if (!row) throw new Error(`Unknown scenario ${id}`);
    ancestry.push(id);
    id = row.parent_id;
  }
  return ancestry;
}

async function installMetamodel(
  tx: Tx,
  workspaceId: string,
  repositoryId: string,
  pkg: MetamodelPackage,
  diagramTypes: DiagramType[],
): Promise<void> {
  const base = { workspace_id: workspaceId, repository_id: repositoryId };
  const insert = async <T extends object>(table: Parameters<Tx["insertInto"]>[0], rows: T[]) => {
    if (rows.length > 0)
      await tx
        .insertInto(table)
        .values(rows as never)
        .execute();
  };

  await insert(
    "value_list",
    (pkg.valueLists ?? []).map((v) => ({ ...base, key: v.key, values: json(v.values) })),
  );
  await insert(
    "property_type",
    (pkg.propertyTypes ?? []).map((p) => ({
      ...base,
      key: p.key,
      name: p.name,
      group_key: p.group,
      data_type: p.dataType,
      definition: json(rest(p, ["key", "name", "group", "dataType"])),
      package: pkg.name,
    })),
  );
  await insert(
    "object_type",
    pkg.objectTypes.map((t) => ({
      ...base,
      key: t.key,
      name: t.name,
      extends: t.extends ?? null,
      abstract: t.abstract ?? false,
      definition: json(rest(t, ["key", "name", "extends", "abstract"])),
      package: pkg.name,
    })),
  );
  await insert(
    "relationship_type",
    pkg.relationshipTypes.map((t) => ({
      ...base,
      key: t.key,
      name: t.name,
      nesting: t.nesting ?? false,
      single_parent: t.singleParent ?? false,
      definition: json(rest(t, ["key", "name", "nesting", "singleParent"])),
      package: pkg.name,
    })),
  );
  await insert("rule", [
    ...(pkg.relationshipRules ?? []).map((r) => ({
      ...base,
      key: `${r.relationshipType}:${r.sourceType}->${r.targetType}`,
      kind: "relationship",
      definition: json(r),
    })),
    ...(pkg.validationRules ?? []).map((r) => ({ ...base, key: r.key, kind: "validation", definition: json(r) })),
    ...(pkg.derivationRules ?? []).map((r) => ({ ...base, key: r.key, kind: "derivation", definition: json(r) })),
  ]);
  await insert(
    "diagram_type",
    diagramTypes.map((d) => ({ ...base, key: d.key, name: d.name, definition: json(d), package: pkg.name })),
  );
}

/** Reads a repository's metamodel back as a package plus diagram types. */
export async function loadMetamodelPackage(
  tx: Tx,
  repositoryId: string,
): Promise<{ metamodel: MetamodelPackage; diagramTypes: DiagramType[] }> {
  const repo = await tx
    .selectFrom("repository")
    .select(["metamodel_version", "settings"])
    .where("id", "=", repositoryId)
    .executeTakeFirstOrThrow();
  const where = <
    T extends "value_list" | "property_type" | "object_type" | "relationship_type" | "rule" | "diagram_type",
  >(
    table: T,
  ) =>
    tx
      .selectFrom(table as "rule")
      .selectAll()
      .where("repository_id", "=", repositoryId)
      .orderBy("key");

  const [valueLists, propertyTypes, objectTypes, relationshipTypes, rules, diagramTypes] = await Promise.all([
    where("value_list").execute() as unknown as Promise<{ key: string; values: unknown }[]>,
    where("property_type").execute() as unknown as Promise<
      { key: string; name: string; group_key: string; data_type: string; definition: object }[]
    >,
    where("object_type").execute() as unknown as Promise<
      { key: string; name: string; extends: string | null; abstract: boolean; definition: object }[]
    >,
    where("relationship_type").execute() as unknown as Promise<
      { key: string; name: string; nesting: boolean; single_parent: boolean; definition: object }[]
    >,
    where("rule").execute(),
    where("diagram_type").execute() as unknown as Promise<{ definition: DiagramType }[]>,
  ]);
  const meta = (repo.settings as { metamodel?: Partial<MetamodelPackage> }).metamodel ?? {};
  const ofKind = <T>(kind: string) => rules.filter((r) => r.kind === kind).map((r) => r.definition as T);

  const metamodel: MetamodelPackage = {
    name: meta.name ?? "Metamodel",
    version: repo.metamodel_version,
    ...(meta.layers ? { layers: meta.layers } : {}),
    valueLists: valueLists.map((v) => ({ key: v.key, values: v.values as never })),
    propertyTypes: propertyTypes.map(
      (p) => ({ key: p.key, name: p.name, group: p.group_key, dataType: p.data_type, ...p.definition }) as PropertyType,
    ),
    objectTypes: objectTypes.map(
      (t) =>
        ({
          key: t.key,
          name: t.name,
          ...(t.extends ? { extends: t.extends } : {}),
          ...(t.abstract ? { abstract: true } : {}),
          ...t.definition,
        }) as ObjectType,
    ),
    relationshipTypes: relationshipTypes.map(
      (t) =>
        ({
          key: t.key,
          name: t.name,
          ...(t.nesting ? { nesting: true } : {}),
          ...(t.single_parent ? { singleParent: true } : {}),
          ...t.definition,
        }) as RelationshipType,
    ),
    relationshipRules: ofKind("relationship"),
    validationRules: ofKind("validation"),
    derivationRules: ofKind("derivation"),
    ...(meta.exchangeMappings ? { exchangeMappings: meta.exchangeMappings } : {}),
    ...(meta.documentPatterns ? { documentPatterns: meta.documentPatterns } : {}),
  };
  return { metamodel, diagramTypes: diagramTypes.map((d) => d.definition) };
}

export async function loadMetamodel(tx: Tx, repositoryId: string): Promise<Metamodel> {
  const { metamodel, diagramTypes } = await loadMetamodelPackage(tx, repositoryId);
  return Metamodel.compile(metamodel, diagramTypes);
}

/**
 * Replaces a repository's whole metamodel (types, property types, value lists, rules and diagram types) and sets its
 * version (slice A-1b). The caller has compiled the new metamodel, checked its impact and locked the repository.
 */
export async function saveMetamodel(
  tx: Tx,
  workspaceId: string,
  repositoryId: string,
  pkg: MetamodelPackage,
  diagramTypes: DiagramType[],
): Promise<void> {
  for (const table of [
    "value_list",
    "property_type",
    "object_type",
    "relationship_type",
    "rule",
    "diagram_type",
  ] as const)
    await tx.deleteFrom(table).where("repository_id", "=", repositoryId).execute();
  await installMetamodel(tx, workspaceId, repositoryId, pkg, diagramTypes);
  const repo = await tx
    .selectFrom("repository")
    .select("settings")
    .where("id", "=", repositoryId)
    .executeTakeFirstOrThrow();
  const { name, layers, exchangeMappings, documentPatterns } = pkg;
  await tx
    .updateTable("repository")
    .set({
      metamodel_version: pkg.version,
      settings: json({ ...(repo.settings as object), metamodel: { name, layers, exchangeMappings, documentPatterns } }),
    })
    .where("id", "=", repositoryId)
    .execute();
  await notifyMetamodel(tx, workspaceId, repositoryId, pkg.version);
}

async function notifyMetamodel(tx: Tx, workspaceId: string, repositoryId: string, version: string) {
  await sql`select pg_notify(${METAMODEL_CHANNEL}, ${JSON.stringify({ workspaceId, repositoryId, version } satisfies MetamodelNotice)})`.execute(
    tx,
  );
}

/** Notified (on commit) when a repository's metamodel is published, so every instance reloads it. */
export const METAMODEL_CHANNEL = "connectome_metamodel";

export interface MetamodelNotice {
  workspaceId: string;
  repositoryId: string;
  version: string;
}

/**
 * Replaces a repository's relationship rules and sets its metamodel version (design/02-model/
 * notation-and-metamodel-admin.md §10). The caller has compiled the new metamodel and locked the repository.
 */
export async function saveRelationshipRules(
  tx: Tx,
  workspaceId: string,
  repositoryId: string,
  rules: NonNullable<MetamodelPackage["relationshipRules"]>,
  version: string,
): Promise<void> {
  await tx.deleteFrom("rule").where("repository_id", "=", repositoryId).where("kind", "=", "relationship").execute();
  if (rules.length > 0)
    await tx
      .insertInto("rule")
      .values(
        rules.map((r) => ({
          workspace_id: workspaceId,
          repository_id: repositoryId,
          key: `${r.relationshipType}:${r.sourceType}->${r.targetType}`,
          kind: "relationship",
          definition: json(r),
        })) as never,
      )
      .execute();
  await tx.updateTable("repository").set({ metamodel_version: version }).where("id", "=", repositoryId).execute();
  await notifyMetamodel(tx, workspaceId, repositoryId, version);
}
