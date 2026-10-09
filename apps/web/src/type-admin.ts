// Creating, editing and removing object and relationship types (and blank diagram types) on the metamodel draft,
// and the metamodel as a file that can be exported, imported, or used to start a repository (storage §7,
// "Starting over"). Pure, so it can be tested on its own.
import {
  validateDiagramType,
  validatePackage,
  type DiagramType,
  type MetamodelPackage,
  type ObjectType,
  type RelationshipType,
  type TypeKey,
} from "@connectome/model";
import { camelKey, compileDraft, stableJson, type Draft } from "./property-admin";
import { newDiagramTypeKey } from "./diagram-type-admin";

/** Every type key in the draft: object, relationship and diagram types share one key space here. */
const takenKeys = (draft: Draft) => [
  ...draft.package.objectTypes.map((t) => t.key),
  ...draft.package.relationshipTypes.map((t) => t.key),
  ...draft.diagramTypes.map((t) => t.key),
];

/** A new, unused type key from a name: "Business service" → "businessService", numbered if taken. */
export function newTypeKey(name: string, taken: Iterable<string>, fallback = "type"): string {
  const used = new Set(taken);
  const base = camelKey(name || fallback);
  let key = base;
  for (let n = 2; used.has(key); n++) key = `${base}${n}`;
  return key;
}

/** Drops fields set to `undefined` or "", so clearing a field in a form removes it from the package. */
function patched<T extends object>(value: T, patch: Partial<T>): T {
  const next: Record<string, unknown> = { ...value, ...patch };
  for (const [k, v] of Object.entries(next)) if (v === undefined || v === "") delete next[k];
  return next as T;
}

const withPackage = (draft: Draft, pkg: Partial<MetamodelPackage>): Draft => ({
  ...draft,
  package: { ...draft.package, ...pkg },
});

// ------------------------------------------------------------------ object types

/** A new object type with no properties of its own, a subtype of `parent` when given (it inherits from it). */
export function newObjectType(draft: Draft, name: string, parent?: TypeKey): { draft: Draft; key: TypeKey } {
  const trimmed = name.trim() || "New type";
  const key = newTypeKey(trimmed, takenKeys(draft), "type");
  const type: ObjectType = { key, name: trimmed, properties: [], ...(parent ? { extends: parent } : {}) };
  return { draft: withPackage(draft, { objectTypes: [...draft.package.objectTypes, type] }), key };
}

export function updateObjectType(draft: Draft, key: TypeKey, patch: Partial<ObjectType>): Draft {
  return withPackage(draft, {
    objectTypes: draft.package.objectTypes.map((t) => (t.key === key ? patched(t, patch) : t)),
  });
}

/** Why an object type cannot be removed from the draft, or null. Objects of the type are checked when publishing. */
export function whyKeepObjectType(draft: Draft, key: TypeKey, objects: number): string | null {
  if (objects > 0) return `${objects} object${objects === 1 ? "" : "s"} of this type exist`;
  const sub = draft.package.objectTypes.find((t) => t.extends === key);
  if (sub) return `${sub.name} inherits from it`;
  return null;
}

/** Removes an object type with the rules that name it, and takes it off the diagram types that list it. */
export function removeObjectType(draft: Draft, key: TypeKey): Draft {
  const rules = (draft.package.relationshipRules ?? []).filter((r) => r.sourceType !== key && r.targetType !== key);
  return {
    package: {
      ...draft.package,
      objectTypes: draft.package.objectTypes.filter((t) => t.key !== key),
      relationshipRules: rules,
    },
    diagramTypes: draft.diagramTypes.map((d) =>
      d.objectTypes.includes(key) ? { ...d, objectTypes: d.objectTypes.filter((t) => t !== key) } : d,
    ),
  };
}

// ------------------------------------------------------------------ relationship types

/**
 * A new relationship type of the association kind, read with its name as the verb ("Supports": "supports" /
 * "is supported by" is for the administrator to set). Nothing may use it until a rule allows it.
 */
