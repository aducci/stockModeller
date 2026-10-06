// Committing changes: the change and change_log rows, the touched rows and the repository sequence,
// in one transaction (architecture.md §6 step 3). Writes serialise per repository, never globally.
import type { Actor, Change, ChangeSource, CommittedChange, LogEntry, RuleFinding } from "@connectome/model";
import type { TouchedRow } from "@connectome/engine";
import { sql } from "kysely";
import type { Tx } from "./client";
import { writeTouchedRows } from "./model-state";

/** The NOTIFY channel announcing committed changes (architecture.md §6 step 4). */
export const CHANGES_CHANNEL = "connectome_changes";

/** The payload of a change notice: small (NOTIFY payloads are limited), listeners read the change itself. */
export interface ChangeNotice {
  workspaceId: string;
  repositoryId: string;
  seq: number;
}

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
  findings: RuleFinding[];
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
      outcome: JSON.stringify({ versions: input.versions, findings: input.findings }),
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
  // Delivered to every listening web instance when (and only if) the transaction commits.
  await sql`select pg_notify(${CHANGES_CHANNEL}, ${JSON.stringify({ workspaceId, repositoryId, seq } satisfies ChangeNotice)})`.execute(
    tx,
  );
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

const ACTOR_KIND: Record<string, CommittedChange["actor"]["kind"]> = { automation: "automation", system: "system" };

/** Committed changes with seq in (afterSeq, uptoSeq], oldest first, as sent over the live connection. */
export async function committedChanges(
  tx: Tx,
  repositoryId: string,
  afterSeq: number,
  uptoSeq: number = Number.MAX_SAFE_INTEGER,
  limit = 1000,
): Promise<CommittedChange[]> {
  const changes = await tx
    .selectFrom("change")
    .selectAll()
    .where("repository_id", "=", repositoryId)
    .where("seq", ">", afterSeq)
    .where("seq", "<=", uptoSeq)
    .orderBy("seq")
    .limit(limit)
    .execute();
  if (changes.length === 0) return [];
  const log = await tx
    .selectFrom("change_log")
    .select(["seq", "edit"])
    .where("repository_id", "=", repositoryId)
    .where("seq", ">", afterSeq)
    .where("seq", "<=", changes.at(-1)!.seq)
    .orderBy("seq")
    .orderBy("edit_index")
    .execute();
  const edits = new Map<number, unknown[]>();
  for (const row of log) {
    const list = edits.get(row.seq) ?? [];
    list.push(row.edit);
    edits.set(row.seq, list);
  }
  return changes.map((c) => ({
    id: c.id,
    scenarioId: c.scenario_id,
    label: c.label,
    ...(c.change_request_id ? { changeRequestId: c.change_request_id } : {}),
    edits: (edits.get(c.seq) ?? []) as CommittedChange["edits"],
    seq: c.seq,
    actor: { kind: ACTOR_KIND[c.source] ?? "user", id: c.actor_id ?? "system" },
    source: c.source as CommittedChange["source"],
    committedAt: c.committed_at.toISOString(),
    versions: c.outcome.versions ?? {},
  }));
}
