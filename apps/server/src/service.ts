// The model service: the write path (architecture.md §6) and scenario-aware reads, over the state cache.
import { applyChange, invertLog, type Metamodel, type ModelState } from "@connectome/engine";
import {
  changeLog,
  changeLogSince,
  commitChange,
  findChange,
  getRepository,
  listScenarios,
  loadMetamodel,
  loadState,
  lockRepository,
  markWritten,
  repositorySeq,
  withWorkspace,
  type Connection,
  type RepositorySummary,
  type ScenarioSummary,
  type Tx,
} from "@connectome/db";
import { parseChange, ulid, type ChangeSource, type Edit, type RuleFinding } from "@connectome/model";
import { ZodError } from "zod";
import type { Principal } from "./auth";
import { StateCache, type RepositoryEntry, type ScenarioView } from "./cache";
import { ApiError, invalid, notFound, rejectionProblem } from "./problems";

export interface ChangeResult {
  seq: number | null;
  changeId: string;
  versions: Record<string, number>;
  findings: RuleFinding[];
  heldInChangeRequest: string | null;
  preview?: boolean;
}

export interface ReadView {
  repository: RepositorySummary;
  scenario: ScenarioSummary;
  state: ModelState;
  metamodel: Metamodel;
  seq: number;
}

export interface SubmitOptions {
  preview?: boolean;
  source?: ChangeSource;
  undoesChangeId?: string;
}

export class ModelService {
  readonly cache = new StateCache();

  constructor(private readonly conn: Connection) {}

  /** Runs `fn` against a scenario's current state (the baseline when no scenario is given). */
  async read<T>(
    principal: Principal,
    repositoryId: string,
    scenarioId: string | undefined,
    fn: (view: ReadView, tx: Tx) => T | Promise<T>,
  ): Promise<T> {
    const entry = this.cache.entry(repositoryId);
    return entry.mutex.run(() =>
      withWorkspace(
        this.conn,
        principal.workspaceId,
        async (tx) => {
          const { repository, scenario } = await this.resolve(tx, repositoryId, scenarioId);
          const seq = (await repositorySeq(tx, repositoryId))!;
          const view = await this.current(tx, entry, repositoryId, scenario.id, seq);
          return fn({ repository, scenario, state: view.state, metamodel: entry.metamodel!, seq: view.seq }, tx);
        },
        { isolation: "repeatable read" },
      ),
    );
  }

  /** Validates, applies and commits a change. Throws ApiError when it is malformed or rejected. */
  async submit(
    principal: Principal,
    repositoryId: string,
    scenarioId: string | undefined,
    body: unknown,
    options: SubmitOptions = {},
  ): Promise<{ status: 200 | 201; result: ChangeResult }> {
    const entry = this.cache.entry(repositoryId);
    let mutated: ScenarioView | undefined;
    let committedSeq = 0;
    try {
      const outcome = await entry.mutex.run(() =>
        withWorkspace(this.conn, principal.workspaceId, async (tx) => {
          const { scenario } = await this.resolve(tx, repositoryId, scenarioId);
          const change = parseBody(body, scenario.id);

          // Lock first: a resent change waits for its original to commit, then finds it below.
          const seq = await lockRepository(tx, repositoryId);
          const existing = await findChange(tx, change.id);
          if (existing) {
            if (existing.repository_id !== repositoryId || existing.scenario_id !== scenario.id) {
              throw invalid(`Change id ${change.id} is already used by another change`);
            }
            const stored = existing.outcome;
            return {
              status: 201 as const,
              result: {
                seq: existing.seq,
                changeId: existing.id,
                versions: stored.versions ?? {},
                findings: stored.findings ?? [],
                heldInChangeRequest: null,
              },
            };
          }

          const view = await this.current(tx, entry, repositoryId, scenario.id, seq);
          const state = options.preview ? view.state.clone() : view.state;
          const actor = { kind: "user" as const, id: principal.userId };
          // One timestamp for the rows and the change, so a browser replaying the change gets identical rows.
          const now = new Date().toISOString();
          const result = applyChange(state, change, {
            metamodel: entry.metamodel!,
            actor,
            now,
            scenario: { id: scenario.id, isBaseline: scenario.parentId === null },
          });
          if (!result.ok) throw rejectionProblem(result.reasons);
          if (options.preview) {
            const { versions, findings } = result;
            return {
              status: 200 as const,
              result: { seq: null, changeId: change.id, versions, findings, heldInChangeRequest: null, preview: true },
            };
          }

          mutated = view;
          const committed = await commitChange(tx, {
            workspaceId: principal.workspaceId,
            repositoryId,
            change,
            actor,
            source: options.source ?? "api",
            log: result.log,
            touched: result.touched,
            versions: result.versions,
            findings: result.findings,
            committedAt: now,
            ...(options.undoesChangeId ? { undoesChangeId: options.undoesChangeId } : {}),
          });
          markWritten(state, result.touched, scenario.id);
          committedSeq = committed.seq;
          return {
            status: 201 as const,
            result: {
              seq: committed.seq,
              changeId: change.id,
              versions: result.versions,
              findings: result.findings,
              heldInChangeRequest: null,
            },
          };
        }),
      );
      // The transaction committed: the cached state now matches the database at the new sequence.
      if (mutated) mutated.seq = committedSeq;
      return outcome;
    } catch (error) {
      // The engine changed the cached state but the database did not commit: forget the state.
      if (mutated) entry.views.clear();
      throw error;
    }
  }

