// Property administration in the metamodel tab (slice A-1b; design/02-model/metamodel.md §3): editing property
// types and value lists, and which object, relationship and diagram types carry them, on a draft of the whole
// metamodel. Pure, so it can be tested on its own.
import { Metamodel, MetamodelError } from "@connectome/engine";
import {
  ABSTRACTION_PROPERTY,
  type DataType,
  type DiagramType,
  type MetamodelPackage,
  type ObjectType,
  type PropertyType,
  type TypeKey,
  type ValueList,
} from "@connectome/model";
import { ruleChanges, type Rule } from "./metamodel-admin";

/** What the metamodel tab edits: a package and its diagram types. */
export interface Draft {
  package: MetamodelPackage;
  diagramTypes: DiagramType[];
}

export type CarrierKind = "object" | "relationship" | "diagram";

export const CARRIER_LABEL: Record<CarrierKind, string> = {
  object: "Object types",
  relationship: "Relationship types",
  diagram: "Diagram types",
};

/** The data types an administrator can pick, as people read them. Calculated ones need a formula: not here yet. */
export const DATA_TYPES: { value: DataType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "richText", label: "Long text" },
  { value: "number", label: "Number" },
  { value: "money", label: "Money" },
  { value: "date", label: "Date" },
  { value: "boolean", label: "Yes / no" },
  { value: "list", label: "Choice from a list" },
  { value: "multiList", label: "Several from a list" },
  { value: "url", label: "Link" },
  { value: "objectRef", label: "Reference to an object" },
  { value: "person", label: "Person" },
];

export const dataTypeLabel = (t: DataType) =>
  DATA_TYPES.find((d) => d.value === t)?.label ?? (t === "calculated" ? "Calculated" : t);

export const isListType = (t: DataType) => t === "list" || t === "multiList";

/** The draft compiled, or the problems that stop it compiling. */
export function compileDraft(
  draft: Draft,
): { metamodel: Metamodel; problems: [] } | { metamodel: null; problems: string[] } {
  try {
    return { metamodel: Metamodel.compile(draft.package, draft.diagramTypes), problems: [] };
  } catch (error) {
    if (error instanceof MetamodelError) return { metamodel: null, problems: error.problems };
    throw error;
  }
}

/** Built-in property types (the core package's) are not part of the draft and cannot be edited. */
export const isCoreProperty = (draft: Draft, key: string) =>
  !(draft.package.propertyTypes ?? []).some((p) => p.key === key);

/** A word list as a key part: "Risk notes" → "riskNotes". */
export function camelKey(text: string): string {
  const words = text
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const key = words
    .map((w, i) => (i === 0 ? w.charAt(0).toLowerCase() + w.slice(1) : w.charAt(0).toUpperCase() + w.slice(1)))
    .join("");
  return /^[a-z]/.test(key) ? key : `p${key}`;
}

/** A new, unused key for a property type: `group.name` in camel case, numbered if taken. */
export function newPropertyKey(group: string, name: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = `${camelKey(group || "custom")}.${camelKey(name || "property")}`;
  let key = base;
  for (let n = 2; used.has(key); n++) key = `${base}${n}`;
  return key;
}

/** A new, unused key for a value list. */
export function newListKey(name: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = camelKey(name || "list");
  let key = base;
  for (let n = 2; used.has(key); n++) key = `${base}${n}`;
  return key;
}

/** The property types listed directly on each type (not inherited), by kind. */
export function ownCarriers(draft: Draft, key: string): Record<CarrierKind, TypeKey[]> {
  return {
    object: draft.package.objectTypes.filter((t) => t.properties?.includes(key)).map((t) => t.key),
    relationship: draft.package.relationshipTypes.filter((t) => t.properties?.includes(key)).map((t) => t.key),
    diagram: draft.diagramTypes.filter((t) => t.properties?.includes(key)).map((t) => t.key),
  };
}

/** The parent chain of an object type in the draft, the type first. */
export function lineageOf(pkg: MetamodelPackage, key: TypeKey): ObjectType[] {
  const chain: ObjectType[] = [];
  let current = pkg.objectTypes.find((t) => t.key === key);
  while (current && !chain.includes(current)) {
    chain.push(current);
    current = current.extends ? pkg.objectTypes.find((t) => t.key === current!.extends) : undefined;
  }
  return chain;
}

