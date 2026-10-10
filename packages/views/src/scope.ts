// Structured paths (views-and-design-artifacts.md §3): the AST the query parser will produce later (decision V11).
import { ABSTRACTION_PROPERTY, type Id, type Scope, type ScopeFilter, type ScopeStep } from "@connectome/model";
import type { Metamodel, ModelState, ObjectRow, RelationshipRow } from "@connectome/engine";

/** The values of an object's property a `where` compares: a list's items, or the one value as text. */
export function propertyValues(metamodel: Metamodel, object: ObjectRow, key: string): string[] {
  const value = key === ABSTRACTION_PROPERTY ? metamodel.objectAbstraction(object) : object.properties[key];
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.map(String);
  return typeof value === "object" ? [] : [String(value)];
}

/** Whether two objects are related, either way, by a relationship of the given types or kinds (any when none). */
export function areRelated(
  state: ModelState,
  metamodel: Metamodel,
  a: Id,
  b: Id,
  by: { type?: readonly string[]; kind?: readonly string[] } = {},
): boolean {
  const hit = (r: RelationshipRow, other: Id, end: Id) => end === other && matchesRelationship(metamodel, r, by);
  return (
    state.relationships.find("bySource", a).some((r) => hit(r, b, r.targetId)) ||
    state.relationships.find("byTarget", a).some((r) => hit(r, b, r.sourceId))
  );
}

/**
 * Whether an object passes a filter. Types match their subtypes; an empty filter passes everything. `related` needs
 * the model state; without it that part of the filter is not checked.
 */
export function matchesFilter(
  metamodel: Metamodel,
  object: ObjectRow,
  filter: ScopeFilter | undefined,
  state?: ModelState,
): boolean {
  if (!filter) return true;
  if (filter.type?.length && !filter.type.some((t) => metamodel.isA(object.type, t))) return false;
  if (filter.category?.length) {
    const category = metamodel.objectType(object.type)?.category;
    if (!category || !filter.category.includes(category)) return false;
  }
  if (filter.folder && object.folderId !== filter.folder) return false;
  for (const [key, { in: wanted }] of Object.entries(filter.where ?? {})) {
    if (!propertyValues(metamodel, object, key).some((v) => wanted.includes(v))) return false;
  }
  if (filter.related && state) {
    const { id, types, kinds } = filter.related;
    if (object.id === id || !areRelated(state, metamodel, object.id, id, { type: types, kind: kinds })) return false;
  }
  return true;
}

/** Whether a relationship is one a step (or a matrix) follows: by type, by kind, or any when neither is given. */
export function matchesRelationship(
  metamodel: Metamodel,
  relationship: RelationshipRow,
  by: { type?: readonly string[]; kind?: readonly string[] },
): boolean {
  const byType = by.type?.length ? by.type.includes(relationship.type) : false;
  const kind = metamodel.relationshipType(relationship.type)?.semantic;
  const byKind = by.kind?.length && kind ? by.kind.includes(kind) : false;
  if (!by.type?.length && !by.kind?.length) return true;
  return byType || byKind;
}

function follow(state: ModelState, metamodel: Metamodel, from: readonly ObjectRow[], step: ScopeStep): ObjectRow[] {
  const reached = new Map<Id, ObjectRow>();
  const by = { type: step.type, kind: step.kind };
  for (const object of from) {
    const out = step.dir === "in" ? [] : state.relationships.find("bySource", object.id);
    const inc = step.dir === "out" ? [] : state.relationships.find("byTarget", object.id);
    for (const r of out) {
      if (!matchesRelationship(metamodel, r, by)) continue;
      const target = state.objects.get(r.targetId);
      if (target && matchesFilter(metamodel, target, step.to, state)) reached.set(target.id, target);
    }
    for (const r of inc) {
      if (!matchesRelationship(metamodel, r, by)) continue;
      const source = state.objects.get(r.sourceId);
      if (source && matchesFilter(metamodel, source, step.to, state)) reached.set(source.id, source);
    }
  }
  return [...reached.values()];
}

/** Orders objects the way the explorer does (`rank`, then name) or by name. */
export function orderObjects(objects: ObjectRow[], order: Scope["order"] = "name"): ObjectRow[] {
  const byName = (a: ObjectRow, b: ObjectRow) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  if (order === "name") return [...objects].sort(byName);
  return [...objects].sort((a, b) => {
    if (a.rank && b.rank) return a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : byName(a, b);
    if (a.rank) return -1;
    if (b.rank) return 1;
    return byName(a, b);
  });
}

/** The objects a scope selects, ordered. Without steps, every live object passing `from`. */
export function evaluateScope(state: ModelState, metamodel: Metamodel, scope: Scope): ObjectRow[] {
  let current = [...state.objects.live()].filter((o) => matchesFilter(metamodel, o, scope.from, state));
  for (const step of scope.steps ?? []) current = follow(state, metamodel, current, step);
  return orderObjects(current, scope.order);
}
