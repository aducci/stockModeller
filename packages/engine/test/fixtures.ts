// Test fixtures built from the design pack, so the engine is tested against the spec's own examples.
import { essentials } from "@connectome/content";
import { parseChange, type Actor, type Change, type Edit, type Id } from "@connectome/model";
import { applyChange, Metamodel, ModelState, type ApplyContext, type ApplyResult } from "../src";
import { readDesignJson } from "../../model/test/design";

export const metamodel = Metamodel.compile(essentials.metamodel, essentials.diagramTypes);

export const BASELINE = "S0000000000000000000000001";
export const TARGET_2027 = "S0000000000000000000000002";

export const dana: Actor = { kind: "user", id: "U-DANA" };
export const lee: Actor = { kind: "user", id: "U-LEE" };

interface ExampleRepository {
  folders: { id: Id; parentId: Id | null; name: string }[];
  objects: Record<string, unknown>[];
  relationships: Record<string, unknown>[];
  scenarioChanges: Record<Id, Record<string, unknown>[]>;
  diagrams: {
    id: Id;
    name: string;
    diagramType: string;
    folderId: Id;
    objectOccurrences: Record<string, unknown>[];
    relationshipOccurrences: Record<string, unknown>[];
    annotations: Record<string, unknown>[];
  }[];
}

export const example = readDesignJson<ExampleRepository>("05-structures/example-repository.json");

/** The example repository's baseline as one change (folders, objects, relationships, the diagram). */
export function exampleBaselineChange(): Change {
  const edits: unknown[] = [
    ...example.folders.map((f) => ({ edit: "createFolder", ...f })),
    ...example.objects.map((o) => ({ edit: "createObject", ...o })),
    ...example.relationships.map((r) => ({ edit: "createRelationship", ...r })),
  ];
  for (const d of example.diagrams) {
    edits.push({ edit: "createDiagram", id: d.id, name: d.name, diagramType: d.diagramType, folderId: d.folderId });
    for (const occurrence of d.objectOccurrences)
      edits.push({ edit: "addObjectOccurrence", diagramId: d.id, occurrence });
    for (const occurrence of d.relationshipOccurrences) {
      edits.push({ edit: "addRelationshipOccurrence", diagramId: d.id, occurrence });
    }
    for (const annotation of d.annotations) edits.push({ edit: "addAnnotation", diagramId: d.id, annotation });
  }
  return parseChange({ id: "C-EXAMPLE", scenarioId: BASELINE, label: "Load example repository", edits });
}

/** The Target 2027 scenario's own edits, with base versions filled in from the state they apply to. */
export function exampleScenarioChange(state: ModelState): Change {
  const edits = example.scenarioChanges[TARGET_2027]!.map((e) => {
    const id = e.id as Id;
    const existing = state.objects.get(id) ?? state.relationships.get(id);
    return "baseVersion" in e || !existing || String(e.edit).startsWith("create")
      ? e
      : { ...e, baseVersion: existing.version };
  });
  return parseChange({ id: "C-TARGET-2027", scenarioId: TARGET_2027, label: "Target 2027", edits });
}

export function context(overrides: Partial<ApplyContext> = {}): ApplyContext {
  return {
    metamodel,
    actor: dana,
    scenario: { id: BASELINE, isBaseline: true },
    now: "2026-10-06T12:00:00.000Z",
    ...overrides,
  };
}

let changeCounter = 0;

/** Applies edits as one change in the baseline. */
export function apply(state: ModelState, edits: Edit[], overrides: Partial<ApplyContext> = {}): ApplyResult {
  const ctx = context(overrides);
  return applyChange(state, { id: `C${++changeCounter}`, scenarioId: ctx.scenario.id, label: "test", edits }, ctx);
}

/** Applies edits and fails the test if they are rejected. */
export function applyOk(state: ModelState, edits: Edit[], overrides: Partial<ApplyContext> = {}) {
  const result = apply(state, edits, overrides);
  if (!result.ok) throw new Error(`Change rejected: ${JSON.stringify(result.reasons)}`);
  return result;
}

/** A state holding the example repository's baseline. */
export function exampleState(): ModelState {
  const state = new ModelState();
  const result = applyChange(state, exampleBaselineChange(), context());
  if (!result.ok) throw new Error(`Example repository rejected: ${JSON.stringify(result.reasons)}`);
  return state;
}

