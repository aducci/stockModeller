// Explorer order and drag and drop (design/04-ux/workbench.md, "Drag and drop in the explorer"; decisions B21, B22).
// Pure: what the tree shows in which order, and which edits a drop makes. The explorer only renders and routes events.
import type { Metamodel, ModelState, ResolvedRelationshipType } from "@connectome/engine";
import { ulid, type Edit, type Id } from "@connectome/model";
import type { Selection as Item } from "./state/workbench";
import { containerOf, containPlan, contentsOf, moveToFolderPlan, type Plan } from "./semantics";
import { byName } from "./text";

export type { Plan };
export type Position = "before" | "after" | "into";
export type Parent = { kind: "root" } | { kind: "folder"; id: Id } | { kind: "object"; id: Id };

/** An item as the tree orders it. */
export interface Placed {
  kind: Item["kind"];
  id: Id;
  name: string;
  rank?: string;
}

/** Ranked items first, by rank; then unranked ones: folders, diagrams, objects, each by name. */
export function byRank(a: Placed, b: Placed): number {
  if (a.rank !== undefined && b.rank !== undefined) {
    if (a.rank !== b.rank) return a.rank < b.rank ? -1 : 1;
    return byName(a, b);
  }
  if (a.rank !== undefined) return -1;
  if (b.rank !== undefined) return 1;
  const order = { folder: 0, diagram: 1, object: 2 };
  return order[a.kind] - order[b.kind] || byName(a, b);
}

const placed = (kind: Item["kind"], row: { id: Id; name: string; rank?: string }): Placed => ({
  kind,
  id: row.id,
  name: row.name,
  ...(row.rank !== undefined ? { rank: row.rank } : {}),
});

/** What the tree shows under a parent, in order: a folder's subfolders, diagrams and root objects, or an object's contents. */
export function childrenOf(state: ModelState, metamodel: Metamodel, parent: Parent): Placed[] {
  if (parent.kind === "root")
    return state.folders
      .find("byParent", "")
      .map((f) => placed("folder", f))
      .sort(byRank);
  if (parent.kind === "object")
    return contentsOf(state, metamodel, parent.id)
      .map((o) => placed("object", o))
      .sort(byRank);
  return [
    ...state.folders.find("byParent", parent.id).map((f) => placed("folder", f)),
    ...state.diagrams.find("byFolder", parent.id).map((d) => placed("diagram", d)),
    ...state.objects
      .find("byFolder", parent.id)
      .filter((o) => !containerOf(state, metamodel, o.id))
      .map((o) => placed("object", o)),
  ].sort(byRank);
}

/** Where an item sits in the tree: its folder, its container, or the top level. */
export function parentOf(state: ModelState, metamodel: Metamodel, item: Item): Parent | undefined {
  if (item.kind === "folder") {
    const folder = state.folders.get(item.id);
    if (!folder) return undefined;
    return folder.parentId ? { kind: "folder", id: folder.parentId } : { kind: "root" };
  }
  if (item.kind === "diagram") {
    const diagram = state.diagrams.get(item.id);
    return diagram && { kind: "folder", id: diagram.folderId };
  }
  const object = state.objects.get(item.id);
  if (!object) return undefined;
  const container = containerOf(state, metamodel, object.id);
  return container ? { kind: "object", id: container.sourceId } : { kind: "folder", id: object.folderId };
}

const sameParent = (a: Parent | undefined, b: Parent) =>
  a?.kind === b.kind && (a.kind === "root" || a.id === (b as { id: Id }).id);

/** True when `item` is `ancestor` or sits anywhere below it in the tree. */
export function isWithin(state: ModelState, metamodel: Metamodel, item: Item, ancestor: Item): boolean {
  const seen = new Set<Id>();
  for (let at: Item | undefined = item; at && !seen.has(at.id);) {
    if (at.id === ancestor.id) return true;
    seen.add(at.id);
    const parent = parentOf(state, metamodel, at);
    at = parent && parent.kind !== "root" ? parent : undefined;
  }
  return false;
}

// ------------------------------------------------------------------ fractional ranks

