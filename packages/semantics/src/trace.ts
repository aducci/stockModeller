// Traces (design/02-model/semantics.md §9.3): follow relationships by what they mean, whatever the types are called.
import type { Metamodel, ModelState, RelationshipRow } from "@connectome/engine";
import type { Id, SemanticKind, SemanticLevel } from "@connectome/model";

/**
 * - `levels`: realisation and representation. Forward goes down the levels (what implements or represents this),
 *   backward up (what this implements or represents).
 * - `flow`: flows, interaction messages included. Forward is downstream, backward upstream.
 * - `payload`: flows that carry this object, or something that realises or represents it. Forward finds the objects
 *   that receive it, backward those that send it.
 * - `dependency`: serving, access, interactions and flows. Forward finds what this depends on (its providers, the
 *   information it uses, what it calls, what feeds it), backward what depends on it.
 */
export type TraceKind = "levels" | "flow" | "payload" | "dependency";
export type TraceDirection = "forward" | "backward";
export const TRACE_KINDS: readonly TraceKind[] = ["levels", "flow", "payload", "dependency"];

export interface TraceOptions {
  /** How many relationships deep to follow (default 6). `payload` is always one step. */
  depth?: number;
  /** `flow` and `dependency`: a container's relationships count as its contents' too (default false). */
  contents?: boolean;
  /** Stop after this many objects (default 1000); the trace then says it was truncated. */
  limit?: number;
}

export interface TraceStep {
  objectId: Id;
  /** Relationships followed from the start (1 = directly related). */
  depth: number;
  /** The relationship that reached it, and the object at its other end. */
  relationshipId: Id;
  fromId: Id;
}

export interface Trace {
  kind: TraceKind;
  direction: TraceDirection;
  startId: Id;
  /** Each object once, by the shortest route found, nearest first. */
  steps: TraceStep[];
  truncated: boolean;
}

/** A relationship read by its kind's meaning: `from` plays the kind's source role (semanticDirection applied). */
interface Edge {
  relationship: RelationshipRow;
  kind: SemanticKind;
  from: Id;
  to: Id;
}

function edge(metamodel: Metamodel, relationship: RelationshipRow): Edge {
  const type = metamodel.relationshipType(relationship.type);
  const reverse = type?.semanticDirection === "reverse";
  return {
    relationship,
    kind: type?.semantic ?? "association",
    from: reverse ? relationship.targetId : relationship.sourceId,
    to: reverse ? relationship.sourceId : relationship.targetId,
  };
}

/** Which way each kind is followed from an object, for a trace kind going forward. */
const FORWARD: Record<Exclude<TraceKind, "payload">, Partial<Record<SemanticKind, "out" | "in">>> = {
  // A realiser is the source of a realisation, so going down the levels follows realisations backwards.
  levels: { realisation: "in", representation: "in" },
  flow: { flow: "out" },
  dependency: { serving: "in", access: "out", interaction: "out", flow: "in" },
};

export function trace(
  state: ModelState,
  metamodel: Metamodel,
  startId: Id,
  kind: TraceKind,
  direction: TraceDirection,
  options: TraceOptions = {},
): Trace {
  const result: Trace = { kind, direction, startId, steps: [], truncated: false };
  if (!state.objects.get(startId)) return result;
  const limit = options.limit ?? 1000;
  if (kind === "payload") return payloadTrace(state, metamodel, result, limit);

  const depth = options.depth ?? 6;
  const ways = FORWARD[kind];
  const flip = (way: "out" | "in") => (direction === "forward" ? way : way === "out" ? "in" : "out");
  const seen = new Set<Id>([startId]);
  let frontier = [startId];
  for (let d = 1; d <= depth && frontier.length > 0; d++) {
    const next: Id[] = [];
    for (const id of frontier) {
      for (const e of edgesOf(state, metamodel, id, options.contents ?? false)) {
        const way = ways[e.kind];
        if (!way) continue;
        const outward = flip(way) === "out";
        // With contents, the edge may belong to a content: the far end is whichever end is not inside `id`.
        const near = outward ? e.from : e.to;
        const far = outward ? e.to : e.from;
        if (!e.endsAt.has(near) || seen.has(far) || !state.objects.get(far)) continue;
        if (result.steps.length >= limit) {
          result.truncated = true;
          return result;
        }
        seen.add(far);
        next.push(far);
        result.steps.push({ objectId: far, depth: d, relationshipId: e.relationship.id, fromId: id });
      }
    }
    frontier = next;
  }
  return result;
}

/** An object's relationships (and, with `contents`, its contents' relationships), each with the ends that count as it. */
function edgesOf(state: ModelState, metamodel: Metamodel, id: Id, contents: boolean): (Edge & { endsAt: Set<Id> })[] {
  const self = new Set<Id>([id]);
  if (contents) {
    const queue = [id];
    while (queue.length > 0) {
      const current = queue.pop()!;
      for (const r of state.relationships.find("bySource", current)) {
        if (metamodel.relationshipType(r.type)?.semantic === "containment" && !self.has(r.targetId)) {
          self.add(r.targetId);
          queue.push(r.targetId);
        }
      }
    }
  }
  const rows = new Map<Id, RelationshipRow>();
  for (const member of self) {
    for (const r of state.relationships.find("bySource", member)) rows.set(r.id, r);
    for (const r of state.relationships.find("byTarget", member)) rows.set(r.id, r);
  }
  return [...rows.values()]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((r) => ({ ...edge(metamodel, r), endsAt: self }))
    .filter((e) => !(self.has(e.from) && self.has(e.to))); // relationships inside the container lead nowhere new
}

function payloadTrace(state: ModelState, metamodel: Metamodel, result: Trace, limit: number): Trace {
  // What it is carried as: itself, and whatever realises or represents it, at any depth (§9.3).
  const carried = [
    result.startId,
    ...trace(state, metamodel, result.startId, "levels", "forward", { limit }).steps.map((s) => s.objectId),
  ];
  const seen = new Set<Id>([result.startId]);
  for (const payloadId of carried) {
    const flows = state.relationships
      .find("byPayload", payloadId)
      .map((r) => edge(metamodel, r))
      .filter((e) => e.kind === "flow")
      .sort((a, b) => a.relationship.id.localeCompare(b.relationship.id));
    for (const e of flows) {
      const objectId = result.direction === "forward" ? e.to : e.from;
      if (seen.has(objectId)) continue;
      if (result.steps.length >= limit) {
        result.truncated = true;
        return result;
      }
      seen.add(objectId);
      result.steps.push({ objectId, depth: 1, relationshipId: e.relationship.id, fromId: payloadId });
    }
  }
  return result;
}

/** A trace's objects in columns by level, conceptual first (the trace view, §9.3); objects without a level last. */
export function traceByLevel(
  state: ModelState,
  metamodel: Metamodel,
  result: Trace,
): { level: SemanticLevel | null; objectIds: Id[] }[] {
  const order: (SemanticLevel | null)[] = ["conceptual", "logical", "physical", "implementation", null];
  const columns = new Map<SemanticLevel | null, Id[]>(order.map((l) => [l, []]));
  for (const step of result.steps) {
    const object = state.objects.get(step.objectId);
    if (!object) continue;
    columns.get(metamodel.objectLevel(object) ?? null)!.push(step.objectId);
  }
  return order.map((level) => ({ level, objectIds: columns.get(level)! })).filter((c) => c.objectIds.length > 0);
}
