// The model service: the write path (architecture.md §6) and scenario-aware reads, over the state cache.
import {
  Metamodel,
  MetamodelError,
  applyChange,
  invertLog,
  metamodelImpact,
  newlyRefused,
  type Combination,
  type ModelState,
} from "@connectome/engine";
import {
  changeLog,
  changeLogSince,
  commitChange,
  deleteRepository,
  findChange,
  getRepository,
  listScenarios,
  loadMetamodel,
  loadMetamodelPackage,
  loadState,
  lockRepository,
  markWritten,
  repositorySeq,
  saveMetamodel,
  saveRelationshipRules,
  withWorkspace,
  type Connection,
  type RepositorySummary,
  type ScenarioSummary,
  type Tx,
} from "@connectome/db";
import {
  parseChange,
  ulid,
  validateDiagramType,
  validatePackage,
  type ChangeSource,
  type DiagramType,
  type Edit,
  type MetamodelPackage,
  type RuleFinding,
} from "@connectome/model";
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

export interface RulesResult {
  /** The version published, or the one a publish would create (preview). */
  version: string;
  preview: boolean;
  /** Combinations the baseline uses that the old rules allow and the new ones refuse; they stay, flagged. */
  newlyRefused: Combination[];
}

export interface MetamodelResult extends RulesResult {
  /** Values the new types stop carrying, per property; they stay stored and the panel lists them. */
  stranded: { propertyType: string; count: number }[];
}

const draftInvalid = (problems: string[]) =>
  invalid(
    "The metamodel cannot be published",
    problems.slice(0, 20).map((message) => ({ property: "metamodel", message })),
  );

/** The next patch version: 1.4.0 → 1.4.1. */
export function nextVersion(version: string): string {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  return m ? `${m[1]}.${m[2]}.${Number(m[3]) + 1}` : `${version}.1`;
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

  /**
   * Replaces the repository's relationship rules (design/02-model/notation-and-metamodel-admin.md §10) and
   * publishes them as a new metamodel version. Existing relationships are kept; those the new rules refuse are
   * reported. `baseVersion` must be the version the caller edited, so two admins cannot overwrite each other.
   */
  async publishRelationshipRules(
    principal: Principal,
    repositoryId: string,
    body: { baseVersion: string; relationshipRules: NonNullable<MetamodelPackage["relationshipRules"]> },
    preview: boolean,
  ): Promise<RulesResult> {
    const entry = this.cache.entry(repositoryId);
    return entry.mutex.run(() =>
      withWorkspace(this.conn, principal.workspaceId, async (tx) => {
        const { repository } = await this.resolve(tx, repositoryId, undefined);
        const seq = await lockRepository(tx, repositoryId);
        const current = await loadMetamodelPackage(tx, repositoryId);
        if (current.metamodel.version !== body.baseVersion) {
          throw new ApiError(
            409,
            "conflict",
            `The metamodel is at version ${current.metamodel.version} now; reload to see what changed`,
          );
        }
        let after: Metamodel;
        try {
          after = Metamodel.compile(
            { ...current.metamodel, relationshipRules: body.relationshipRules },
            current.diagramTypes,
          );
        } catch (error) {
          if (error instanceof MetamodelError)
            throw invalid(
              "The rules do not fit the metamodel",
              error.problems.slice(0, 20).map((message) => ({ property: "relationshipRules", message })),
            );
          throw error;
        }
        const before = Metamodel.compile(current.metamodel, current.diagramTypes);
        const view = await this.current(tx, entry, repositoryId, repository.baselineScenarioId, seq);
        const version = nextVersion(current.metamodel.version);
        const result = { version, preview, newlyRefused: newlyRefused(view.state, before, after) };
        if (preview) return result;
        await saveRelationshipRules(tx, principal.workspaceId, repositoryId, body.relationshipRules, version);
        entry.metamodel = undefined;
        return result;
      }),
    );
  }

  /**
   * Replaces the repository's whole metamodel with an edited draft (slice A-1b: property types, value lists, which
   * types carry which properties, rules) and publishes it as a new metamodel version. Stored values are never
   * changed: values a type stops carrying are kept and reported. Refused (422) when the draft does not compile or
   * would break stored data (metamodelImpact); 409 when someone published meanwhile.
   */
  async publishMetamodel(
    principal: Principal,
    repositoryId: string,
    body: { baseVersion: string; metamodel: Omit<MetamodelPackage, "version">; diagramTypes: DiagramType[] },
    preview: boolean,
  ): Promise<MetamodelResult> {
    const entry = this.cache.entry(repositoryId);
    return entry.mutex.run(() =>
      withWorkspace(this.conn, principal.workspaceId, async (tx) => {
        const { repository } = await this.resolve(tx, repositoryId, undefined);
        const seq = await lockRepository(tx, repositoryId);
        const current = await loadMetamodelPackage(tx, repositoryId);
        if (current.metamodel.version !== body.baseVersion) {
          throw new ApiError(
            409,
            "conflict",
            `The metamodel is at version ${current.metamodel.version} now; reload to see what changed`,
          );
        }
        const version = nextVersion(current.metamodel.version);
        const pkg = { ...body.metamodel, version } as MetamodelPackage;
        const schemaProblems = [
          ...(() => {
            const r = validatePackage(pkg);
            return r.ok ? [] : r.errors;
          })(),
          ...body.diagramTypes.flatMap((d) => {
            const r = validateDiagramType(d);
            return r.ok ? [] : r.errors.map((e) => `Diagram type ${d.key}: ${e}`);
          }),
        ];
        if (schemaProblems.length > 0) throw draftInvalid(schemaProblems);
        let after: Metamodel;
        try {
          after = Metamodel.compile(pkg, body.diagramTypes);
        } catch (error) {
          if (error instanceof MetamodelError) throw draftInvalid(error.problems);
          throw error;
        }
        const before = Metamodel.compile(current.metamodel, current.diagramTypes);
        const view = await this.current(tx, entry, repositoryId, repository.baselineScenarioId, seq);
        const impact = metamodelImpact(view.state, before, after);
        if (impact.problems.length > 0) throw draftInvalid(impact.problems);
        const result = {
          version,
          preview,
          newlyRefused: newlyRefused(view.state, before, after),
          stranded: impact.stranded,
        };
        if (preview) return result;
        await saveMetamodel(tx, principal.workspaceId, repositoryId, pkg, body.diagramTypes);
        entry.metamodel = undefined;
        return result;
      }),
    );
  }

  /** Deletes a repository and everything in it; false when there was none. */
  async deleteRepository(principal: Principal, repositoryId: string): Promise<boolean> {
    const entry = this.cache.entry(repositoryId);
    const deleted = await entry.mutex.run(() =>
      withWorkspace(this.conn, principal.workspaceId, (tx) => deleteRepository(tx, repositoryId)),
    );
    this.cache.forget(repositoryId);
    return deleted;
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
