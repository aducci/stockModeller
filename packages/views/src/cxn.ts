// The CXN Builder (views-and-design-artifacts.md §15): two panes of objects, each a scope, and one connection type
// (a relationship type or a link kind) to link the left pane's selection with the right pane's, in bulk.
import {
  ABSTRACTION_PROPERTY,
  ulid,
  type CxnDefinition,
  type CxnPane,
  type DiagramType,
  type Edit,
  type Id,
  type LinkKind,
  type Scope,
  type TypeKey,
} from "@connectome/model";
import type { Metamodel, ModelState, ObjectRow, ResolvedRelationshipType } from "@connectome/engine";
import { evaluateScope, orderObjects, propertyValues } from "./scope";
import { EMPTY_MATRIX } from "./matrix";

export type Side = "left" | "right";
export const otherSide = (side: Side): Side => (side === "left" ? "right" : "left");

/** A CXN Builder's definition: the diagram's own keys over its type's `matrix`, over an empty one. */
export function cxnDefinition(type: DiagramType | undefined, own: Record<string, unknown> | undefined): CxnDefinition {
  return { ...EMPTY_MATRIX, ...type?.matrix, ...own } as CxnDefinition;
}

/** A pane's scope: the left pane is the matrix's rows, the right its columns. */
export const paneScope = (definition: CxnDefinition, side: Side): Scope =>
  side === "left" ? definition.rows : definition.columns;
export const paneOf = (definition: CxnDefinition, side: Side): CxnPane => definition.panes?.[side] ?? {};

/** What the builder links with. */
export type Connection =
  | { kind: "relationship"; key: TypeKey; type: ResolvedRelationshipType }
  | { kind: "link"; key: string; linkKind: LinkKind };

export function connectionOf(metamodel: Metamodel, definition: CxnDefinition): Connection | undefined {
  if (definition.link) {
    const linkKind = metamodel.linkKind(definition.link);
    return linkKind && { kind: "link", key: linkKind.key, linkKind };
  }
  const key = definition.create ?? definition.relationships.types?.[0];
  const type = key ? metamodel.relationshipType(key) : undefined;
  return type && { kind: "relationship", key: type.key, type };
}

/** The keys a definition stores for a connection (`create` and the cell types, or `link`). */
export function connectionKeys(connection: Connection): Record<string, unknown> {
  return connection.kind === "link"
    ? { link: connection.key, create: null, relationships: { dir: "rowToColumn" } }
    : { link: null, create: connection.key, relationships: { types: [connection.key], dir: "rowToColumn" } };
}

/** One entry of the connection picker. `value` is `type:<key>` or `link:<key>`. */
export interface ConnectionOption {
  value: string;
  name: string;
  kind: "relationship" | "link";
  /** Why the rules refuse it between the two panes' types; null when allowed. */
  refused: string | null;
  /** How many relationships of the type exist, to put the most used first. */
  uses: number;
}

const paneTypes = (definition: CxnDefinition, side: Side): TypeKey[] => paneScope(definition, side).from.type ?? [];

/**
 * The connection types for the two panes: relationship types the rules allow between their types (either way),
 * most used first, then the refused ones with the reason, then the link kinds that link elements (any to any).
 */