/** For an object type: the ancestor a property is inherited from, if it is not the type's own. */
export function inheritedFrom(pkg: MetamodelPackage, type: TypeKey, key: string): ObjectType | undefined {
  return lineageOf(pkg, type)
    .slice(1)
    .find((t) => t.properties?.includes(key));
}

const withList = <T extends { properties?: string[] }>(t: T, properties: string[]): T => {
  const { properties: _, ...rest } = t;
  return (properties.length > 0 ? { ...rest, properties } : rest) as T;
};

const toggle = (list: string[] | undefined, key: string, on: boolean) =>
  on ? [...(list ?? []).filter((k) => k !== key), key] : (list ?? []).filter((k) => k !== key);

/** Property sets may only list properties their type carries: drop the ones a change took away. */
function pruneSets(pkg: MetamodelPackage): MetamodelPackage {
  return {
    ...pkg,
    objectTypes: pkg.objectTypes.map((t) => {
      if (!t.propertySets) return t;
      const carried = new Set([...lineageOf(pkg, t.key).flatMap((x) => x.properties ?? []), ABSTRACTION_PROPERTY]);
      return {
        ...t,
        propertySets: t.propertySets.map((s) => ({ ...s, properties: s.properties.filter((p) => carried.has(p)) })),
      };
    }),
  };
}

/** Gives a type a property, or takes it away (its stored values are kept by the server). */
export function setCarried(draft: Draft, kind: CarrierKind, type: TypeKey, key: string, on: boolean): Draft {
  const pkg = draft.package;
  if (kind === "diagram")
    return {
      ...draft,
      diagramTypes: draft.diagramTypes.map((t) => (t.key === type ? withList(t, toggle(t.properties, key, on)) : t)),
    };
  if (kind === "relationship")
    return {
      ...draft,
      package: {
        ...pkg,
        relationshipTypes: pkg.relationshipTypes.map((t) =>
          t.key === type ? withList(t, toggle(t.properties, key, on)) : t,
        ),
      },
    };
  return {
    ...draft,
    package: pruneSets({
      ...pkg,
      objectTypes: pkg.objectTypes.map((t) => (t.key === type ? withList(t, toggle(t.properties, key, on)) : t)),
    }),
  };
}

/** Adds a property type, or replaces the one with `previousKey` (renaming its key where types use it). */
export function upsertPropertyType(draft: Draft, pt: PropertyType, previousKey = pt.key): Draft {
  const rename = (list?: string[]) => list?.map((k) => (k === previousKey ? pt.key : k));
  const list = draft.package.propertyTypes ?? [];
  const exists = list.some((p) => p.key === previousKey);
  const pkg: MetamodelPackage = {
    ...draft.package,
    propertyTypes: exists ? list.map((p) => (p.key === previousKey ? pt : p)) : [...list, pt],
  };
  if (previousKey === pt.key) return { ...draft, package: pkg };
  return {
    package: {
      ...pkg,
      objectTypes: pkg.objectTypes.map((t) => ({
        ...t,
        ...(t.properties ? { properties: rename(t.properties) } : {}),
        ...(t.propertySets
          ? { propertySets: t.propertySets.map((s) => ({ ...s, properties: rename(s.properties)! })) }
          : {}),
      })),
      relationshipTypes: pkg.relationshipTypes.map((t) =>
        t.properties ? { ...t, properties: rename(t.properties) } : t,
      ),
    },
    diagramTypes: draft.diagramTypes.map((t) => (t.properties ? { ...t, properties: rename(t.properties) } : t)),
  };
}

/** Removes a property type from the draft and from every type that carries it; its list goes if nothing else uses it. */
export function removePropertyType(draft: Draft, key: string): Draft {
  let next = draft;
  const carriers = ownCarriers(draft, key);
  for (const kind of Object.keys(carriers) as CarrierKind[])
    for (const type of carriers[kind]) next = setCarried(next, kind, type, key, false);
  const list = (next.package.propertyTypes ?? []).find((p) => p.key === key)?.valueList;
  const propertyTypes = (next.package.propertyTypes ?? []).filter((p) => p.key !== key);
  const orphan = list !== undefined && !propertyTypes.some((p) => p.valueList === list);
  return {
    ...next,
    package: {
      ...next.package,
      propertyTypes,
      ...(orphan ? { valueLists: (next.package.valueLists ?? []).filter((l) => l.key !== list) } : {}),
    },
  };
}

