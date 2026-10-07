// How the model uses the relationship rules (design/02-model/notation-and-metamodel-admin.md §10): which
// combinations of relationship type, source type and target type occur, and what a new set of rules would refuse.
import type { TypeKey } from "@connectome/model";
import type { Metamodel } from "./metamodel";
import type { ModelState } from "./state";

export interface Combination {
  relationshipType: TypeKey;
  sourceType: TypeKey;
  targetType: TypeKey;
  /** Live relationships with this combination. */
  count: number;
}

/** Every combination the live relationships use, most used first. */
export function relationshipCombinations(state: ModelState): Combination[] {
  const counts = new Map<string, Combination>();
  for (const r of state.relationships.live()) {
    const source = state.objects.get(r.sourceId);
    const target = state.objects.get(r.targetId);
    if (!source || !target) continue;
    const key = `${r.type}|${source.type}|${target.type}`;
    const known = counts.get(key);
    if (known) known.count++;
    else counts.set(key, { relationshipType: r.type, sourceType: source.type, targetType: target.type, count: 1 });
  }
  return [...counts.values()].sort(
    (a, b) =>
      b.count - a.count ||
      a.relationshipType.localeCompare(b.relationshipType) ||
      a.sourceType.localeCompare(b.sourceType) ||
      a.targetType.localeCompare(b.targetType),
  );
}

const allows = (metamodel: Metamodel, c: Combination) =>
  metamodel.matchingRules(c.relationshipType, c.sourceType, c.targetType).length > 0;

/** Combinations in use that no rule allows. */
export function unallowedCombinations(state: ModelState, metamodel: Metamodel): Combination[] {
  return relationshipCombinations(state).filter((c) => !allows(metamodel, c));
}

/** Combinations in use that `before` allows and `after` would not: what publishing `after` leaves flagged. */
export function newlyRefused(state: ModelState, before: Metamodel, after: Metamodel): Combination[] {
  return relationshipCombinations(state).filter((c) => allows(before, c) && !allows(after, c));
}
