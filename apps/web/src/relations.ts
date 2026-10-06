// The Relations window's views of an object's relationships (design/04-ux/workbench.md "Tool windows"): by meaning,
// by related object, and reach along flows or dependencies over several steps. Pure, so it is unit-tested.
import type { Metamodel, ModelState } from "@connectome/engine";
import type { Id, SemanticKind } from "@connectome/model";
import { trace, type TraceDirection, type TraceStep } from "@connectome/semantics";
import { payloadText, relationshipGroups, type RelationshipGroup } from "./semantics";

export type RelationView = "meaning" | "object" | "flows" | "dependencies" | "structure";

export const RELATION_VIEWS: { key: RelationView; label: string; depth?: boolean }[] = [
  { key: "meaning", label: "By meaning" },
  { key: "object", label: "By object" },
  { key: "flows", label: "Data flows (2 steps)" },
  { key: "dependencies", label: "Dependencies (n steps)", depth: true },
  { key: "structure", label: "Structure" },
];

/** Kinds that make up an object's structure: what it is part of and what it is made of. */
const STRUCTURE: readonly SemanticKind[] = ["containment", "composition", "aggregation", "specialisation"];

/** Whether `query` (lower case) occurs in any of the texts. */
const matches = (query: string, ...texts: (string | undefined)[]) =>
  query === "" || texts.some((t) => t?.toLowerCase().includes(query));

/** The object's relationship groups by meaning, keeping rows whose verb, other object, its type or payload match. */
export function meaningGroups(
  state: ModelState,
  metamodel: Metamodel,
  objectId: Id,
  filter = "",
  kinds?: readonly SemanticKind[],
): RelationshipGroup[] {
  const query = filter.trim().toLowerCase();
  return relationshipGroups(state, metamodel, objectId)
    .filter((g) => !kinds || kinds.includes(g.kind))
    .map((g) => ({
      ...g,
      rows: g.rows.filter((r) => {
        const other = state.objects.get(r.other);
        const typeName = other ? metamodel.objectType(other.type)?.definition.name : undefined;
        return matches(query, r.verb, other?.name, typeName, g.label, payloadText(state, r.relationship));
      }),
    }))
    .filter((g) => g.rows.length > 0);
}

export const structureGroups = (state: ModelState, metamodel: Metamodel, objectId: Id, filter = "") =>
  meaningGroups(state, metamodel, objectId, filter, STRUCTURE);

export interface RelatedObject {
  objectId: Id;
  /** Each relationship to it, in the object's own words ("flows to", "receives from"). */
  links: { relationshipId: Id; verb: string; arrow: string }[];
}

/** One entry per related object, with every relationship to it, by name. */
export function relatedObjects(state: ModelState, metamodel: Metamodel, objectId: Id, filter = ""): RelatedObject[] {
  const byObject = new Map<Id, RelatedObject>();
  for (const g of meaningGroups(state, metamodel, objectId, filter))
    for (const r of g.rows) {
      const entry = byObject.get(r.other) ?? { objectId: r.other, links: [] };
      entry.links.push({ relationshipId: r.relationship.id, verb: r.verb, arrow: r.arrow });
      byObject.set(r.other, entry);
    }
  const name = (id: Id) => state.objects.get(id)?.name ?? id;
  return [...byObject.values()].sort((a, b) => name(a.objectId).localeCompare(name(b.objectId)));
}

export interface Reach {
  label: string;
  direction: TraceDirection;
  steps: TraceStep[];
  truncated: boolean;
}

const REACH_LABELS = {
  flow: { forward: "Downstream", backward: "Upstream" },
  dependency: { forward: "What this depends on", backward: "What depends on this" },
} as const;

/** What an object reaches along flows or dependencies, both ways, up to `depth` steps; filtered by name or type. */
export function reach(
  state: ModelState,
  metamodel: Metamodel,
  objectId: Id,
  kind: "flow" | "dependency",
  depth: number,
  filter = "",
): Reach[] {
  const query = filter.trim().toLowerCase();
  return (["forward", "backward"] as const).map((direction) => {
    const result = trace(state, metamodel, objectId, kind, direction, { depth, contents: kind === "flow" });
    return {
      label: REACH_LABELS[kind][direction],
      direction,
      truncated: result.truncated,
      steps: result.steps.filter((s) => {
        const o = state.objects.get(s.objectId);
        return matches(query, o?.name, o ? metamodel.objectType(o.type)?.definition.name : undefined);
      }),
    };
  });
}

export interface Occurrence {
  diagramId: Id;
  /** How many times the object is drawn on it. */
  count: number;
}

/** The diagrams an object occurs on, with how often, by diagram name. */
export function occurrences(state: ModelState, objectId: Id, filter = ""): Occurrence[] {
  const query = filter.trim().toLowerCase();
  const counts = new Map<Id, number>();
  for (const o of state.objectOccurrences.find("byObject", objectId))
    counts.set(o.diagramId, (counts.get(o.diagramId) ?? 0) + 1);
  const name = (id: Id) => state.diagrams.get(id)?.name ?? "";
  return [...counts]
    .filter(([id]) => state.diagrams.get(id) && matches(query, name(id)))
    .map(([diagramId, count]) => ({ diagramId, count }))
    .sort((a, b) => name(a.diagramId).localeCompare(name(b.diagramId)));
}
