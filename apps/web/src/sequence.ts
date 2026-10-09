// Edits the sequence view makes (views-and-design-artifacts.md §6): lifelines, messages placed at a step, steps
// moved, and a sequence created for an interaction from a document's table.
import type { DiagramRow, Metamodel, ModelState } from "@connectome/engine";
import { ulid, type Edit, type Id } from "@connectome/model";
import { undrawnMessages, type SequenceModel } from "@connectome/views";
import { rankBetween } from "./dragdrop";
import { symbolFor } from "./diagram";

/** Distance between lifelines, in diagram units (a lifeline's `x`). */
export const LANE_SPACING = 220;

/**
 * Where a message inserted after message `index` (-1 for the top) goes: between its neighbours' steps when every
 * message has one, otherwise after the last step (the order of unstepped messages is not stable to insert into).
 */
export function insertAfter(sequence: SequenceModel, index: number): { after?: string; before?: string } {
  const steps = sequence.messages.map((m) => m.occurrence.step);
  if (steps.every((x) => x !== undefined)) return { after: steps[index], before: steps[index + 1] };
  const stepped = steps.filter((x): x is string => x !== undefined);
  return { after: stepped.length ? stepped.reduce((a, b) => (a > b ? a : b)) : undefined };
}

/** Where a message goes at the end. */
export const atEnd = (sequence: SequenceModel) => insertAfter(sequence, sequence.messages.length - 1);

/**
 * Moves a message to `index` (0-based, among the others). Only the moved message changes when its new neighbours
 * have steps in order; otherwise every message gets a fresh step in the new order, so all viewers see the same.
 */
export function moveMessageEdits(diagramId: Id, sequence: SequenceModel, from: number, to: number): Edit[] {
  const order = [...sequence.messages];
  const [moved] = order.splice(from, 1);
  if (!moved || to < 0 || to > order.length) return [];
  const before = order[to - 1]?.occurrence.step;
  const after = order[to]?.occurrence.step;
  const neighboursOk =
    (to === 0 || before !== undefined) &&
    (to === order.length || after !== undefined) &&
    (!before || !after || before < after);
  if (neighboursOk)
    return [{ edit: "setMessageStep", diagramId, occurrenceId: moved.occurrence.id, step: rankBetween(before, after) }];
  order.splice(to, 0, moved);
  let at: string | undefined;
  return order.map((m) => ({
    edit: "setMessageStep" as const,
    diagramId,
    occurrenceId: m.occurrence.id,
    step: (at = rankBetween(at, undefined)),
  }));
}

/** Draws relationships as messages between the lifelines of their ends, at `where`. Ends without a lifeline are skipped. */
export function placeMessagesEdits(
  sequence: SequenceModel,
  diagramId: Id,
  relationships: { id: Id; sourceId: Id; targetId: Id }[],
  where: { after?: string; before?: string },
): Edit[] {
  const laneOf = (objectId: Id) => sequence.lifelines.find((l) => l.occurrence.objectId === objectId)?.occurrence.id;
  let at = where.after;
  return relationships.flatMap((r): Edit[] => {
    const source = laneOf(r.sourceId);
    const target = laneOf(r.targetId);
    if (!source || !target) return [];
    return [
      {
        edit: "addRelationshipOccurrence",
        diagramId,
        occurrence: {
          id: ulid(),
          relationshipId: r.id,
          sourceOccurrenceId: source,
          targetOccurrenceId: target,
          shownAs: "line",
          route: { mode: "auto" },
          labelPosition: 0.5,
          style: {},
          step: (at = rankBetween(at, where.before)),
        },
      },
    ];
  });
}

/** A lifeline for an object, to the right of the others. */
export function addLifelineEdit(
  metamodel: Metamodel,
  diagram: DiagramRow,
  sequence: SequenceModel,
  objectId: Id,
  objectType: string,
  id: Id = ulid(),
): Edit {
  const symbol = symbolFor(metamodel, diagram, objectType);
  const x = sequence.lifelines.length
    ? Math.max(...sequence.lifelines.map((l) => l.occurrence.x)) + LANE_SPACING
    : LANE_SPACING / 2;
  return {
    edit: "addObjectOccurrence",
    diagramId: diagram.id,
    occurrence: {
      id,
      objectId,
      parentOccurrenceId: null,
      x,
      y: 40,
      w: symbol.width,
      h: symbol.height,
      z: 1,
      style: {},
      drillDownDiagramId: null,
      pinned: false,
    },
  };
}

/**
 * A new sequence diagram for an interaction (a document table's per-row link, decision V4): its two ends as
 * lifelines and its messages in order. The caller adds the edit that records the link.
 */
