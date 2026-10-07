// Metamodel administration (design/02-model/notation-and-metamodel-admin.md §10): the connection matrix, rule
// sentences and "try a connection" over a draft of the relationship rules. Pure, so it can be tested on its own.
import {
  Metamodel,
  MetamodelError,
  relationshipCombinations,
  type Combination,
  type ModelState,
  type RepositorySnapshot,
  type ResolvedObjectType,
  type ResolvedRelationshipType,
} from "@connectome/engine";
import type { MetamodelPackage, SemanticKind, TypeKey } from "@connectome/model";

export type Rule = NonNullable<MetamodelPackage["relationshipRules"]>[number];
export type Enforcement = "block" | "warn";

export const ruleKey = (r: Pick<Rule, "relationshipType" | "sourceType" | "targetType">) =>
  `${r.relationshipType}:${r.sourceType}->${r.targetType}`;

export const enforcementOf = (r: Rule): Enforcement => r.enforcement ?? "block";

/** The draft compiled with the repository's types, or the problems that stop it compiling. */
export function compileDraft(
  snapshot: RepositorySnapshot["metamodel"],
  rules: Rule[],
): { metamodel: Metamodel; problems: [] } | { metamodel: null; problems: string[] } {
  try {
    return {
      metamodel: Metamodel.compile({ ...snapshot.package, relationshipRules: rules }, snapshot.diagramTypes),
      problems: [],
    };
  } catch (error) {
    if (error instanceof MetamodelError) return { metamodel: null, problems: error.problems };
    throw error;
  }
}

/** Object types in tree order (each parent followed by its subtypes), with their depth, for the matrix axes. */
export function typeTree(metamodel: Metamodel): { type: ResolvedObjectType; depth: number }[] {
  const all = metamodel.allObjectTypes();
  const children = (parent: TypeKey | undefined) => all.filter((t) => t.definition.extends === parent);
  const out: { type: ResolvedObjectType; depth: number }[] = [];
  const walk = (parent: TypeKey | undefined, depth: number) => {
    for (const t of children(parent)) {
      out.push({ type: t, depth });
      walk(t.definition.key, depth + 1);
    }
  };
  walk(undefined, 0);
  return out;
}

export interface CellEntry {
  relationshipType: ResolvedRelationshipType;
  enforcement: Enforcement;
  /** The rule written for exactly this source and target; absent when the pair is covered by a broader rule. */
  own?: Rule;
  /** The broader rule that covers the pair (a parent type or `*`), when there is no own rule. */
  inheritedFrom?: Rule;
}

/** What may connect a source type to a target type under the draft: one entry per allowed relationship type. */
export function matrixCell(metamodel: Metamodel, rules: Rule[], source: TypeKey, target: TypeKey): CellEntry[] {
  const entries: CellEntry[] = [];
  for (const rt of metamodel.allRelationshipTypes()) {
    const matching = rules.filter(
      (r) =>
        r.relationshipType === rt.key && metamodel.isA(source, r.sourceType) && metamodel.isA(target, r.targetType),
    );
    if (matching.length === 0) continue;
    const own = matching.find((r) => r.sourceType === source && r.targetType === target);
    // A block rule anywhere wins over a warn, as the engine treats any matching rule as allowing the pair.
    const enforcement: Enforcement = matching.some((r) => enforcementOf(r) === "block") ? "block" : "warn";
    entries.push(
      own
        ? { relationshipType: rt, enforcement, own }
        : { relationshipType: rt, enforcement, inheritedFrom: matching[0]! },
    );
  }
  return entries;
}

/** Adds, removes or re-enforces the rule for exactly one relationship type, source and target. */
export function setRule(
  rules: Rule[],
  relationshipType: TypeKey,
  sourceType: TypeKey,
  targetType: TypeKey,
  enforcement: Enforcement | null,
): Rule[] {
  const key = ruleKey({ relationshipType, sourceType, targetType });
  const index = rules.findIndex((r) => ruleKey(r) === key);
  if (enforcement === null) return index < 0 ? rules : rules.filter((_, i) => i !== index);
  const rule: Rule = {
    ...(index >= 0 ? rules[index]! : { relationshipType, sourceType, targetType }),
    ...(enforcement === "warn" ? { enforcement: "warn" } : {}),
  };
  if (enforcement === "block") delete rule.enforcement;
  return index < 0 ? [...rules, rule] : rules.map((r, i) => (i === index ? rule : r));
}

