// What the semantic kinds mean for the workbench (design/02-model/semantics.md §9.1). Pure, so it is unit-tested.
import type { Metamodel, ModelState, ObjectRow, RelationshipRow } from "@connectome/engine";
import { SEMANTIC_KINDS, ulid, type Edit, type Id, type SemanticKind } from "@connectome/model";

export interface RelationshipGroup {
  kind: SemanticKind;
  direction: "outgoing" | "incoming";
  /** The kind's navigation label from this object's side, e.g. "Implementations". */
  label: string;
  rows: { relationship: RelationshipRow; verb: string; arrow: "→" | "←"; other: Id }[];
}

/**
 * An object's relationships grouped by semantic kind and direction, in the kinds' order (outgoing first), then by
 * verb and the other object's name. Each row reads in the type's own words.
 */
export function relationshipGroups(state: ModelState, metamodel: Metamodel, objectId: Id): RelationshipGroup[] {
  const groups = new Map<string, RelationshipGroup>();
  const add = (relationship: RelationshipRow, end: "source" | "target") => {
    const type = metamodel.relationshipType(relationship.type);
    const kind = type?.semantic ?? "association";
    const direction = metamodel.semanticDirection(relationship.type, end);
    const info = SEMANTIC_KINDS.find((k) => k.kind === kind)!;
    const key = `${kind}:${direction}`;
    const group = groups.get(key) ?? { kind, direction, label: info[direction], rows: [] };
    group.rows.push({
      relationship,
      verb: (end === "source" ? type?.verb : type?.inverseVerb) ?? relationship.type,
      arrow: end === "source" ? "→" : "←",
      other: end === "source" ? relationship.targetId : relationship.sourceId,
    });
    groups.set(key, group);
  };
  // Messages are listed under their interaction (semantics.md §6), not on their own.
  for (const r of state.relationships.find("bySource", objectId)) if (r.parentId === null) add(r, "source");
  for (const r of state.relationships.find("byTarget", objectId)) if (r.parentId === null) add(r, "target");

  const order = (g: RelationshipGroup) =>
    SEMANTIC_KINDS.findIndex((k) => k.kind === g.kind) * 2 + (g.direction === "outgoing" ? 0 : 1);
  const name = (id: Id) => state.objects.get(id)?.name ?? id;
  return [...groups.values()]
    .sort((a, b) => order(a) - order(b))
    .map((g) => ({
      ...g,
      rows: g.rows.sort((a, b) => a.verb.localeCompare(b.verb) || name(a.other).localeCompare(name(b.other))),
    }));
}

/**
 * The explorer's semantic groups under an object: its relationship groups without containment (the tree already shows
 * contents and container) and without the relationships shown as group members (`exclude`).
 */
export function explorerGroups(
  state: ModelState,
  metamodel: Metamodel,
  objectId: Id,
  exclude: ReadonlySet<Id> = new Set(),
): RelationshipGroup[] {
  return relationshipGroups(state, metamodel, objectId)
    .filter((g) => g.kind !== "containment")
    .map((g) => ({ ...g, rows: g.rows.filter((r) => !exclude.has(r.relationship.id)) }))
    .filter((g) => g.rows.length > 0);
}

// ------------------------------------------------------------------ containment (semantics.md §3)

const isContainment = (metamodel: Metamodel, type: string) =>
  metamodel.relationshipType(type)?.semantic === "containment";

/** The relationship that holds an object in its container, if any. */
export function containerOf(state: ModelState, metamodel: Metamodel, objectId: Id): RelationshipRow | undefined {
  return state.relationships.find("byTarget", objectId).find((r) => isContainment(metamodel, r.type));
}

/** The objects an object contains directly, by name. */
export function contentsOf(state: ModelState, metamodel: Metamodel, objectId: Id): ObjectRow[] {
  return state.relationships
    .find("bySource", objectId)
    .filter((r) => isContainment(metamodel, r.type))
    .flatMap((r) => state.objects.get(r.targetId) ?? [])
    .sort((a, b) => a.name.localeCompare(b.name));
}

export type Plan = { label: string; edits: Edit[] } | { error: string };

/**
 * Dropping an object onto another makes it a content (workbench.md, "Explorer: a semantic navigator"): a new
 * containment, or the same relationship reconnected when it already has a container. The type is the one it already
 * uses if the rules allow it, otherwise the first allowed containment type in package order.
 */
export function containPlan(state: ModelState, metamodel: Metamodel, childId: Id, parentId: Id): Plan {
  const child = state.objects.get(childId);
  const parent = state.objects.get(parentId);
  if (!child || !parent) return { error: "That object was deleted meanwhile" };
  if (child.id === parent.id) return { error: `${child.name} cannot contain itself` };
  for (let up = containerOf(state, metamodel, parent.id); up; up = containerOf(state, metamodel, up.sourceId)) {
    if (up.sourceId === child.id) return { error: `${parent.name} is already inside ${child.name}` };
  }
  const allows = (type: string) => metamodel.matchingRules(type, parent.type, child.type).length > 0;
  const current = containerOf(state, metamodel, child.id);
  const label = `Put ${child.name} in ${parent.name}`;
  if (current?.sourceId === parent.id) return { error: `${child.name} is already in ${parent.name}` };
  if (current && allows(current.type)) {
    return {
      label,
      edits: [{ edit: "reconnectRelationship", id: current.id, baseVersion: current.version, sourceId: parent.id }],
    };
  }
  const type = metamodel.allRelationshipTypes().find((t) => t.semantic === "containment" && allows(t.key));
  if (!type) {
    const name = (key: string) => metamodel.objectType(key)?.definition.name ?? key;
    return { error: `No containment rule lets a ${name(child.type)} sit inside a ${name(parent.type)}` };
  }
  return {
    label,
    edits: [
      ...(current ? [{ edit: "deleteRelationship" as const, id: current.id, baseVersion: current.version }] : []),
      { edit: "createRelationship", id: ulid(), type: type.key, sourceId: parent.id, targetId: child.id },
    ],
  };
}

