// Reads of repository-level records (not the model itself, which is read through loadState).
import type { Tx } from "./client";

export interface RepositorySummary {
  id: string;
  name: string;
  description: string;
  metamodelVersion: string;
  seq: number;
  baselineScenarioId: string;
}

export interface ScenarioSummary {
  id: string;
  parentId: string | null;
  name: string;
  state: string;
  branchedAtSeq: number | null;
}

export async function listRepositories(tx: Tx): Promise<RepositorySummary[]> {
  const rows = await tx
    .selectFrom("repository")
    .innerJoin("scenario", (j) =>
      j.onRef("scenario.repository_id", "=", "repository.id").on("scenario.parent_id", "is", null),
    )
    .select([
      "repository.id",
      "repository.name",
      "repository.description",
      "repository.metamodel_version",
      "repository.seq",
      "scenario.id as baseline",
    ])
    .orderBy("repository.name")
    .execute();
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    metamodelVersion: r.metamodel_version,
    seq: r.seq,
    baselineScenarioId: r.baseline,
  }));
}

export async function getRepository(tx: Tx, repositoryId: string): Promise<RepositorySummary | undefined> {
  return (await listRepositories(tx)).find((r) => r.id === repositoryId);
}

export async function listScenarios(tx: Tx, repositoryId: string): Promise<ScenarioSummary[]> {
  const rows = await tx
    .selectFrom("scenario")
    .selectAll()
    .where("repository_id", "=", repositoryId)
    .orderBy("branched_at_seq", (o) => o.nullsFirst())
    .orderBy("name")
    .execute();
  return rows.map((r) => ({
    id: r.id,
    parentId: r.parent_id,
    name: r.name,
    state: r.state,
    branchedAtSeq: r.branched_at_seq,
  }));
}

/** The repository's current sequence number, without locking. */
export async function repositorySeq(tx: Tx, repositoryId: string): Promise<number | undefined> {
  return (await tx.selectFrom("repository").select("seq").where("id", "=", repositoryId).executeTakeFirst())?.seq;
}

/** The change_log entries of one item, newest first (item history). */
export async function itemHistory(tx: Tx, repositoryId: string, itemId: string, limit = 100) {
  return tx
    .selectFrom("change_log")
    .innerJoin("change", "change.id", "change_log.change_id")
    .select([
      "change_log.seq",
      "change_log.edit_index",
      "change_log.edit",
      "change.id as change_id",
      "change.label",
      "change.actor_id",
      "change.source",
      "change.scenario_id",
      "change.committed_at",
    ])
    .where("change_log.repository_id", "=", repositoryId)
    .where("change_log.item_id", "=", itemId)
    .orderBy("change_log.seq", "desc")
    .orderBy("change_log.edit_index", "desc")
    .limit(limit)
    .execute();
}

/** The log entries of one change, in edit order. */
export async function changeLog(tx: Tx, repositoryId: string, changeId: string) {
  return tx
    .selectFrom("change_log")
    .select(["edit_index", "item_id", "edit", "inverse"])
    .where("repository_id", "=", repositoryId)
    .where("change_id", "=", changeId)
    .orderBy("edit_index")
    .execute();
}