/** The live content of a state without bookkeeping, for comparing states. */
export function snapshot(state: ModelState) {
  const strip = (row: object) => {
    const {
      version: _v,
      fieldVersions: _f,
      updatedAt: _a,
      updatedBy: _b,
      deleted: _d,
      ...rest
    } = row as Record<string, unknown>;
    return rest;
  };
  const collection = <T extends { id: Id }>(rows: Iterable<T>) =>
    Object.fromEntries([...rows].map((r) => [r.id, strip(r)]).sort(([a], [b]) => String(a).localeCompare(String(b))));
  return {
    folders: collection(state.folders.live()),
    objects: collection(state.objects.live()),
    relationships: collection(state.relationships.live()),
    diagrams: collection(state.diagrams.live()),
    objectOccurrences: collection(state.objectOccurrences.live()),
    relationshipOccurrences: collection(state.relationshipOccurrences.live()),
    annotations: collection(state.annotations.live()),
  };
}

export const occurrence = (id: Id, objectId: Id, extra: Partial<Record<string, unknown>> = {}) =>
  ({
    id,
    objectId,
    parentOccurrenceId: null,
    x: 0,
    y: 0,
    w: 100,
    h: 40,
    z: 0,
    style: {},
    drillDownDiagramId: null,
    pinned: false,
    ...extra,
  }) as Extract<Edit, { edit: "addObjectOccurrence" }>["occurrence"];

export const line = (
  id: Id,
  relationshipId: Id,
  sourceOccurrenceId: Id,
  targetOccurrenceId: Id,
  shownAs: "line" | "nesting" = "line",
) =>
  ({
    id,
    relationshipId,
    sourceOccurrenceId,
    targetOccurrenceId,
    shownAs,
    route: { mode: "auto" },
    labelPosition: 0.5,
    style: {},
  }) as const;

/** Asserts the structural rules of design/02-model/overview.md §3 (4–6) hold for every live item. */
export function checkInvariants(state: ModelState): void {
  const fail = (message: string) => {
    throw new Error(`Invariant broken: ${message}`);
  };
  for (const f of state.folders.live())
    if (f.parentId && !state.folders.get(f.parentId)) fail(`folder ${f.id} has no parent`);
  for (const o of state.objects.live()) if (!state.folders.get(o.folderId)) fail(`object ${o.id} has no folder`);
  for (const d of state.diagrams.live()) if (!state.folders.get(d.folderId)) fail(`diagram ${d.id} has no folder`);
  for (const r of state.relationships.live()) {
    if (!state.objects.get(r.sourceId) || !state.objects.get(r.targetId))
      fail(`relationship ${r.id} has a missing end`);
    const type = metamodel.relationshipType(r.type)!;
    if (
      type.singleParent &&
      state.relationships.find("byTarget", r.targetId).filter((x) => x.type === r.type).length > 1
    ) {
      fail(`${r.targetId} has two parents through ${r.type}`);
    }
  }
  for (const occ of state.objectOccurrences.live()) {
    if (!state.diagrams.get(occ.diagramId)) fail(`occurrence ${occ.id} is on a missing diagram`);
    if (!state.objects.get(occ.objectId)) fail(`occurrence ${occ.id} shows a missing object`);
    if (occ.parentOccurrenceId) {
      const parent = state.objectOccurrences.get(occ.parentOccurrenceId);
      if (!parent || parent.diagramId !== occ.diagramId) fail(`occurrence ${occ.id} has no parent on its diagram`);
      const backed = state.relationships
        .find("bySource", parent!.objectId)
        .some((r) => r.targetId === occ.objectId && metamodel.relationshipType(r.type)!.nesting);
      if (!backed) fail(`occurrence ${occ.id} is nested without a nesting relationship`);
    }
  }
  for (const ro of state.relationshipOccurrences.live()) {
    const rel = state.relationships.get(ro.relationshipId);
    const source = state.objectOccurrences.get(ro.sourceOccurrenceId);
    const target = state.objectOccurrences.get(ro.targetOccurrenceId);
    if (!rel || !source || !target) fail(`line ${ro.id} has a missing relationship or end`);
    if (source!.diagramId !== ro.diagramId || target!.diagramId !== ro.diagramId)
      fail(`line ${ro.id} leaves its diagram`);
    if (source!.objectId !== rel!.sourceId || target!.objectId !== rel!.targetId)
      fail(`line ${ro.id} joins the wrong objects`);
    if (ro.shownAs === "nesting" && target!.parentOccurrenceId !== source!.id)
      fail(`nesting line ${ro.id} does not match the picture`);
  }
  for (const an of state.annotations.live()) {
    if (!state.diagrams.get(an.diagramId)) fail(`annotation ${an.id} is on a missing diagram`);
    if (an.parentOccurrenceId && !state.objectOccurrences.get(an.parentOccurrenceId))
      fail(`annotation ${an.id} has no parent`);
  }
}
