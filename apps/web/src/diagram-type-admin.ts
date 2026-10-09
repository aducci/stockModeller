// Diagram types in the metamodel tab (views in the app, slice U-3): duplicating a type, editing it on the draft, and
// what a change does to the diagrams that use it. Pure, so it can be tested on its own.
import type { Metamodel, ModelState } from "@connectome/engine";
import type { DiagramType, SymbolStyle, TypeKey, ViewKind } from "@connectome/model";
import { camelKey, stableJson, type Draft } from "./property-admin";

export const kindOf = (t: DiagramType): ViewKind => t.kind ?? "canvas";

/** A new, unused diagram type key from a name: "Data flow map" → "dataFlowMap", numbered if taken. */
export function newDiagramTypeKey(name: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = camelKey(name || "diagram");
  let key = base;
  for (let n = 2; used.has(key); n++) key = `${base}${n}`;
  return key;
}

/**
 * A copy of a type under a new name and key, placed after it (decision B48: new types start from an existing one).
 * Everything is copied, its template and matrix included, so the copy works at once.
 */
export function duplicateDiagramType(draft: Draft, key: TypeKey, name?: string): { draft: Draft; key: TypeKey } {
  const at = draft.diagramTypes.findIndex((t) => t.key === key);
  const source = draft.diagramTypes[at];
  if (!source) return { draft, key };
  const names = new Set(draft.diagramTypes.map((t) => t.name));
  let copyName = name?.trim() || `${source.name} copy`;
  for (let n = 2; names.has(copyName); n++) copyName = `${source.name} copy ${n}`;
  const copy: DiagramType = {
    ...structuredClone(source),
    key: newDiagramTypeKey(
      copyName,
      draft.diagramTypes.map((t) => t.key),
    ),
    name: copyName,
  };
  const diagramTypes = [...draft.diagramTypes];
  diagramTypes.splice(at + 1, 0, copy);
  return { draft: { ...draft, diagramTypes }, key: copy.key };
}

/**
 * Optional fields set to `undefined` are removed. An empty `relationshipTypes` stays: it allows none, where no list
 * allows every type.
 */
export function updateDiagramType(draft: Draft, key: TypeKey, patch: Partial<DiagramType>): Draft {
  return {
    ...draft,
    diagramTypes: draft.diagramTypes.map((t) => {
      if (t.key !== key) return t;
      const next: Record<string, unknown> = { ...t, ...patch };
      for (const [k, v] of Object.entries(next))
        if (v === undefined || (k === "properties" && Array.isArray(v) && v.length === 0)) delete next[k];
      return next as unknown as DiagramType;
    }),
  };
}

/**
 * Changes what a type's diagrams can be about (DOC-1): the element types (none = any) and the property that links
 * them from the element. An empty subject is removed, so a type that never said anything stays as it was.
 */
export function withSubject(
  type: DiagramType,
  patch: Partial<NonNullable<DiagramType["subject"]>>,
): Partial<DiagramType> {
  const next: Record<string, unknown> = { ...type.subject, ...patch };
  for (const [k, v] of Object.entries(next))
    if (v === undefined || (Array.isArray(v) && v.length === 0)) delete next[k];
  return { subject: Object.keys(next).length > 0 ? (next as DiagramType["subject"]) : undefined };
}

/**
 * What a document type describes (views-and-design-artifacts.md §13): the element types its documents can be about,
 * kept as the template's subject, with the type's `objectTypes` equal to it. At least one type stays.
 */
export function setDescribes(draft: Draft, key: TypeKey, types: TypeKey[]): Draft {
  const type = draft.diagramTypes.find((t) => t.key === key);
  if (!type?.document || types.length === 0) return draft;
  // The types replace a category filter: what the admin ticks is what the document describes.
  return updateDiagramType(draft, key, {
    objectTypes: types,
    document: { ...type.document, subject: { type: types } },
  });
}

export const removeDiagramType = (draft: Draft, key: TypeKey): Draft => ({
  ...draft,
  diagramTypes: draft.diagramTypes.filter((t) => t.key !== key),
});