const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** A key strictly between `a` and `b` (`""` is the lowest, `null` the highest). Keys never end in "0". */
function midpoint(a: string, b: string | null): string {
  if (b !== null) {
    let n = 0;
    while ((a[n] ?? "0") === b[n]) n++;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
  }
  const low = a ? DIGITS.indexOf(a[0]!) : 0;
  const high = b !== null ? DIGITS.indexOf(b[0]!) : DIGITS.length;
  if (high - low > 1) return DIGITS[Math.round((low + high) / 2)]!;
  if (b !== null && b.length > 1) return b.slice(0, 1);
  return DIGITS[low]! + midpoint(a.slice(1), null);
}

/** A rank between two neighbours; either may be missing (the start or the end of the list). */
export function rankBetween(before: string | undefined, after: string | undefined): string {
  if (before !== undefined && after !== undefined && before >= after) throw new Error(`${before} ≥ ${after}`);
  return midpoint(before ?? "", after ?? null);
}

const setRank = (item: Placed, rank: string): Edit => ({ edit: "setRank", item: item.kind, id: item.id, rank });

/**
 * The setRank edits that put `moved` at `index` among `siblings` (which leave `moved` out). Only the moved items get
 * new ranks when their neighbours are ranked; unranked siblings before the drop point are ranked first, in the order
 * they show, so the list looks the same to everyone afterwards (B21).
 */
export function rankEdits(siblings: Placed[], index: number, moved: Placed[]): Edit[] {
  const prefix = siblings.slice(0, index);
  const next = siblings[index]?.rank;
  const lastRanked = [...prefix].reverse().find((s) => s.rank !== undefined)?.rank;
  if (lastRanked !== undefined && next !== undefined && lastRanked >= next) {
    // Two siblings share a rank (concurrent drops): rank the whole list afresh.
    const order = [...prefix, ...moved, ...siblings.slice(index)];
    let at: string | undefined;
    return order.map((item) => setRank(item, (at = rankBetween(at, undefined))));
  }
  const edits: Edit[] = [];
  let at: string | undefined;
  for (const item of prefix) {
    if (item.rank !== undefined) at = item.rank;
    else edits.push(setRank(item, (at = rankBetween(at, undefined))));
  }
  for (const item of moved) edits.push(setRank(item, (at = rankBetween(at, next))));
  return edits;
}

// ------------------------------------------------------------------ drops

export interface Drag {
  items: Item[];
  /** Set when a group member's reference row (↗) is dragged: the `groups` relationship it came through. */
  memberOf?: Id;
}

export const isGroup = (state: ModelState, metamodel: Metamodel, id: Id) => {
  const object = state.objects.get(id);
  return !!object && metamodel.isA(object.type, "group");
};

const nameOf = (state: ModelState, item: Item) =>
  (item.kind === "folder"
    ? state.folders.get(item.id)
    : item.kind === "object"
      ? state.objects.get(item.id)
      : state.diagrams.get(item.id)
  )?.name ?? item.id;

/** Where a drop at a vertical offset lands on a row: its top and bottom quarters place, the middle drops into it. */
export function dropPosition(offsetY: number, height: number, canHold: boolean): Position {
  const at = offsetY / Math.max(height, 1);
  if (!canHold) return at < 0.5 ? "before" : "after";
  return at < 0.25 ? "before" : at > 0.75 ? "after" : "into";
}

/** The members of a group, by name (references: they live in their own folders). */
export function groupMembers(state: ModelState, groupId: Id) {
  return state.relationships
    .find("bySource", groupId)
    .filter((r) => r.type === "groups")
    .flatMap((r) => {
      const member = state.objects.get(r.targetId);
      return member ? [{ relationship: r, member }] : [];
    })
    .sort((a, b) => byName(a.member, b.member));
}