export function newRelationshipType(draft: Draft, name: string): { draft: Draft; key: TypeKey } {
  const trimmed = name.trim() || "New relationship";
  const key = newTypeKey(trimmed, takenKeys(draft), "relationship");
  const verb = trimmed.toLowerCase();
  const type: RelationshipType = { key, name: trimmed, verb, inverseVerb: `${verb} (inverse)` };
  return { draft: withPackage(draft, { relationshipTypes: [...draft.package.relationshipTypes, type] }), key };
}

export function updateRelationshipType(draft: Draft, key: TypeKey, patch: Partial<RelationshipType>): Draft {
  return withPackage(draft, {
    relationshipTypes: draft.package.relationshipTypes.map((t) => (t.key === key ? patched(t, patch) : t)),
  });
}

/** Removes a relationship type with its rules, and takes it off the diagram types that list it. */
export function removeRelationshipType(draft: Draft, key: TypeKey): Draft {
  return {
    package: {
      ...draft.package,
      relationshipTypes: draft.package.relationshipTypes.filter((t) => t.key !== key),
      relationshipRules: (draft.package.relationshipRules ?? []).filter((r) => r.relationshipType !== key),
    },
    diagramTypes: draft.diagramTypes.map((d) =>
      d.relationshipTypes?.includes(key)
        ? { ...d, relationshipTypes: d.relationshipTypes.filter((t) => t !== key) }
        : d,
    ),
  };
}

// ------------------------------------------------------------------ diagram types

/**
 * A blank canvas type that shows the given object types (at least one) and every relationship type. Starting from
 * a copy of a working type (B48) is still offered; this is for a metamodel that has none yet.
 */
export function newDiagramType(draft: Draft, name: string, objectTypes: TypeKey[]): { draft: Draft; key: TypeKey } {
  const trimmed = name.trim() || "New diagram type";
  const key = newDiagramTypeKey(trimmed, takenKeys(draft));
  const type: DiagramType = { key, name: trimmed, kind: "canvas", objectTypes };
  return { draft: { ...draft, diagramTypes: [...draft.diagramTypes, type] }, key };
}

/** The object types a new diagram type shows by default: the top of each inheritance tree (subtypes come with it). */
export const rootObjectTypes = (draft: Draft): TypeKey[] =>
  draft.package.objectTypes.filter((t) => !t.extends).map((t) => t.key);

// ------------------------------------------------------------------ what changed

/** Fields shown on the review as "changed"; properties and duplicates settings are reviewed on their own. */
const OBJECT_FIELDS: (keyof ObjectType)[] = [
  "name",
  "plural",
  "extends",
  "abstract",
  "category",
  "abstraction",
  "abstractionFixed",
  "symbol",
];
const RELATIONSHIP_FIELDS: (keyof RelationshipType)[] = [
  "name",
  "verb",
  "inverseVerb",
  "semantic",
  "semanticDirection",
  "nesting",
  "singleParent",
  "cascadeDelete",
  "line",
];

const pick = <T extends object>(value: T, fields: (keyof T)[]) => stableJson(fields.map((f) => value[f] ?? null));

function changesOf<T extends { key: string }>(before: T[], after: T[], fields: (keyof T)[]) {
  const old = new Map(before.map((t) => [t.key, t]));
  const now = new Set(after.map((t) => t.key));
  return {
    added: after.filter((t) => !old.has(t.key)),
    removed: before.filter((t) => !now.has(t.key)),
    changed: after.filter((t) => old.has(t.key) && pick(old.get(t.key)!, fields) !== pick(t, fields)),
  };
}

export interface TypeChanges {
  object: { added: ObjectType[]; removed: ObjectType[]; changed: ObjectType[] };
  relationship: { added: RelationshipType[]; removed: RelationshipType[]; changed: RelationshipType[] };
}

/** Object and relationship types added, removed, or with their name, place or meaning changed. */
export function typeChanges(published: Draft, draft: Draft): TypeChanges {
  return {
    object: changesOf(published.package.objectTypes, draft.package.objectTypes, OBJECT_FIELDS),
    relationship: changesOf(published.package.relationshipTypes, draft.package.relationshipTypes, RELATIONSHIP_FIELDS),
  };
}

