// An in-memory stand-in for the server's write path: the same engine, one sequence, the example repository.
import { essentials, insuranceGroup } from "@connectome/content";
import {
  applyChange,
  Metamodel,
  ModelState,
  snapshotRows,
  type RepositorySnapshot,
  type SnapshotRows,
} from "@connectome/engine";
import type { Actor, Change, CommittedChange, Rejection } from "@connectome/model";
import { ModelStore } from "../src";

export const BASELINE = insuranceGroup.baselineScenarioId;
export const dana: Actor = { kind: "user", id: "dana" };
export const lee: Actor = { kind: "user", id: "lee" };
const metamodel = Metamodel.compile(essentials.metamodel, essentials.diagramTypes);
const scenario = { id: BASELINE, parentId: null, name: "Baseline", state: "baseline" };

export class FakeServer {
  readonly state = new ModelState();
  seq = 0;
  private clock = Date.parse("2026-10-06T08:00:00.000Z");

  constructor() {
    const result = this.commit(insuranceGroup.baselineChange(), dana);
    if ("reasons" in result) throw new Error("example rejected");
  }

  /** Applies and "commits" a change, as ModelService.submit does. */
  commit(change: Change, actor: Actor): CommittedChange | { reasons: Rejection[] } {
    const committedAt = new Date((this.clock += 1000)).toISOString();
    const result = applyChange(this.state, change, {
      metamodel,
      actor,
      scenario: { id: BASELINE, isBaseline: true },
      now: committedAt,
    });
    if (!result.ok) return { reasons: result.reasons };
    // Through JSON, as the change travels over the wire.
    return JSON.parse(
      JSON.stringify({
        ...change,
        seq: ++this.seq,
        actor,
        source: "ui",
        committedAt,
        versions: result.versions,
      }),
    ) as CommittedChange;
  }

  snapshot(): RepositorySnapshot {
    return JSON.parse(
      JSON.stringify({
        repository: { id: "R", name: "Example", baselineScenarioId: BASELINE, seq: this.seq },
        scenario,
        seq: this.seq,
        metamodel: { package: essentials.metamodel, diagramTypes: essentials.diagramTypes },
        rows: snapshotRows(this.state),
      }),
    ) as RepositorySnapshot;
  }

  rows(): SnapshotRows {
    return sorted(snapshotRows(this.state));
  }

  store(user: Actor): ModelStore {
    return new ModelStore(this.snapshot(), { user, now: () => "2026-10-06T07:00:00.000Z" });
  }
}

/** Every row of a state (tombstones and versions included), in a stable order, for exact comparison. */
export function rowsOf(state: ModelState): SnapshotRows {
  return sorted(snapshotRows(state));
}

function sorted(rows: SnapshotRows): SnapshotRows {
  const copy = structuredClone(rows) as Record<string, { id: string }[]>;
  for (const list of Object.values(copy)) list.sort((a, b) => a.id.localeCompare(b.id));
  return copy as unknown as SnapshotRows;
}

let counter = 0;
export const change = (label: string, edits: Change["edits"]): Change => ({
  id: `C-${++counter}-${label.replace(/\W/g, "")}`,
  scenarioId: BASELINE,
  label,
  edits,
});