/** Groups first, then the rest: adding objects to a group (drop, menu or "Group selection"). */
export function addToGroupPlan(state: ModelState, groupId: Id, objectIds: Id[], fromRelationship?: Id): Plan {
  const group = state.objects.get(groupId);
  if (!group) return { error: "That group was deleted meanwhile" };
  const members = new Set(groupMembers(state, groupId).map((m) => m.member.id));
  const adding = objectIds.filter((id) => id !== groupId && !members.has(id) && state.objects.get(id));
  if (adding.length === 0) {
    const only = objectIds.length === 1 ? state.objects.get(objectIds[0]!)?.name : undefined;
    return {
      error: objectIds.includes(groupId)
        ? `${group.name} cannot be in itself`
        : only
          ? `${only} is already in ${group.name}`
          : `They are already in ${group.name}`,
    };
  }
  const old = fromRelationship ? state.relationships.get(fromRelationship) : undefined;
  const first = state.objects.get(adding[0]!)!.name;
  const what = adding.length === 1 ? first : `${adding.length} objects`;
  const from = old && state.objects.get(old.sourceId);
  return {
    label: from ? `Move ${what} from ${from.name} to ${group.name}` : `Add ${what} to ${group.name}`,
    edits: [
      ...(old ? [{ edit: "deleteRelationship" as const, id: old.id, baseVersion: old.version }] : []),
      ...adding.map((id): Edit => ({
        edit: "createRelationship",
        id: ulid(),
        type: "groups",
        sourceId: groupId,
        targetId: id,
      })),
    ],
  };
}

export function removeFromGroupPlan(state: ModelState, relationshipId: Id): Plan {
  const rel = state.relationships.get(relationshipId);
  const group = rel && state.objects.get(rel.sourceId);
  const member = rel && state.objects.get(rel.targetId);
  if (!rel || !group || !member) return { error: "It was removed meanwhile" };
  return {
    label: `Remove ${member.name} from ${group.name}`,
    edits: [{ edit: "deleteRelationship", id: rel.id, baseVersion: rel.version }],
  };
}

/**
 * The edits a drop makes, or why it is refused. Moving into a folder or a container and placing among siblings
 * happen in one change, so one Undo reverts the whole drop.
 */
export function dropPlan(state: ModelState, metamodel: Metamodel, drag: Drag, target: Item, position: Position): Plan {
  if (position === "into" && target.kind === "object" && isGroup(state, metamodel, target.id)) {
    if (drag.items.some((i) => i.kind !== "object")) return { error: "Only objects can be grouped" };
    return addToGroupPlan(
      state,
      target.id,
      drag.items.map((i) => i.id),
      drag.memberOf,
    );
  }
  if (drag.memberOf) return { error: "Drop it on a group to move it there, or on a diagram to show it" };

  // Drop the items that sit inside another dragged item: they move with it.
  const items = drag.items.filter(
    (i) => !drag.items.some((other) => other.id !== i.id && isWithin(state, metamodel, i, other)),
  );
  if (items.some((i) => isWithin(state, metamodel, target, i))) {
    const name = nameOf(
      state,
      items.find((i) => isWithin(state, metamodel, target, i))!,
    );
    return { error: target.id === items[0]?.id ? `${name} is already here` : `${name} cannot go inside itself` };
  }

  const parent: Parent | undefined =
    position === "into"
      ? target.kind === "diagram"
        ? undefined
        : target.kind === "folder"
          ? { kind: "folder", id: target.id }
          : { kind: "object", id: target.id }
      : parentOf(state, metamodel, target);
  if (!parent) return { error: "A diagram cannot hold anything" };
  const parentName = parent.kind === "root" ? "the top level" : nameOf(state, parent);
  if (parent.kind === "root" && items.some((i) => i.kind !== "folder"))
    return { error: "Only folders sit at the top level" };
  if (parent.kind === "object" && items.some((i) => i.kind !== "object"))
    return { error: `Only objects can go inside ${parentName}` };

  const edits: Edit[] = [];
  let label: string | undefined;
  for (const item of items) {
    const was = parentOf(state, metamodel, item);
    if (sameParent(was, parent)) continue;
    if (item.kind === "folder") {
      const folder = state.folders.get(item.id)!;
      const parentId = parent.kind === "folder" ? parent.id : null;
      const clash = state.folders.find("byParent", parentId ?? "").find((f) => f.name === folder.name);
      if (clash) return { error: `A folder named "${folder.name}" is already in ${parentName}` };
      edits.push({ edit: "moveFolder", id: folder.id, parentId });
    } else if (item.kind === "diagram") {
      const diagram = state.diagrams.get(item.id)!;
      const folderId = (parent as { id: Id }).id;
      edits.push({ edit: "updateDiagram", id: diagram.id, baseVersion: diagram.version, set: { folderId } });
    } else {
      const plan =
        parent.kind === "folder"
          ? moveToFolderPlan(state, metamodel, item.id, parent.id)
          : containPlan(state, metamodel, item.id, (parent as { id: Id }).id);
      if ("error" in plan) return plan;
      label ??= plan.label;
      edits.push(...plan.edits);
    }
  }

  const movedIds = new Set(items.map((i) => i.id));
  const siblings = childrenOf(state, metamodel, parent).filter((s) => !movedIds.has(s.id));
  const at = siblings.findIndex((s) => s.id === target.id);
  const index = position === "into" || at < 0 ? siblings.length : position === "before" ? at : at + 1;
  const moved = items.map((i) => {
    const row =
      i.kind === "folder"
        ? state.folders.get(i.id)
        : i.kind === "object"
          ? state.objects.get(i.id)
          : state.diagrams.get(i.id);
    return placed(i.kind, row!);
  });
  // A drop that changes nothing (onto its own place) makes no change.
  const before = childrenOf(state, metamodel, parent).map((s) => s.id);
  const after = [...siblings.slice(0, index), ...moved, ...siblings.slice(index)].map((s) => s.id);
  if (edits.length === 0 && before.join() === after.join()) return { error: "It is already there" };
  edits.push(...rankEdits(siblings, index, moved));

  const what = items.length === 1 ? nameOf(state, items[0]!) : `${items.length} items`;
  const moving = edits.some((e) => e.edit !== "setRank");
  return {
    label: items.length === 1 && label ? label : moving ? `Move ${what} to ${parentName}` : `Reorder ${what}`,
    edits,
  };
}