export function connectionOptions(state: ModelState, metamodel: Metamodel, definition: CxnDefinition) {
  const left = paneTypes(definition, "left");
  const right = paneTypes(definition, "right");
  const uses = new Map<TypeKey, number>();
  for (const r of state.relationships.live()) uses.set(r.type, (uses.get(r.type) ?? 0) + 1);
  const typeName = (keys: TypeKey[]) =>
    keys.length ? keys.map((k) => metamodel.objectType(k)?.definition.name ?? k).join(" or ") : "anything";
  const relationships: ConnectionOption[] = metamodel.allRelationshipTypes().map((t) => {
    // A pane with no type takes anything: then it is enough that the rules allow the type at all.
    const allowed =
      !left.length || !right.length
        ? metamodel
            .allObjectTypes()
            .some((a) =>
              metamodel
                .allObjectTypes()
                .some(
                  (b) =>
                    (!left.length || left.some((l) => metamodel.isA(a.definition.key, l))) &&
                    (!right.length || right.some((r) => metamodel.isA(b.definition.key, r))) &&
                    (metamodel.matchingRules(t.key, a.definition.key, b.definition.key).length > 0 ||
                      metamodel.matchingRules(t.key, b.definition.key, a.definition.key).length > 0),
                ),
            )
        : left.some((l) =>
            right.some(
              (r) => metamodel.matchingRules(t.key, l, r).length > 0 || metamodel.matchingRules(t.key, r, l).length > 0,
            ),
          );
    return {
      value: `type:${t.key}`,
      name: t.name,
      kind: "relationship",
      refused: allowed ? null : `No rule allows ${t.name} between ${typeName(left)} and ${typeName(right)}`,
      uses: uses.get(t.key) ?? 0,
    };
  });
  relationships.sort(
    (a, b) => Number(!!a.refused) - Number(!!b.refused) || b.uses - a.uses || a.name.localeCompare(b.name),
  );
  const links: ConnectionOption[] = metamodel
    .allLinkKinds()
    .filter((k) => k.targets.includes("element"))
    .map((k) => ({ value: `link:${k.key}`, name: `${k.name} (link)`, kind: "link", refused: null, uses: 0 }));
  return [...relationships, ...links];
}

/** The relationships or links of the connection between two objects, either way. */
export function connectionsBetween(
  state: ModelState,
  connection: Connection,
  a: Id,
  b: Id,
): { id: Id; kind: "relationship" | "link"; version: number }[] {
  if (connection.kind === "link") {
    const hit = (from: Id, to: Id) =>
      state.links
        .find("bySource", from)
        .filter((l) => l.kind === connection.key && "objectId" in l.target && l.target.objectId === to);
    return [...hit(a, b), ...hit(b, a)].map((l) => ({ id: l.id, kind: "link" as const, version: 0 }));
  }
  const rel = (from: Id, to: Id) =>
    state.relationships.find("bySource", from).filter((r) => r.type === connection.key && r.targetId === to);
  return [...rel(a, b), ...(a === b ? [] : rel(b, a))].map((r) => ({
    id: r.id,
    kind: "relationship" as const,
    version: r.version,
  }));
}

export interface PaneRow {
  object: ObjectRow;
  depth: number;
  /** A container shown only to hold members under it: not a member, cannot be selected. */
  heading: boolean;
  /** Connections of the chosen type to members of the other pane. */
  count: number;
  /** Connected to all, some or none of the other pane's selection (none when nothing is selected there). */
  tick: "all" | "some" | null;
}

export interface PaneModel {
  /** The scope's objects, before *Hide connected*. */
  members: ObjectRow[];
  rows: PaneRow[];
  /** How many members *Hide connected* hides. */
  hidden: number;
}

export interface CxnModel {
  definition: CxnDefinition;
  connection: Connection | undefined;
  left: PaneModel;
  right: PaneModel;
  /** Every connected pair between the two panes' members, left first. */
  existing: [Id, Id][];
}

/** The object holding this one by containment (semantics §7), if any. */
function containerOf(state: ModelState, metamodel: Metamodel, id: Id): Id | undefined {
  return state.relationships
    .find("byTarget", id)
    .find((r) => metamodel.relationshipType(r.type)?.semantic === "containment" && r.sourceId !== id)?.sourceId;
}

