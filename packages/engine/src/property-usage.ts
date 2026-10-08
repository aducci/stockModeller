// How the model uses the property types (design/02-model/metamodel.md §3 and §7), and what publishing a new
// metamodel would do to stored values: which values its types stop carrying, and which edits it must refuse.
import type { PropertyKey, PropertyValue, TypeKey } from "@connectome/model";
import type { Metamodel } from "./metamodel";
import type { ModelState } from "./state";

export interface PropertyUsage {
  /** Live items holding a value for the property. */
  objects: number;
  relationships: number;
  diagrams: number;
}

type Holder = {
  kind: "objects" | "relationships" | "diagrams";
  type: TypeKey;
  properties: Record<string, PropertyValue>;
};

function* holders(state: ModelState): Generator<Holder> {
  for (const o of state.objects.live()) yield { kind: "objects", type: o.type, properties: o.properties };
  for (const r of state.relationships.live()) yield { kind: "relationships", type: r.type, properties: r.properties };
  for (const d of state.diagrams.live())
    yield { kind: "diagrams", type: d.diagramType, properties: d.properties ?? {} };
}

const hasValue = (v: PropertyValue | undefined) =>
  v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0);

/** How many live objects, relationships and diagrams hold a value for each property. */
export function propertyUsage(state: ModelState): Map<PropertyKey, PropertyUsage> {
  const usage = new Map<PropertyKey, PropertyUsage>();
  for (const h of holders(state))
    for (const [key, value] of Object.entries(h.properties)) {
      if (!hasValue(value)) continue;
      const u = usage.get(key) ?? { objects: 0, relationships: 0, diagrams: 0 };
      u[h.kind]++;
      usage.set(key, u);
    }
  return usage;
}

/** The property types an item of this kind and type carries under a metamodel. */
export function carriedProperties(metamodel: Metamodel, kind: Holder["kind"], type: TypeKey): ReadonlySet<string> {
  if (kind === "objects") return metamodel.objectType(type)?.properties ?? new Set();
  if (kind === "relationships") return metamodel.relationshipTypeProperties(type);
  return metamodel.diagramType(type)?.properties ?? new Set();
}

/** Stored values whose item's type does not carry the property (kept, and listed by the panel), per property. */
export function strandedValues(state: ModelState, metamodel: Metamodel): Map<PropertyKey, number> {
  const stranded = new Map<PropertyKey, number>();
  for (const h of holders(state)) {
    const carried = carriedProperties(metamodel, h.kind, h.type);
    for (const [key, value] of Object.entries(h.properties))
      if (hasValue(value) && !carried.has(key)) stranded.set(key, (stranded.get(key) ?? 0) + 1);
  }
  return stranded;
}

export interface MetamodelImpact {
  /** Values that `after` stops carrying (they stay stored and the panel lists them), per property. */
  stranded: { propertyType: PropertyKey; count: number }[];
  /** Why `after` cannot be published over this model; empty when it can. */
  problems: string[];
}

/**
 * What publishing `after` in place of `before` does to the stored model. It is refused when it removes a type
 * that items still use, changes the data type of a property that holds values, or removes a list value in use.
 */
export function metamodelImpact(state: ModelState, before: Metamodel, after: Metamodel): MetamodelImpact {
  const problems: string[] = [];
  const typesInUse = (kind: Holder["kind"]) => {
    const counts = new Map<TypeKey, number>();
    for (const h of holders(state)) if (h.kind === kind) counts.set(h.type, (counts.get(h.type) ?? 0) + 1);
    return counts;
  };
  const removedInUse = (kind: Holder["kind"], label: string, exists: (key: TypeKey) => boolean) => {
    for (const [type, count] of typesInUse(kind))
      if (!exists(type)) problems.push(`${label} "${type}" is removed but ${count} ${kind} still use it`);
  };
  removedInUse("objects", "Object type", (k) => after.objectType(k) !== undefined);
  removedInUse("relationships", "Relationship type", (k) => after.relationshipType(k) !== undefined);
  removedInUse("diagrams", "Diagram type", (k) => after.diagramType(k) !== undefined);
  // A diagram's content depends on its kind (occurrences, a definition), so a type in use keeps its kind (B48).
  for (const [type, count] of typesInUse("diagrams")) {
    const was = before.diagramType(type)?.definition.kind ?? "canvas";
    const now = after.diagramType(type)?.definition.kind ?? "canvas";
    if (after.diagramType(type) && was !== now)
      problems.push(`Diagram type "${type}" changes from ${was} to ${now} but ${count} diagrams still use it`);
  }

  const valuesOf = new Map<PropertyKey, PropertyValue[]>();
  for (const h of holders(state))
    for (const [key, value] of Object.entries(h.properties))
      if (hasValue(value)) valuesOf.set(key, [...(valuesOf.get(key) ?? []), value]);

  for (const [key, values] of valuesOf) {
    const old = before.propertyType(key);
    const now = after.propertyType(key);
    if (!old || !now) continue;
    if (old.dataType !== now.dataType) {
      problems.push(
        `${now.name} holds ${values.length} values, so its data type cannot change from ${old.dataType} to ${now.dataType}`,
      );
      continue;
    }
    if ((now.dataType === "list" || now.dataType === "multiList") && now.valueList) {
      const allowed = new Set(after.valueList(now.valueList)?.values.map((v) => v.key));
      const missing = new Map<string, number>();
      for (const v of values)
        for (const item of Array.isArray(v) ? v : [v])
          if (!allowed.has(String(item))) missing.set(String(item), (missing.get(String(item)) ?? 0) + 1);
      for (const [value, count] of missing)
        if (before.valueList(old.valueList ?? "")?.values.some((x) => x.key === value))
          problems.push(`${now.name} value "${value}" is removed but ${count} items still use it`);
    }
  }

  const was = strandedValues(state, before);
  const stranded = [...strandedValues(state, after)]
    .map(([propertyType, count]) => ({ propertyType, count: count - (was.get(propertyType) ?? 0) }))
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count || a.propertyType.localeCompare(b.propertyType));
  return { stranded, problems };
}
