// The browser's model store (design/03-platform/collaboration-and-changes.md §2): the confirmed state from the
// server with the user's pending changes applied on top, so their edits show at once.
//
// - An edit runs through the same change engine as on the server and is kept as pending until the server answers.
// - A committed change (anyone's, the user's own included) is applied to the confirmed state in sequence order:
//   pending changes are taken off (reverting the rows they touched), the committed change is applied, and the
//   pending changes are applied again on top (rebase). One that no longer applies stays out of the view until
//   the server's rejection arrives.
// - A change the store cannot reproduce exactly (one from an ancestor scenario, or one whose versions come out
//   differently) makes the store stale: the session reloads a snapshot.
// Pure: no I/O. The session (session.ts) connects it to the server.
import {
  applyChange,
  Metamodel,
  stateFromSnapshot,
  type ApplyContext,
  type ModelState,
  type RepositorySnapshot,
  type TouchedRow,
} from "@connectome/engine";
import type { Actor, Change, CommittedChange, Id, Rejection, RuleFinding } from "@connectome/model";

export interface PendingChange {
  change: Change;
  /** The rows it changed in the view; null when it does not apply to the current confirmed state. */
  touched: TouchedRow[] | null;
}

export type EditResult = { ok: true; findings: RuleFinding[] } | { ok: false; reasons: Rejection[] };

/** What a committed change did to the store. */
export type CommitOutcome = "applied" | "ignored" | "stale";

export type StoreEvent =
  /** The view changed. */
  | { type: "changed" }
  /** One of the user's own changes was committed. */
  | { type: "confirmed"; change: CommittedChange }
  /** A committed change (anyone's) was applied to the confirmed state. */
  | { type: "applied"; change: CommittedChange; own: boolean }
  /** The server refused one of the user's changes; it is gone from the view. */
  | { type: "rejected"; change: Change; reasons: Rejection[] };

export interface StoreOptions {
  /** Who is editing: stamped on optimistic rows until the server's version replaces them. */
  user: Actor;
  /** The time stamped on optimistic rows (tests pass a fixed clock). */
  now?: () => string;
}

export class ModelStore {
  readonly metamodel: Metamodel;
  readonly repository: RepositorySnapshot["repository"];
  readonly scenario: RepositorySnapshot["scenario"];
  /** The view: confirmed state plus pending changes. Read it, never write it. */
  state: ModelState;
  /** The sequence number of the last committed change applied. */
  seq: number;

  private pending: PendingChange[] = [];
  private readonly listeners = new Set<(event: StoreEvent) => void>();

  constructor(
    snapshot: RepositorySnapshot,
    private readonly options: StoreOptions,
  ) {
    this.metamodel = Metamodel.compile(snapshot.metamodel.package, snapshot.metamodel.diagramTypes);
    this.repository = snapshot.repository;
    this.scenario = snapshot.scenario;
    this.state = stateFromSnapshot(snapshot.rows);
    this.seq = snapshot.seq;
  }

  /** Changes sent (or to send) and not yet answered, oldest first. */
  get pendingChanges(): readonly Change[] {
    return this.pending.map((p) => p.change);
  }

  subscribe(listener: (event: StoreEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Applies a change to the view at once. A change the engine refuses is not kept (and must not be sent). */
  edit(change: Change): EditResult {
    if (this.pending.some((p) => p.change.id === change.id)) {
      const message = `Change ${change.id} is already pending`;
      return { ok: false, reasons: [{ code: "invalid", editIndex: 0, property: "id", message }] };
    }
    const result = applyChange(this.state, change, this.context(this.options.user, this.options.now?.()));
    if (!result.ok) return { ok: false, reasons: result.reasons };
    this.pending.push({ change, touched: result.touched });
    this.emit({ type: "changed" });
    return { ok: true, findings: result.findings };
  }

  /** Applies a committed change from the server. "stale" means the store needs a snapshot (see reset). */
  commit(committed: CommittedChange): CommitOutcome {
    if (committed.seq <= this.seq) return "ignored";
    // Scenario resolution happens on the server: an ancestor's edit may be hidden by this scenario's own rows.
    if (committed.scenarioId !== this.scenario.id) return "stale";

    let exact = true;
    let own = false;
    this.rebase(() => {
      const result = applyChange(this.state, committed, this.context(committed.actor, committed.committedAt));
      exact = result.ok && sameVersions(result.versions, committed.versions);
      this.seq = committed.seq;
      // One of ours: it is in the confirmed state now, so its optimistic copy is not put back.
      const index = this.pending.findIndex((p) => p.change.id === committed.id);
      if (index >= 0) own = this.pending.splice(index, 1).length > 0;
    });
    if (own) this.emit({ type: "confirmed", change: committed });
    this.emit({ type: "applied", change: committed, own });
    this.emit({ type: "changed" });
    return exact ? "applied" : "stale";
  }

  /** The server refused a pending change. Returns false when no such change is pending. */
  reject(changeId: Id, reasons: Rejection[]): boolean {
    const index = this.pending.findIndex((p) => p.change.id === changeId);
    if (index < 0) return false;
    const [entry] = this.rebase(() => this.pending.splice(index, 1));
    this.emit({ type: "rejected", change: entry!.change, reasons });
    this.emit({ type: "changed" });
    return true;
  }

  /**
   * Drops a pending change the server has answered some other way (e.g. a resend over HTTP that was committed
   * before a snapshot was taken). The view is not rebuilt: call reset next.
   */
  forget(changeId: Id): Change | undefined {
    const index = this.pending.findIndex((p) => p.change.id === changeId);
    return index < 0 ? undefined : this.pending.splice(index, 1)[0]!.change;
  }

  /** Replaces the confirmed state with a fresh snapshot of the same scenario and re-applies pending changes. */
  reset(snapshot: RepositorySnapshot): void {
    if (snapshot.scenario.id !== this.scenario.id) throw new Error("The snapshot is of another scenario");
    this.state = stateFromSnapshot(snapshot.rows);
    this.seq = snapshot.seq;
    for (const p of this.pending) p.touched = null;
    this.rebase(() => {});
    this.emit({ type: "changed" });
  }

  // ------------------------------------------------------------------ internals

  /** Takes the pending changes off the view, runs `fn` on the confirmed state, then puts them back on. */
  private rebase<T>(fn: () => T): T {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const touched = this.pending[i]!.touched;
      if (touched) this.state.revert(touched);
    }
    const value = fn();
    for (const p of this.pending) {
      const result = applyChange(this.state, p.change, this.context(this.options.user, this.options.now?.()));
      p.touched = result.ok ? result.touched : null;
    }
    return value;
  }

  private context(actor: Actor, now: string | undefined): ApplyContext {
    return {
      metamodel: this.metamodel,
      actor,
      scenario: { id: this.scenario.id, isBaseline: this.scenario.parentId === null },
      ...(now ? { now } : {}),
    };
  }

  private emit(event: StoreEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

function sameVersions(a: Record<Id, number>, b: Record<Id, number>): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
}
