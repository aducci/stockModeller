// The sequence view (views-and-design-artifacts.md §6): lifelines are object occurrences, messages are occurrences of
// flows (an interaction's request and response messages, or plain flows), drawn in step order in UML style.
import type { Id } from "@connectome/model";
import type {
  Metamodel,
  ModelState,
  ObjectOccurrenceRow,
  ObjectRow,
  RelationshipOccurrenceRow,
  RelationshipRow,
} from "@connectome/engine";

export interface Lifeline {
  occurrence: ObjectOccurrenceRow;
  object: ObjectRow | undefined;
}

export interface SequenceMessage {
  occurrence: RelationshipOccurrenceRow;
  relationship: RelationshipRow;
  /** Lane indexes of the sender and the receiver. */
  from: number;
  to: number;
  /** 1-based, in the order drawn. */
  number: number;
  /** A request goes the interaction's way, a response comes back; a flow has no interaction. */
  role: "request" | "response" | "flow";
  interaction: RelationshipRow | undefined;
  /** Requests of asynchronous and fire-and-forget interactions have an open head. */
  synchronous: boolean;
  payload: ObjectRow[];
}

/** An activation bar: on a lane, from a request to its interaction's next response. */
export interface Activation {
  lane: number;
  from: number;
  to: number;
  depth: number;
}

export interface SequenceModel {
  lifelines: Lifeline[];
  messages: SequenceMessage[];
  activations: Activation[];
}

/** Messages in step order: stepped ones by step, then the rest by their interaction's message rank. */
export function compareMessages(
  a: { occurrence: RelationshipOccurrenceRow; relationship: RelationshipRow },
  b: { occurrence: RelationshipOccurrenceRow; relationship: RelationshipRow },
): number {
  const sa = a.occurrence.step;
  const sb = b.occurrence.step;
  if (sa !== undefined && sb !== undefined && sa !== sb) return sa < sb ? -1 : 1;
  if (sa !== undefined && sb === undefined) return -1;
  if (sa === undefined && sb !== undefined) return 1;
  return a.relationship.rank - b.relationship.rank || a.occurrence.id.localeCompare(b.occurrence.id);
}

export function projectSequence(state: ModelState, metamodel: Metamodel, diagramId: Id): SequenceModel {
  const lifelines = state.objectOccurrences
    .find("byDiagram", diagramId)
    .filter((o) => !o.parentOccurrenceId)
    .sort((a, b) => a.x - b.x || a.id.localeCompare(b.id))
    .map((occurrence) => ({ occurrence, object: state.objects.get(occurrence.objectId) }));
  const lane = new Map(lifelines.map((l, i) => [l.occurrence.id, i]));

  const drawn = state.relationshipOccurrences
    .find("byDiagram", diagramId)
    .flatMap((occurrence) => {
      const relationship = state.relationships.get(occurrence.relationshipId);
      if (!relationship || metamodel.relationshipType(relationship.type)?.semantic !== "flow") return [];
      const from = lane.get(occurrence.sourceOccurrenceId);
      const to = lane.get(occurrence.targetOccurrenceId);
      return from === undefined || to === undefined ? [] : [{ occurrence, relationship, from, to }];
    })
    .sort(compareMessages);

  const messages: SequenceMessage[] = drawn.map((m, i) => {
    const interaction = m.relationship.parentId ? state.relationships.get(m.relationship.parentId) : undefined;
    const role = !interaction ? "flow" : m.relationship.sourceId === interaction.sourceId ? "request" : "response";
    const pattern = interaction?.properties["interaction.pattern"];
    return {
      ...m,
      number: i + 1,
      role,
      interaction,
      synchronous: pattern !== "asynchronous" && pattern !== "fireAndForget",
      payload: m.relationship.payload.flatMap((id) => state.objects.get(id) ?? []),
    };
  });

  // A response answers the latest unanswered synchronous request of its interaction.
  const activations: Activation[] = [];
  const open = new Map<Id, number[]>();
  messages.forEach((m, i) => {
    if (!m.interaction) return;
    const waiting = open.get(m.interaction.id) ?? [];
    open.set(m.interaction.id, waiting);
    if (m.role === "request" && m.synchronous) waiting.push(i);
    if (m.role === "response") {
      const request = waiting.pop();
      if (request !== undefined) activations.push({ lane: messages[request]!.to, from: request, to: i, depth: 0 });
    }
  });
  activations.sort((a, b) => a.from - b.from);
  for (const a of activations)
    a.depth = activations.filter((b) => b !== a && b.lane === a.lane && b.from < a.from && b.to > a.to).length;
  return { lifelines, messages, activations };
}

/**
 * Messages of interactions between the given objects that are not on the diagram yet, in each interaction's own
 * message order: what "Add their messages" draws (§6, "Generate from interactions").
 */
export function undrawnMessages(state: ModelState, diagramId: Id, objectIds: readonly Id[]): RelationshipRow[] {
  const on = new Set(objectIds);
  const drawn = new Set(state.relationshipOccurrences.find("byDiagram", diagramId).map((o) => o.relationshipId));
  const interactions = new Map<Id, RelationshipRow>();
  for (const id of on)
    for (const r of state.relationships.find("bySource", id))
      if (on.has(r.targetId) && state.relationships.find("byParent", r.id).length > 0) interactions.set(r.id, r);
  return [...interactions.values()]
    .sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id))
    .flatMap((i) =>
      state.relationships
        .find("byParent", i.id)
        .filter((m) => !drawn.has(m.id))
        .sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id)),
    );
}

/** The interactions between two objects, either way round. */
export function interactionsBetween(state: ModelState, metamodel: Metamodel, a: Id, b: Id): RelationshipRow[] {
  return [...state.relationships.find("bySource", a), ...state.relationships.find("bySource", b)].filter(
    (r) =>
      ((r.sourceId === a && r.targetId === b) || (r.sourceId === b && r.targetId === a)) &&
      metamodel.relationshipType(r.type)?.semantic === "interaction",
  );
}
