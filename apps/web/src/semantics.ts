// What the semantic kinds mean for the workbench (design/02-model/semantics.md §9.1). Pure, so it is unit-tested.
import type { Metamodel, ModelState, RelationshipRow } from "@connectome/engine";
import { SEMANTIC_KINDS, type Id, type SemanticKind } from "@connectome/model";

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
  for (const r of state.relationships.find("bySource", objectId)) add(r, "source");
  for (const r of state.relationships.find("byTarget", objectId)) add(r, "target");

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