export const countTypeChanges = (c: TypeChanges) =>
  c.object.added.length +
  c.object.removed.length +
  c.object.changed.length +
  c.relationship.added.length +
  c.relationship.removed.length +
  c.relationship.changed.length;

// ------------------------------------------------------------------ the metamodel as a file

export const METAMODEL_FORMAT = "connectome.metamodel";

/** A metamodel as it is exported, imported, and sent to start a repository: a package and its diagram types. */
export interface MetamodelFile {
  package: MetamodelPackage;
  diagramTypes: DiagramType[];
}

/** An empty metamodel, to start from scratch. */
export const emptyMetamodel = (name = "My metamodel"): MetamodelFile => ({
  package: { name, version: "1.0.0", objectTypes: [], relationshipTypes: [] },
  diagramTypes: [],
});

/** The file contents of an exported metamodel. */
export const exportMetamodel = (metamodel: MetamodelFile): string =>
  JSON.stringify({ format: METAMODEL_FORMAT, ...metamodel }, null, 2) + "\n";

/** A file name for an exported metamodel: "Insurance EA" 1.5.2 → "insurance-ea-1.5.2.metamodel.json". */
export function metamodelFileName(name: string, version: string): string {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "metamodel";
  return `${slug}-${version}.metamodel.json`;
}

/**
 * Reads a metamodel file: an exported one, a repository snapshot's `metamodel`, the body of a publish
 * (`metamodel` and `diagramTypes`), or a bare package. Throws an Error that says what is wrong with it.
 */
/** Older keys for an object type's abstraction (decision B62), so files exported before the rename still import. */
const RENAMED_KEYS: Record<string, string> = {
  level: "abstraction",
  levelFixed: "abstractionFixed",
  uniquePerLevel: "uniquePerAbstraction",
};
const RENAMED_VALUES: Record<string, string> = {
  "semantic.level": "semantic.abstraction",
  semanticLevel: "semanticAbstraction",
};

/** A file read from JSON with the pre-B62 names replaced: keys inside object types, and the property and list keys. */
function fromLevelNames(json: unknown, inObjectType = false): unknown {
  if (typeof json === "string") return RENAMED_VALUES[json] ?? json;
  if (Array.isArray(json)) return json.map((v) => fromLevelNames(v, inObjectType));
  if (!json || typeof json !== "object") return json;
  return Object.fromEntries(
    Object.entries(json).map(([k, v]) => [
      (inObjectType && RENAMED_KEYS[k]) || (RENAMED_VALUES[k] ?? k),
      fromLevelNames(v, k === "objectTypes"),
    ]),
  );
}

export function readMetamodel(text: string): MetamodelFile {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("The file is not JSON");
  }
  if (!json || typeof json !== "object" || Array.isArray(json)) throw new Error("The file is not a metamodel");
  const value = fromLevelNames(json) as Record<string, unknown>;
  const pkg = (value.package ?? value.metamodel ?? (Array.isArray(value.objectTypes) ? value : undefined)) as
    Record<string, unknown> | undefined;
  if (!pkg || typeof pkg !== "object") throw new Error("The file has no metamodel package");
  const diagramTypes = (value.diagramTypes ?? []) as DiagramType[];
  if (!Array.isArray(diagramTypes)) throw new Error("diagramTypes is not a list");
  const file: MetamodelFile = {
    package: { version: "1.0.0", ...pkg } as unknown as MetamodelPackage,
    diagramTypes,
  };
  const checked = validatePackage(file.package);
  const problems = [
    ...(checked.ok ? [] : checked.errors),
    ...diagramTypes.flatMap((d) => {
      const r = validateDiagramType(d);
      return r.ok ? [] : r.errors.map((e) => `Diagram type ${d.key}: ${e}`);
    }),
  ];
  if (problems.length === 0) problems.push(...compileDraft(file).problems);
  if (problems.length > 0) throw new Error(problems.slice(0, 5).join("; "));
  return file;
}

/** An imported metamodel as the draft of a published one: it keeps the published version, which publishing raises. */
export const importAsDraft = (file: MetamodelFile, publishedVersion: string): Draft => ({
  package: { ...file.package, version: publishedVersion },
  diagramTypes: file.diagramTypes,
});
