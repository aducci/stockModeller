// A scenario's state as engine rows, for sending whole to a browser (GET …/snapshot, decision B16).
// The browser loads it into its own ModelState and runs the same engine on it for optimistic edits.
import type { DiagramType, Id, MetamodelPackage } from "@connectome/model";
import { COLLECTIONS, type CollectionName, type Rows } from "./rows";
import { ModelState } from "./state";

/** Every row of a scenario, tombstones included (the engine needs their versions). Storage bookkeeping is left out. */
export type SnapshotRows = { [C in CollectionName]: Rows[C][] };

/** The response of `GET /repositories/{repo}/snapshot`. */
export interface RepositorySnapshot {
  repository: { id: Id; name: string; baselineScenarioId: Id; seq: number };
  scenario: { id: Id; parentId: Id | null; name: string; state: string };
  /** The repository sequence the rows reflect: open the live connection with ?since= this. */
  seq: number;
  metamodel: { package: MetamodelPackage; diagramTypes: DiagramType[] };
  rows: SnapshotRows;
}

export function snapshotRows(state: ModelState): SnapshotRows {
  const rows = {} as Record<CollectionName, unknown[]>;
  for (const name of COLLECTIONS) {
    rows[name] = [...state.collection(name).all()].map((row) => {
      const { scenarioId: _s, baseVersion: _b, ...rest } = row;
      return rest;
    });
  }
  return rows as SnapshotRows;
}

export function stateFromSnapshot(rows: SnapshotRows): ModelState {
  const state = new ModelState();
  for (const name of COLLECTIONS) state.load(name, rows[name] as never);
  return state;
}