/** Adds or replaces a value list. */
export function upsertValueList(draft: Draft, list: ValueList): Draft {
  const lists = draft.package.valueLists ?? [];
  return {
    ...draft,
    package: {
      ...draft.package,
      valueLists: lists.some((l) => l.key === list.key)
        ? lists.map((l) => (l.key === list.key ? list : l))
        : [...lists, list],
    },
  };
}

/** The property types that use a value list. */
export const listUsers = (draft: Draft, listKey: string) =>
  (draft.package.propertyTypes ?? []).filter((p) => p.valueList === listKey);

/** A list value key from its label: "Phase out" → "phaseOut", unique within the list. */
export const newValueKey = (label: string, list: ValueList) =>
  newListKey(
    label || "value",
    list.values.map((v) => v.key),
  );

export interface Carriage {
  kind: CarrierKind;
  type: TypeKey;
  property: string;
}

export interface DraftChanges {
  rules: ReturnType<typeof ruleChanges>;
  properties: { added: PropertyType[]; removed: PropertyType[]; changed: PropertyType[] };
  lists: { added: ValueList[]; removed: ValueList[]; changed: ValueList[] };
  carried: { added: Carriage[]; removed: Carriage[] };
}

/** JSON with object keys sorted, so two values compare equal whatever order their fields were set in. */
export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

const byKey = <T extends { key: string }>(before: T[], after: T[]) => {
  const old = new Map(before.map((x) => [x.key, x]));
  const now = new Map(after.map((x) => [x.key, x]));
  return {
    added: after.filter((x) => !old.has(x.key)),
    removed: before.filter((x) => !now.has(x.key)),
    changed: after.filter((x) => old.has(x.key) && stableJson(old.get(x.key)) !== stableJson(x)),
  };
};

function carriages(draft: Draft): Carriage[] {
  const out: Carriage[] = [];
  const add = (kind: CarrierKind, types: { key: TypeKey; properties?: string[] }[]) => {
    for (const t of types) for (const property of t.properties ?? []) out.push({ kind, type: t.key, property });
  };
  add("object", draft.package.objectTypes);
  add("relationship", draft.package.relationshipTypes);
  add("diagram", draft.diagramTypes);
  return out;
}

/** How a draft differs from the published metamodel. */
export function draftChanges(published: Draft, draft: Draft): DraftChanges {
  const id = (c: Carriage) => `${c.kind}|${c.type}|${c.property}`;
  const before = carriages(published);
  const after = carriages(draft);
  const had = new Set(before.map(id));
  const has = new Set(after.map(id));
  return {
    rules: ruleChanges(
      (published.package.relationshipRules ?? []) as Rule[],
      (draft.package.relationshipRules ?? []) as Rule[],
    ),
    properties: byKey(published.package.propertyTypes ?? [], draft.package.propertyTypes ?? []),
    lists: byKey(published.package.valueLists ?? [], draft.package.valueLists ?? []),
    carried: { added: after.filter((c) => !had.has(id(c))), removed: before.filter((c) => !has.has(id(c))) },
  };
}

/** How many changes a draft holds. A new property's own list and carriers count with it, not on their own. */
export function countDraftChanges(c: DraftChanges): number {
  const newProps = new Set(c.properties.added.map((p) => p.key));
  const newLists = new Set(c.properties.added.map((p) => p.valueList).filter(Boolean));
  const goneProps = new Set(c.properties.removed.map((p) => p.key));
  return (
    c.rules.added.length +
    c.rules.removed.length +
    c.rules.changed.length +
    c.properties.added.length +
    c.properties.removed.length +
    c.properties.changed.length +
    c.lists.added.filter((l) => !newLists.has(l.key)).length +
    c.lists.changed.length +
    c.carried.added.filter((x) => !newProps.has(x.property)).length +
    c.carried.removed.filter((x) => !goneProps.has(x.property)).length
  );
}

/** Whether a draft is the published metamodel again (so it can be dropped). */
export const sameAsPublished = (published: Draft, draft: Draft) =>
  stableJson(published.package) === stableJson(draft.package) &&
  stableJson(published.diagramTypes) === stableJson(draft.diagramTypes);