/** Dropping an object onto a folder moves it there; a content leaves its container first (folder follows container). */
export function moveToFolderPlan(state: ModelState, metamodel: Metamodel, objectId: Id, folderId: Id): Plan {
  const object = state.objects.get(objectId);
  const folder = state.folders.get(folderId);
  if (!object || !folder) return { error: "That item was deleted meanwhile" };
  const current = containerOf(state, metamodel, object.id);
  if (!current && object.folderId === folderId) return { error: `${object.name} is already in ${folder.name}` };
  const container = current && state.objects.get(current.sourceId);
  return {
    label:
      container && object.folderId === folderId
        ? `Take ${object.name} out of ${container.name}`
        : `Move ${object.name} to ${folder.name}`,
    edits: [
      ...(current ? [{ edit: "deleteRelationship" as const, id: current.id, baseVersion: current.version }] : []),
      ...(object.folderId === folderId
        ? []
        : [{ edit: "moveToFolder" as const, id: object.id, baseVersion: object.version, folderId }]),
    ],
  };
}

// ------------------------------------------------------------------ payloads and messages (semantics.md §5–§6)

/** What a relationship carries, by name, e.g. "Payment Information, Claim". Empty when it carries nothing. */
export function payloadText(state: ModelState, relationship: RelationshipRow): string {
  return relationship.payload.map((id) => state.objects.get(id)?.name ?? "(deleted)").join(", ");
}

/** An interaction's messages in order, each with its role: a request goes the interaction's way, a response back. */
export function messagesOf(
  state: ModelState,
  interaction: RelationshipRow,
): { message: RelationshipRow; role: "request" | "response" }[] {
  return state.relationships
    .find("byParent", interaction.id)
    .sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id))
    .map((message) => ({ message, role: message.sourceId === interaction.sourceId ? "request" : "response" }));
}

/** Objects offered as a payload: information first (the framework's usual payload), then everything else, by name. */
export function payloadChoices(state: ModelState, metamodel: Metamodel, relationship: RelationshipRow): ObjectRow[] {
  const information = (o: ObjectRow) => metamodel.objectType(o.type)?.category === "information";
  return [...state.objects.live()]
    .filter((o) => !relationship.payload.includes(o.id))
    .sort((a, b) => Number(information(b)) - Number(information(a)) || a.name.localeCompare(b.name));
}

/** Adds an object to what a relationship carries (dropping it on a flow line, or the payload picker). */
export function addPayloadPlan(state: ModelState, metamodel: Metamodel, relationshipId: Id, objectId: Id): Plan {
  const relationship = state.relationships.get(relationshipId);
  const object = state.objects.get(objectId);
  if (!relationship || !object) return { error: "That item was deleted meanwhile" };
  const type = metamodel.relationshipType(relationship.type);
  if (!type || type.payload === "none") return { error: `${type?.name ?? relationship.type} carries no payload` };
  if (relationship.payload.includes(objectId)) return { error: `It already carries ${object.name}` };
  return {
    label: `Carry ${object.name}`,
    edits: [
      {
        edit: "setPayload",
        id: relationship.id,
        baseVersion: relationship.version,
        payload: [...relationship.payload, objectId],
      },
    ],
  };
}

/** The flow type a new message between two object types gets: the first the rules allow, in package order. */
export function messageType(metamodel: Metamodel, sourceType: string, targetType: string) {
  return metamodel
    .allRelationshipTypes()
    .find((t) => t.semantic === "flow" && metamodel.matchingRules(t.key, sourceType, targetType).length > 0);
}

/**
 * A new message for an interaction: a request goes from initiator to responder, a response back. Its type is the
 * first flow type the rules allow for that direction.
 */
export function messagePlan(
  state: ModelState,
  metamodel: Metamodel,
  interactionId: Id,
  role: "request" | "response",
  id: Id = ulid(),
): Plan {
  const interaction = state.relationships.get(interactionId);
  if (!interaction) return { error: "That interaction was deleted meanwhile" };
  const [sourceId, targetId] =
    role === "request" ? [interaction.sourceId, interaction.targetId] : [interaction.targetId, interaction.sourceId];
  const source = state.objects.get(sourceId);
  const target = state.objects.get(targetId);
  if (!source || !target) return { error: "That interaction was deleted meanwhile" };
  const type = messageType(metamodel, source.type, target.type);
  if (!type) return { error: `No flow type lets ${source.name} send to ${target.name}` };
  return {
    label: `Add a ${role} from ${source.name} to ${target.name}`,
    edits: [{ edit: "createRelationship", id, type: type.key, sourceId, targetId, parentId: interaction.id }],
  };
}
