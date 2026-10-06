// Committing changes: the change and change_log rows, the touched rows and the repository sequence,
// in one transaction (architecture.md §6 step 3). Writes serialise per repository, never globally.
import type { Actor, Change, ChangeSource, CommittedChange, LogEntry } from "@connectome/model";
import type { TouchedRow } from "@connectome/engine";
import type { Tx } from "./client";
import { writeTouchedRows } from "./model-state";

/** Locks the repository row for this transaction and returns its last sequence number. */
export async function lockRepository(tx: Tx, repositoryId: string): Promise<number> {
  const row = await tx
    .selectFrom("repository")
    .select("seq")
    .where("id", "=", repositoryId)
    .forUpdate()
    .executeTakeFirst();
  if (!row) throw new Error(`Unknown repository ${repositoryId}`);
  return row.seq;
}

export interface CommitInput {
  workspaceId: string;
  repositoryId: string;
  change: Change;
  actor: Actor;
  source: ChangeSource;
  log: LogEntry[];
  touched: TouchedRow[];
  versions: Record<string, number>;
  undoesChangeId?: string;
}

/**
 * Writes a change the engine accepted. Call lockRepository first in the same transaction, apply the
 * change to state that is current at that sequence, then commit.
 */
export async function commitChange(tx: Tx, input: CommitInput): Promise<CommittedChange> {
  const { workspaceId, repositoryId, change } = input;
  const seq = (await lockRepository(tx, repositoryId)) + 1;
  const inserted = await tx
    .insertInto("change")
    .values({
      id: change.id,
      workspace_id: workspaceId,
      repository_id: repositoryId,
      seq,
      scenario_id: change.scenarioId,
      actor_id: input.actor.id,
      source: input.source,
      label: change.label,
      change_request_id: change.changeRequestId ?? null,
      undoes_change_id: input.undoesChangeId ?? null,
    })
    .returning("committed_at")
    .executeTakeFirstOrThrow();
  // Bounded by the 10,000-edit limit; insert in slices to stay under the parameter limit.
  for (let i = 0; i < input.log.length; i += 1000) {
    await tx
      .insertInto("change_log")
      .values(
        input.log.slice(i, i + 1000).map((entry) => ({
          workspace_id: workspaceId,
          repository_id: repositoryId,
          seq,
          edit_index: entry.editIndex,
          change_id: change.id,
          scenario_id: change.scenarioId,
          item_id: entry.itemId,
          edit: JSON.stringify(entry.edit),
          inverse: JSON.stringify(entry.inverse),
        })),
      )
      .execute();
  }
  await writeTouchedRows(tx, input.touched, { workspaceId, repositoryId, scenarioId: change.scenarioId });
  await tx.updateTable("repository").set({ seq }).where("id", "=", repositoryId).execute();
  return {
    ...change,
    seq,
    actor: input.actor,
    source: input.source,
    committedAt: inserted.committed_at.toISOString(),
    versions: input.versions,
  };
}

/** A change already committed under this id (resending a change is safe: api.md §1). */
export async function findChange(tx: Tx, changeId: string) {
  return tx.selectFrom("change").selectAll().where("id", "=", changeId).executeTakeFirst();
}

/** The log of committed changes after a sequence number: catch-up after a reconnect, and history. */
export async function changeLogSince(tx: Tx, repositoryId: string, afterSeq: number) {
  return tx
    .selectFrom("change_log")
    .innerJoin("change", "change.id", "change_log.change_id")
    .select([
      "change_log.seq",
      "change_log.edit_index",
      "change_log.change_id",
      "change_log.scenario_id",
      "change_log.item_id",
      "change_log.edit",
      "change_log.inverse",
      "change.label",
      "change.actor_id",
      "change.source",
      "change.committed_at",
    ])
    .where("change_log.repository_id", "=", repositoryId)
    .where("change_log.seq", ">", afterSeq)
    .orderBy("change_log.seq")
    .orderBy("change_log.edit_index")
    .execute();
}