  /** Undoes one of the caller's own changes with a new change built from its stored inverses. */
  async undo(principal: Principal, repositoryId: string, changeId: string, newChangeId?: string) {
    const { change, edits } = await withWorkspace(this.conn, principal.workspaceId, async (tx) => {
      const change = await findChange(tx, changeId);
      if (!change || change.repository_id !== repositoryId) throw notFound(`Change ${changeId}`);
      if (change.actor_id !== principal.userId) {
        throw new ApiError(403, "forbidden", "You can undo only your own changes");
      }
      const undone = await tx
        .selectFrom("change")
        .select("id")
        .where("repository_id", "=", repositoryId)
        .where("undoes_change_id", "=", changeId)
        .executeTakeFirst();
      if (undone && undone.id !== newChangeId) throw invalid(`Change ${changeId} was already undone by ${undone.id}`);
      const log = await changeLog(tx, repositoryId, changeId);
      const entries = log.map((r) => ({
        editIndex: r.edit_index,
        itemId: r.item_id,
        edit: r.edit as Edit,
        inverse: r.inverse as Edit[],
      }));
      return { change, edits: invertLog(entries) };
    });
    return this.submit(
      principal,
      repositoryId,
      change.scenario_id,
      { id: newChangeId ?? ulid(), label: `Undo: ${change.label}`, edits },
      { source: "undo", undoesChangeId: changeId },
    );
  }

  /** Committed changes after a sequence number, grouped per change, oldest first. */
  async changesSince(principal: Principal, repositoryId: string, since: number, limit: number) {
    return withWorkspace(this.conn, principal.workspaceId, async (tx) => {
      if (!(await getRepository(tx, repositoryId))) throw notFound(`Repository ${repositoryId}`);
      const rows = await changeLogSince(tx, repositoryId, since);
      const changes: {
        seq: number;
        changeId: string;
        scenarioId: string;
        label: string;
        actor: string | null;
        source: string;
        committedAt: string;
        edits: Edit[];
      }[] = [];
      for (const r of rows) {
        let last = changes.at(-1);
        if (!last || last.seq !== r.seq) {
          if (changes.length === limit) break;
          last = {
            seq: r.seq,
            changeId: r.change_id,
            scenarioId: r.scenario_id,
            label: r.label,
            actor: r.actor_id,
            source: r.source,
            committedAt: r.committed_at.toISOString(),
            edits: [],
          };
          changes.push(last);
        }
        last.edits.push(r.edit as Edit);
      }
      return changes;
    });
  }

  private async resolve(tx: Tx, repositoryId: string, scenarioId: string | undefined) {
    const repository = await getRepository(tx, repositoryId);
    if (!repository) throw notFound(`Repository ${repositoryId}`);
    const scenarios = await listScenarios(tx, repositoryId);
    const scenario = scenarios.find((s) => s.id === (scenarioId ?? repository.baselineScenarioId));
    if (!scenario) throw notFound(`Scenario ${scenarioId}`);
    return { repository, scenario };
  }

  /** The cached state of a scenario, reloaded if the repository moved on since it was cached. */
  private async current(tx: Tx, entry: RepositoryEntry, repositoryId: string, scenarioId: string, seq: number) {
    entry.metamodel ??= await loadMetamodel(tx, repositoryId);
    let view = entry.views.get(scenarioId);
    if (!view || view.seq !== seq) {
      view = await loadState(tx, repositoryId, scenarioId);
      entry.views.set(scenarioId, view);
    }
    return view;
  }
}

function parseBody(body: unknown, scenarioId: string) {
  if (typeof body !== "object" || body === null || Array.isArray(body))
    throw invalid("The body must be a change object");
  if ("scenarioId" in body && body.scenarioId !== scenarioId) {
    throw invalid("The change names a different scenario than ?scenario=");
  }
  try {
    return parseChange({ ...body, scenarioId });
  } catch (error) {
    if (error instanceof ZodError) {
      throw invalid(
        "The change is malformed",
        error.issues.slice(0, 20).map((i) => ({
          ...(i.path[0] === "edits" && typeof i.path[1] === "number" ? { editIndex: i.path[1] } : {}),
          property: i.path.join("."),
          message: i.message,
        })),
      );
    }
    throw error;
  }
}