/** A pane's rows: a flat list, or a tree by containment with a heading for a container that is not a member. */
function shape(
  state: ModelState,
  metamodel: Metamodel,
  objects: ObjectRow[],
  pane: CxnPane,
): { object: ObjectRow; depth: number; heading: boolean }[] {
  if (pane.shape === "list") return objects.map((object) => ({ object, depth: 0, heading: false }));
  const ids = new Set(objects.map((o) => o.id));
  const parent = new Map<Id, Id>();
  for (const o of objects) {
    const c = containerOf(state, metamodel, o.id);
    if (c) parent.set(o.id, c);
  }
  const children = new Map<Id, ObjectRow[]>();
  for (const o of objects) {
    const p = parent.get(o.id);
    if (p) children.set(p, [...(children.get(p) ?? []), o]);
  }
  const out: { object: ObjectRow; depth: number; heading: boolean }[] = [];
  const seen = new Set<Id>();
  const visit = (o: ObjectRow, depth: number) => {
    if (seen.has(o.id)) return;
    seen.add(o.id);
    out.push({ object: o, depth, heading: false });
    for (const k of children.get(o.id) ?? []) visit(k, depth + 1);
  };
  const headings = new Set<Id>();
  for (const o of objects) {
    const p = parent.get(o.id);
    if (!p) visit(o, 0);
    else if (!ids.has(p) && !headings.has(p)) {
      // Members whose container is filtered out still show, under it.
      headings.add(p);
      const container = state.objects.get(p);
      if (container) out.push({ object: container, depth: 0, heading: true });
      for (const k of children.get(p) ?? []) visit(k, container ? 1 : 0);
    }
  }
  return out;
}

/**
 * Projects a CXN Builder: each pane's members (by scope), its rows (after *Hide connected*, shaped and sorted), the
 * count of connections from each row into the other pane and the ticks against the other pane's selection.
 */
export function projectCxn(
  state: ModelState,
  metamodel: Metamodel,
  definition: CxnDefinition,
  selection: { left: ReadonlySet<Id>; right: ReadonlySet<Id> } = { left: new Set(), right: new Set() },
): CxnModel {
  const connection = connectionOf(metamodel, definition);
  const members = {
    left: orderObjects(evaluateScope(state, metamodel, definition.rows), paneOf(definition, "left").sort ?? "name"),
    right: orderObjects(
      evaluateScope(state, metamodel, definition.columns),
      paneOf(definition, "right").sort ?? "name",
    ),
  };
  const linkedTo = new Map<Id, Set<Id>>();
  const existing: [Id, Id][] = [];
  if (connection) {
    for (const l of members.left) {
      for (const r of members.right) {
        if (l.id === r.id) continue;
        if (connectionsBetween(state, connection, l.id, r.id).length === 0) continue;
        existing.push([l.id, r.id]);
        linkedTo.set(l.id, (linkedTo.get(l.id) ?? new Set()).add(r.id));
        linkedTo.set(r.id, (linkedTo.get(r.id) ?? new Set()).add(l.id));
      }
    }
  }
  const pane = (side: Side): PaneModel => {
    const settings = paneOf(definition, side);
    const others = selection[otherSide(side)];
    const visible = settings.hideConnected ? members[side].filter((o) => !linkedTo.get(o.id)?.size) : members[side];
    // The other pane's selection may hold objects outside this pane's members' pairs: check those directly.
    const isConnected = (a: Id, b: Id) =>
      linkedTo.get(a)?.has(b) || (connection ? connectionsBetween(state, connection, a, b).length > 0 : false);
    const row = (r: { object: ObjectRow; depth: number; heading: boolean }): PaneRow => {
      const mine = linkedTo.get(r.object.id);
      const ticked = connection && !r.heading ? [...others].filter((o) => isConnected(r.object.id, o)).length : 0;
      return {
        ...r,
        count: r.heading ? 0 : (mine?.size ?? 0),
        tick: ticked === 0 ? null : ticked === others.size ? "all" : "some",
      };
    };
    return {
      members: members[side],
      rows: shape(state, metamodel, visible, settings).map(row),
      hidden: members[side].length - visible.length,
    };
  };
  return { definition, connection, left: pane("left"), right: pane("right"), existing };
}

/** One connection to make, already turned the way the rules allow. */
export interface PlannedPair {
  sourceId: Id;
  targetId: Id;
}

export interface LinkPlan {
  add: PlannedPair[];
  /** Pairs already connected, skipped (or what *Unlink* removes). */
  have: [Id, Id][];
  refused: { pair: [Id, Id]; reason: string }[];
}