/** Changes a type's kind (only while no diagram uses it): drops the settings of the old kind, adds the new one's. */
export function setKind(draft: Draft, key: TypeKey, kind: ViewKind): Draft {
  const type = draft.diagramTypes.find((t) => t.key === key);
  if (!type || kindOf(type) === kind) return draft;
  const patch: Partial<DiagramType> = {
    kind: kind === "canvas" ? undefined : kind,
    matrix: undefined,
    document: undefined,
  };
  if (kind === "matrix") {
    const [rows, columns] = [type.objectTypes[0], type.objectTypes[1] ?? type.objectTypes[0]];
    patch.matrix = {
      rows: { from: rows ? { type: [rows] } : {} },
      columns: { from: columns ? { type: [columns] } : {} },
      relationships: type.relationshipTypes?.length ? { types: [type.relationshipTypes[0]!] } : {},
    };
  }
  if (kind === "document")
    patch.document = {
      subject: { type: type.objectTypes.slice(0, 1) },
      sections: [{ key: "summary", title: "Summary", component: "prose" }],
    };
  return updateDiagramType(draft, key, patch);
}

/** Sets one field of a type's symbol for an object type; `undefined` clears it, and an empty symbol goes. */
export function setSymbol(
  draft: Draft,
  key: TypeKey,
  objectType: TypeKey,
  field: keyof SymbolStyle,
  value: SymbolStyle[keyof SymbolStyle] | undefined,
): Draft {
  const type = draft.diagramTypes.find((t) => t.key === key);
  if (!type) return draft;
  const symbol: Record<string, unknown> = { ...type.symbols?.[objectType], [field]: value };
  if (value === undefined || value === "") delete symbol[field];
  const symbols: Record<string, Partial<SymbolStyle>> = { ...type.symbols };
  if (Object.keys(symbol).length > 0) symbols[objectType] = symbol as Partial<SymbolStyle>;
  else delete symbols[objectType];
  return updateDiagramType(draft, key, { symbols: Object.keys(symbols).length > 0 ? symbols : undefined });
}

export interface DiagramTypeChanges {
  added: DiagramType[];
  removed: DiagramType[];
  /** Changed in more than which properties they carry (that is counted with the properties). */
  changed: DiagramType[];
}

/** How the draft's diagram types differ from the published ones. */
export function diagramTypeChanges(published: Draft, draft: Draft): DiagramTypeChanges {
  const old = new Map(published.diagramTypes.map((t) => [t.key, t]));
  const now = new Map(draft.diagramTypes.map((t) => [t.key, t]));
  const withoutProperties = (t: DiagramType) => {
    const { properties: _, ...rest } = t;
    return stableJson(rest);
  };
  return {
    added: draft.diagramTypes.filter((t) => !old.has(t.key)),
    removed: published.diagramTypes.filter((t) => !now.has(t.key)),
    changed: draft.diagramTypes.filter(
      (t) => old.has(t.key) && withoutProperties(old.get(t.key)!) !== withoutProperties(t),
    ),
  };
}

/** How many diagrams of each type the model holds. */
export function diagramsByType(state: ModelState): Map<TypeKey, number> {
  const counts = new Map<TypeKey, number>();
  for (const d of state.diagrams.live()) counts.set(d.diagramType, (counts.get(d.diagramType) ?? 0) + 1);
  return counts;
}

export interface OffType {
  diagramType: TypeKey;
  /** The object or relationship type the draft no longer allows on it. */
  type: TypeKey;
  what: "object" | "relationship";
  count: number;
}

/**
 * What diagrams show that the draft no longer allows on their type: they stay drawn, but nothing new of those types
 * can be added. The publish dialog lists them, as it lists values a type stops carrying.
 */
export function offTypeOccurrences(state: ModelState, after: Metamodel): OffType[] {
  const counts = new Map<string, OffType>();
  const add = (diagramType: TypeKey, type: TypeKey, what: OffType["what"]) => {
    const id = `${diagramType}|${what}|${type}`;
    const entry = counts.get(id) ?? { diagramType, type, what, count: 0 };
    entry.count++;
    counts.set(id, entry);
  };
  for (const d of state.diagrams.live()) {
    const type = after.diagramType(d.diagramType);
    if (!type) continue;
    for (const o of state.objectOccurrences.find("byDiagram", d.id)) {
      const object = state.objects.get(o.objectId);
      if (object && !after.diagramAllowsObjectType(type, object.type)) add(d.diagramType, object.type, "object");
    }
    for (const o of state.relationshipOccurrences.find("byDiagram", d.id)) {
      const relationship = state.relationships.get(o.relationshipId);
      if (relationship && !after.diagramAllowsRelationshipType(type, relationship.type))
        add(d.diagramType, relationship.type, "relationship");
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.diagramType.localeCompare(b.diagramType));
}
