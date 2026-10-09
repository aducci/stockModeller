// Sub-flows (design/02-model/views-and-design-artifacts.md §12, slice DOC-2): what a connection stands for. A
// conceptual line between two systems means many more concrete flows; they are the elements its reference property
// lists, and the flows and interactions that run between the scopes of its ends at a more concrete abstraction.
import type { Metamodel, ModelState, ObjectRow, RelationshipRow } from "@connectome/engine";
import {
  SEMANTIC_ABSTRACTIONS,
  type Id,
  type PropertyKey,
  type PropertyValue,
  type SemanticAbstraction,
  type SemanticKind,
} from "@connectome/model";

/** Which kinds put an element in another's scope, followed from the whole, realiser or container, and how far. */
export interface SubFlowScope {
  kinds: SemanticKind[];
  depth: number;
}

/** Decision Q7 of the documents framework: realisation, composition and containment, three steps deep. */
export const SUB_FLOW_SCOPE: SubFlowScope = { kinds: ["realisation", "composition", "containment"], depth: 3 };

/** The kinds a connection's sub-flows can be. */
const FLOW_KINDS: ReadonlySet<SemanticKind> = new Set(["flow", "interaction"]);

export interface ImpliedFlow {
  relationship: RelationshipRow;
  /** How its ends are reached from the connection's: the scope relationships followed, source side then target. */
  via: RelationshipRow[];
}

export interface SubFlows {
  /** The elements in the connection's reference property, in order. */
  explicit: ObjectRow[];
  /** More concrete flows and interactions between the scopes of its ends. */
  implied: ImpliedFlow[];
  /** Elements the implied relationships reference that the connection neither lists nor excludes. */
  impliedElements: { object: ObjectRow; through: RelationshipRow }[];
  /** Elements left out on purpose (the exclusion property). */
  excluded: Id[];
}

export interface SubFlowOptions {
  /** An objectRef property with `many` on the connection's type, e.g. `integration.informationFlows`. */
  property?: PropertyKey;
  /** An objectRef property with `many` listing implied elements that are not part of this connection. */
  exclude?: PropertyKey;
  scope?: SubFlowScope;
}

/** The ids a reference property holds: one, many, or none. */
export function refsOf(value: PropertyValue | undefined): Id[] {
  if (typeof value === "string") return [value];
  return Array.isArray(value) ? value : [];
}

/** An element and what is in its scope, each with the relationships that reach it from the element. */
export function scopeOf(
  state: ModelState,
  metamodel: Metamodel,
  objectId: Id,
  scope: SubFlowScope = SUB_FLOW_SCOPE,
): Map<Id, RelationshipRow[]> {
  const kinds = new Set(scope.kinds);
  const reached = new Map<Id, RelationshipRow[]>([[objectId, []]]);
  let frontier = [objectId];
  for (let depth = 0; depth < scope.depth && frontier.length > 0; depth++) {
    const next: Id[] = [];
    for (const id of frontier) {
      const path = reached.get(id)!;
      for (const r of [...state.relationships.find("bySource", id), ...state.relationships.find("byTarget", id)]) {
        const type = metamodel.relationshipType(r.type);
        if (!type || !kinds.has(type.semantic)) continue;
        // Followed from the kind's source role: the whole, the realiser, the container.
        const reverse = type.semanticDirection === "reverse";
        const from = reverse ? r.targetId : r.sourceId;
        const to = reverse ? r.sourceId : r.targetId;
        if (from !== id || reached.has(to)) continue;
        reached.set(to, [...path, r]);
        next.push(to);
      }
    }
    frontier = next;
  }
  return reached;
}

const rank = (a: SemanticAbstraction | undefined) => (a ? SEMANTIC_ABSTRACTIONS.indexOf(a) : -1);

/** What a connection stands for: its listed elements, and the more concrete flows implied by its ends' scopes. */
export function subFlows(
  state: ModelState,
  metamodel: Metamodel,
  connectionId: Id,
  options: SubFlowOptions = {},
): SubFlows {
  const empty: SubFlows = { explicit: [], implied: [], impliedElements: [], excluded: [] };
  const connection = state.relationships.get(connectionId);
  if (!connection) return empty;
  const listed = options.property ? refsOf(connection.properties[options.property]) : [];
  const explicit = listed.flatMap((id) => state.objects.get(id) ?? []);
  const excluded = options.exclude ? refsOf(connection.properties[options.exclude]) : [];

  // Only a connection that says how abstract it is stands for more concrete ones.
  const level = rank(metamodel.relationshipAbstraction(connection));
  const implied: ImpliedFlow[] = [];
  if (level >= 0) {
    const scope = options.scope ?? SUB_FLOW_SCOPE;
    const sources = scopeOf(state, metamodel, connection.sourceId, scope);
    const targets = scopeOf(state, metamodel, connection.targetId, scope);
    const seen = new Set<Id>();
    for (const [sourceId, toSource] of sources)
      for (const r of state.relationships.find("bySource", sourceId)) {
        if (r.id === connection.id || r.parentId || seen.has(r.id) || !targets.has(r.targetId)) continue;
        const kind = metamodel.relationshipType(r.type)?.semantic;
        if (!kind || !FLOW_KINDS.has(kind) || rank(metamodel.relationshipAbstraction(r)) <= level) continue;
        seen.add(r.id);
        implied.push({ relationship: r, via: [...toSource, ...targets.get(r.targetId)!] });
      }
  }

  const known = new Set([...listed, ...excluded]);
  const impliedElements: SubFlows["impliedElements"] = [];
  if (options.property)
    for (const { relationship } of implied)
      for (const id of refsOf(relationship.properties[options.property])) {
        const object = state.objects.get(id);
        if (!object || known.has(id)) continue;
        known.add(id);
        impliedElements.push({ object, through: relationship });
      }
  return { explicit, implied, impliedElements, excluded };
}