/**
 * What linking every left id with every right id would do: the pairs to create (left to right, or right to left for
 * a relationship type the rules allow only that way, decision C5), those already connected and those refused.
 */
export function planConnect(
  state: ModelState,
  metamodel: Metamodel,
  connection: Connection,
  leftIds: Iterable<Id>,
  rightIds: Iterable<Id>,
): LinkPlan {
  const plan: LinkPlan = { add: [], have: [], refused: [] };
  const rights = [...rightIds];
  const allowed = (r: ResolvedRelationshipType, a: ObjectRow, b: ObjectRow) =>
    metamodel.matchingRules(r.key, a.type, b.type).length > 0;
  for (const a of leftIds) {
    for (const b of rights) {
      if (a === b) continue;
      const left = state.objects.get(a);
      const right = state.objects.get(b);
      if (!left || !right) continue;
      if (connectionsBetween(state, connection, a, b).length) {
        plan.have.push([a, b]);
        continue;
      }
      if (connection.kind === "link") {
        plan.add.push({ sourceId: a, targetId: b });
        continue;
      }
      if (allowed(connection.type, left, right)) plan.add.push({ sourceId: a, targetId: b });
      else if (allowed(connection.type, right, left)) plan.add.push({ sourceId: b, targetId: a });
      else {
        const name = (o: ObjectRow) => metamodel.objectType(o.type)?.definition.name ?? o.type;
        plan.refused.push({
          pair: [a, b],
          reason: `No rule allows ${connection.type.name} between ${name(left)} and ${name(right)}`,
        });
      }
    }
  }
  return plan;
}

/** The edits that make a plan's new connections, as one change. */
export function connectEdits(connection: Connection, pairs: PlannedPair[]): Edit[] {
  return pairs.map((p): Edit =>
    connection.kind === "link"
      ? { edit: "createLink", id: ulid(), sourceId: p.sourceId, kind: connection.key, target: { objectId: p.targetId } }
      : { edit: "createRelationship", id: ulid(), type: connection.key, sourceId: p.sourceId, targetId: p.targetId },
  );
}

/** The edits that remove every connection of the type between the pairs, as one change. */
export function disconnectEdits(state: ModelState, connection: Connection, pairs: [Id, Id][]): Edit[] {
  const seen = new Set<Id>();
  const edits: Edit[] = [];
  for (const [a, b] of pairs) {
    for (const c of connectionsBetween(state, connection, a, b)) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      edits.push(
        c.kind === "link"
          ? { edit: "deleteLink", id: c.id }
          : { edit: "deleteRelationship", id: c.id, baseVersion: c.version },
      );
    }
  }
  return edits;
}

/** A property a pane can be filtered by, with how many of its members carry each value. */
export interface Facet {
  key: string;
  name: string;
  values: { key: string; label: string; count: number }[];
}

/**
 * The list properties the pane's objects carry (and their abstraction), with a count per value among `members`.
 * Values no member has are left out, and so are properties with no counted value.
 */
export function facets(metamodel: Metamodel, members: readonly ObjectRow[]): Facet[] {
  const keys = new Set<string>([ABSTRACTION_PROPERTY]);
  for (const t of new Set(members.map((o) => o.type))) {
    for (const p of metamodel.objectType(t)?.properties ?? []) keys.add(p);
  }
  const out: Facet[] = [];
  for (const key of keys) {
    const pt = metamodel.propertyType(key);
    const list = pt?.valueList ? metamodel.valueList(pt.valueList) : undefined;
    if (!pt || !list) continue;
    const counts = new Map<string, number>();
    for (const o of members) for (const v of propertyValues(metamodel, o, key)) counts.set(v, (counts.get(v) ?? 0) + 1);
    const values = list.values
      .map((v) => ({ key: v.key, label: v.label, count: counts.get(v.key) ?? 0 }))
      .filter((v) => v.count > 0);
    if (values.length) out.push({ key, name: pt.name, values });
  }
  return out;
}