/** How a draft differs from the published rules. */
export function ruleChanges(published: Rule[], draft: Rule[]) {
  const before = new Map(published.map((r) => [ruleKey(r), r]));
  const after = new Map(draft.map((r) => [ruleKey(r), r]));
  return {
    added: draft.filter((r) => !before.has(ruleKey(r))),
    removed: published.filter((r) => !after.has(ruleKey(r))),
    changed: draft.filter((r) => {
      const old = before.get(ruleKey(r));
      return old !== undefined && JSON.stringify(old) !== JSON.stringify(r);
    }),
  };
}

export const countChanges = (c: ReturnType<typeof ruleChanges>) => c.added.length + c.removed.length + c.changed.length;

/** A type key as people read it: its name, "any type" for `*`. */
export function typeLabel(metamodel: Metamodel, key: TypeKey | "*"): string {
  if (key === "*") return "any type";
  return metamodel.objectType(key)?.definition.name ?? key;
}

/** How many relationships in the model each rule covers (a relationship counts for every rule that allows it). */
export function ruleUsage(metamodel: Metamodel, rules: Rule[], combinations: Combination[]): Map<string, number> {
  const usage = new Map<string, number>();
  for (const r of rules) {
    let n = 0;
    for (const c of combinations)
      if (
        c.relationshipType === r.relationshipType &&
        metamodel.isA(c.sourceType, r.sourceType) &&
        metamodel.isA(c.targetType, r.targetType)
      )
        n += c.count;
    usage.set(ruleKey(r), n);
  }
  return usage;
}

/** Relationships in the model per source/target pair, for the matrix's "in use" shading. */
export function pairUsage(state: ModelState): Map<string, number> {
  const usage = new Map<string, number>();
  for (const c of relationshipCombinations(state)) {
    const key = `${c.sourceType}->${c.targetType}`;
    usage.set(key, (usage.get(key) ?? 0) + c.count);
  }
  return usage;
}

/** The kind families the matrix colours its dots by. */
export type KindFamily = "structure" | "dependency" | "dynamic" | "influence";

export const KIND_FAMILY: Record<SemanticKind, KindFamily> = {
  containment: "structure",
  composition: "structure",
  aggregation: "structure",
  specialisation: "structure",
  realisation: "dependency",
  representation: "dependency",
  serving: "dependency",
  assignment: "dependency",
  access: "dependency",
  association: "dependency",
  flow: "dynamic",
  trigger: "dynamic",
  interaction: "dynamic",
  influence: "influence",
};

export interface TryResult {
  /** What the connect menu offers, in its order, with the rule behind each and whether it only warns. */
  connect: { relationshipType: ResolvedRelationshipType; enforcement: Enforcement; rule: Rule }[];
  /** Relationship types that would nest the target inside the source on a nested diagram. */
  nest: ResolvedRelationshipType[];
  /** Why nothing connects, with what the source can connect to instead. */
  refused: string | null;
}

/** "Try a connection": what a modeller gets when connecting an object of one type to an object of another. */
export function tryConnection(metamodel: Metamodel, rules: Rule[], source: TypeKey, target: TypeKey): TryResult {
  const cell = matrixCell(metamodel, rules, source, target);
  const connect = cell
    .map((e) => ({
      relationshipType: e.relationshipType,
      enforcement: e.enforcement,
      rule: (e.own ?? e.inheritedFrom)!,
    }))
    .sort((a, b) => a.relationshipType.name.localeCompare(b.relationshipType.name));
  const nest = connect.filter((c) => c.relationshipType.nesting).map((c) => c.relationshipType);
  let refused: string | null = null;
  if (connect.length === 0) {
    const targets = new Set<string>();
    for (const r of rules) if (metamodel.isA(source, r.sourceType)) targets.add(typeLabel(metamodel, r.targetType));
    const name = (k: TypeKey) => typeLabel(metamodel, k);
    refused =
      `No rule connects ${name(source)} to ${name(target)}.` +
      (targets.size > 0
        ? ` ${name(source)} can connect to: ${[...targets].sort().join(", ")}.`
        : ` ${name(source)} has no outgoing rules.`);
  }
  return { connect, nest, refused };
}