// ------------------------------------------------------------------ Alt+drop: choose the relationship type

export interface TypeChoices {
  /** Containment types the rules allow for the pair: the object moves inside. */
  contain: ResolvedRelationshipType[];
  /** Composition and aggregation types: linked as a part, nothing moves. */
  part: ResolvedRelationshipType[];
}

export function typeChoices(state: ModelState, metamodel: Metamodel, childId: Id, parentId: Id): TypeChoices {
  const child = state.objects.get(childId);
  const parent = state.objects.get(parentId);
  if (!child || !parent || child.id === parent.id) return { contain: [], part: [] };
  const allowed = metamodel
    .allRelationshipTypes()
    .filter((t) => metamodel.matchingRules(t.key, parent.type, child.type).length > 0);
  return {
    contain: allowed.filter((t) => t.semantic === "containment"),
    part: allowed.filter((t) => t.semantic === "composition" || t.semantic === "aggregation"),
  };
}

/** Contain with a chosen type: the same relationship is reconnected when its type stays, otherwise replaced. */
export function containAsPlan(state: ModelState, metamodel: Metamodel, childId: Id, parentId: Id, type: string): Plan {
  const child = state.objects.get(childId);
  const parent = state.objects.get(parentId);
  if (!child || !parent) return { error: "That object was deleted meanwhile" };
  if (isWithin(state, metamodel, { kind: "object", id: parentId }, { kind: "object", id: childId }))
    return { error: `${child.name} cannot go inside itself` };
  const current = containerOf(state, metamodel, child.id);
  const verb = metamodel.relationshipType(type)?.name ?? type;
  const label = `Put ${child.name} in ${parent.name} (${verb})`;
  if (current?.sourceId === parent.id && current.type === type)
    return { error: `${child.name} is already in ${parent.name}` };
  if (current && current.type === type)
    return {
      label,
      edits: [{ edit: "reconnectRelationship", id: current.id, baseVersion: current.version, sourceId: parent.id }],
    };
  return {
    label,
    edits: [
      ...(current ? [{ edit: "deleteRelationship" as const, id: current.id, baseVersion: current.version }] : []),
      { edit: "createRelationship", id: ulid(), type, sourceId: parent.id, targetId: child.id },
    ],
  };
}

/** Link as a part (composition or aggregation): nothing moves. */
export function partPlan(state: ModelState, metamodel: Metamodel, childId: Id, parentId: Id, type: string): Plan {
  const child = state.objects.get(childId);
  const parent = state.objects.get(parentId);
  if (!child || !parent) return { error: "That object was deleted meanwhile" };
  const t = metamodel.relationshipType(type);
  return {
    label: `${parent.name} ${t?.verb ?? type} ${child.name}`,
    edits: [{ edit: "createRelationship", id: ulid(), type, sourceId: parent.id, targetId: child.id }],
  };
}
