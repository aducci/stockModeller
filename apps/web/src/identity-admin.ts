// Duplicates settings in metamodel administration (design/02-model/duplicates-and-identity.md §4): how unique an
// object type's names are, and what counts as a repeated relationship.
import { containerOf, nameClash, type Metamodel, type ModelState } from "@connectome/engine";
import type { ObjectType, RelationshipType, TypeKey } from "@connectome/model";
import type { Draft } from "./property-admin";

export type ObjectIdentityField = "uniqueName" | "uniqueAcross" | "uniquePerLevel" | "onClash";
export type IdentityField = ObjectIdentityField | "distinct";

export const UNIQUE_NAME_LABEL: Record<NonNullable<ObjectType["uniqueName"]>, string> = {
  none: "May repeat",
  folder: "Unique in its folder",
  container: "Unique in its container",
  repository: "Unique in the repository",
};

export const DISTINCT_LABEL: Record<NonNullable<RelationshipType["distinct"]>, string> = {
  pair: "Once between two objects",
  pairAndPayload: "Once per payload between two objects",
  none: "Any number",
};

/** Sets (or, with `undefined`, clears so the parent's or the default applies) one duplicates field of a type. */
export function setIdentityField(
  draft: Draft,
  kind: "object" | "relationship",
  type: TypeKey,
  field: IdentityField,
  value: string | boolean | undefined,
): Draft {
  const patch = <T extends object>(t: T): T => {
    const next = { ...t } as Record<string, unknown>;
    if (value === undefined) delete next[field];
    else next[field] = value;
    return next as T;
  };
  const pkg = draft.package;
  return kind === "object"
    ? { ...draft, package: { ...pkg, objectTypes: pkg.objectTypes.map((t) => (t.key === type ? patch(t) : t)) } }
    : {
        ...draft,
        package: { ...pkg, relationshipTypes: pkg.relationshipTypes.map((t) => (t.key === type ? patch(t) : t)) },
      };
}

export interface IdentityChange {
  kind: "object" | "relationship";
  type: TypeKey;
  /** The setting after the change, in words. */
  now: string;
}

/** The types whose duplicates settings a draft changes, with what they become (resolved, so inheritance counts). */
export function identityChanges(published: Metamodel, draft: Metamodel): IdentityChange[] {
  const changes: IdentityChange[] = [];
  for (const t of draft.allObjectTypes()) {
    const before = published.objectType(t.definition.key);
    const words = objectIdentityWords(draft, t.definition.key);
    if (!before || objectIdentityWords(published, t.definition.key) !== words)
      changes.push({ kind: "object", type: t.definition.key, now: words });
  }
  for (const t of draft.allRelationshipTypes()) {
    const before = published.relationshipType(t.key);
    if (!before || before.distinct !== t.distinct)
      changes.push({ kind: "relationship", type: t.key, now: DISTINCT_LABEL[t.distinct] });
  }
  return changes;
}

/** An object type's name policy in a few words: "Unique in the repository, with related types, refused". */
export function objectIdentityWords(metamodel: Metamodel, type: TypeKey): string {
  const t = metamodel.objectType(type);
  if (!t) return "";
  if (t.uniqueName === "none") return UNIQUE_NAME_LABEL.none;
  return [
    UNIQUE_NAME_LABEL[t.uniqueName],
    t.uniqueAcross === "family" ? "with related types" : null,
    t.uniquePerLevel ? null : "across levels",
    t.onClash === "warn" ? "warned" : "refused",
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * How many live objects of a type already repeat a name under a metamodel's policy. Publishing never changes them;
 * the count says what the new rule will find.
 */
export function existingRepeats(state: ModelState, metamodel: Metamodel, type: TypeKey): number {
  let count = 0;
  for (const o of state.objects.find("byType", type)) {
    const clash = nameClash(state, metamodel, {
      type,
      name: o.name,
      folderId: o.folderId,
      containerId: containerOf(state, metamodel, o.id),
      level: metamodel.objectLevel(o),
      selfId: o.id,
    });
    if (clash) count++;
  }
  return count;
}