export function sequenceForInteractionEdits(
  state: ModelState,
  metamodel: Metamodel,
  interactionId: Id,
  diagramType: string,
  folderId: Id,
  id: Id = ulid(),
): { name: string; edits: Edit[] } | { error: string } {
  const interaction = state.relationships.get(interactionId);
  const source = interaction && state.objects.get(interaction.sourceId);
  const target = interaction && state.objects.get(interaction.targetId);
  if (!interaction || !source || !target) return { error: "That interaction was deleted meanwhile" };
  const verb = metamodel.relationshipType(interaction.type)?.verb ?? interaction.type;
  const name = `${source.name} ${verb} ${target.name}${interaction.name ? `: ${interaction.name}` : ""}`;
  const diagram = { id, diagramType } as DiagramRow;
  const lane = (objectId: Id, type: string, index: number) => {
    const symbol = symbolFor(metamodel, diagram, type);
    return {
      id: ulid(),
      objectId,
      parentOccurrenceId: null,
      x: LANE_SPACING / 2 + index * LANE_SPACING,
      y: 40,
      w: symbol.width,
      h: symbol.height,
      z: 1,
      style: {},
      drillDownDiagramId: null,
      pinned: false,
    };
  };
  const lanes = [lane(source.id, source.type, 0), lane(target.id, target.type, 1)];
  const laneOf = (objectId: Id) => lanes.find((l) => l.objectId === objectId)!.id;
  let at: string | undefined;
  const messages = state.relationships
    .find("byParent", interaction.id)
    .sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id))
    .map((m): Edit => ({
      edit: "addRelationshipOccurrence",
      diagramId: id,
      occurrence: {
        id: ulid(),
        relationshipId: m.id,
        sourceOccurrenceId: laneOf(m.sourceId),
        targetOccurrenceId: laneOf(m.targetId),
        shownAs: "line",
        route: { mode: "auto" },
        labelPosition: 0.5,
        style: {},
        step: (at = rankBetween(at, undefined)),
      },
    }));
  return {
    name,
    edits: [
      { edit: "createDiagram", id, name, diagramType, folderId },
      ...lanes.map((occurrence): Edit => ({ edit: "addObjectOccurrence", diagramId: id, occurrence })),
      ...messages,
    ],
  };
}

/**
 * A new sequence diagram with these objects as lifelines, left to right, and when `withMessages` the messages of
 * their interactions with each other in each interaction's order (§6, "Generate from interactions").
 */
export function newSequenceEdits(
  state: ModelState,
  metamodel: Metamodel,
  objectIds: readonly Id[],
  diagram: { id?: Id; name: string; diagramType: string; folderId: Id; definition?: Record<string, unknown> },
  withMessages = true,
): Edit[] {
  const id = diagram.id ?? ulid();
  const row = { id, diagramType: diagram.diagramType } as DiagramRow;
  const lanes = objectIds.flatMap((objectId, index) => {
    const object = state.objects.get(objectId);
    if (!object) return [];
    const symbol = symbolFor(metamodel, row, object.type);
    return [
      {
        id: ulid(),
        objectId,
        parentOccurrenceId: null,
        x: LANE_SPACING / 2 + index * LANE_SPACING,
        y: 40,
        w: symbol.width,
        h: symbol.height,
        z: 1,
        style: {},
        drillDownDiagramId: null,
        pinned: false,
      },
    ];
  });
  const laneOf = (objectId: Id) => lanes.find((l) => l.objectId === objectId)?.id;
  let at: string | undefined;
  const messages = withMessages
    ? undrawnMessages(state, id, objectIds).flatMap((m): Edit[] => {
        const source = laneOf(m.sourceId);
        const target = laneOf(m.targetId);
        if (!source || !target) return [];
        return [
          {
            edit: "addRelationshipOccurrence",
            diagramId: id,
            occurrence: {
              id: ulid(),
              relationshipId: m.id,
              sourceOccurrenceId: source,
              targetOccurrenceId: target,
              shownAs: "line",
              route: { mode: "auto" },
              labelPosition: 0.5,
              style: {},
              step: (at = rankBetween(at, undefined)),
            },
          },
        ];
      })
    : [];
  return [
    {
      edit: "createDiagram",
      id,
      name: diagram.name,
      diagramType: diagram.diagramType,
      folderId: diagram.folderId,
      ...(diagram.definition ? { definition: diagram.definition } : {}),
    },
    ...lanes.map((occurrence): Edit => ({ edit: "addObjectOccurrence", diagramId: id, occurrence })),
    ...messages,
  ];
}

/** The objects an object has interactions with, either way round, by name. */
export function interactionPartners(state: ModelState, metamodel: Metamodel, objectId: Id): Id[] {
  const ids = new Set<Id>();
  for (const r of [
    ...state.relationships.find("bySource", objectId),
    ...state.relationships.find("byTarget", objectId),
  ])
    if (metamodel.relationshipType(r.type)?.semantic === "interaction")
      ids.add(r.sourceId === objectId ? r.targetId : r.sourceId);
  return [...ids].sort((a, b) => (state.objects.get(a)?.name ?? "").localeCompare(state.objects.get(b)?.name ?? ""));
}
