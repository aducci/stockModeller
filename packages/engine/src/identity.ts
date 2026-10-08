// Name uniqueness per object type and duplicate relationships (design/02-model/duplicates-and-identity.md §4). Pure:
// the engine checks edits with it, and the web app asks it before offering to create an object.
import type { Id, TypeKey } from "@connectome/model";
import type { Metamodel } from "./metamodel";
import type { ObjectRow, RelationshipRow } from "./rows";
import { kinshipOf } from "./similar";
import type { ModelState } from "./state";

/** Names compare trimmed and case-insensitively (decision B8). */
export const sameName = (a: string, b: string) => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

/** An object as it would be after an edit: where it is, what it is called. */
export interface NamedPlace {
  type: TypeKey;
  name: string;
  folderId: Id;
  /** The object that contains it, if any (for `uniqueName: container`). */
  containerId: Id | null;
  /** Its semantic level (for `uniquePerLevel`). */
  level: string | undefined;
  /** The object itself, so it never clashes with its own name. */
  selfId: Id | null;
}

export interface NameClash {
  object: ObjectRow;
  /** What the type does about it: refuse the edit, or allow it with a finding. */
  enforcement: "block" | "warn";
  message: string;
}

/** The containment relationship's source holding an object, if any. */
export function containerOf(state: ModelState, metamodel: Metamodel, objectId: Id): Id | null {
  const rel = state.relationships
    .find("byTarget", objectId)
    .find((r) => metamodel.relationshipType(r.type)?.semantic === "containment");
  return rel?.sourceId ?? null;
}

/** The first live object whose name the type's policy says `place` may not repeat, or null. */
export function nameClash(state: ModelState, metamodel: Metamodel, place: NamedPlace): NameClash | null {
  const policy = metamodel.objectType(place.type);
  if (!policy || policy.uniqueName === "none" || !place.name.trim()) return null;
  // Container scope only applies inside a container: two top-level processes may share a step name.
  if (policy.uniqueName === "container" && place.containerId === null) return null;
  const candidates =
    policy.uniqueAcross === "family"
      ? [...state.objects.live()].filter((o) => kinshipOf(metamodel, place.type, o.type) !== "other")
      : state.objects.find("byType", place.type);
  const clash = candidates.find(
    (o) =>
      o.id !== place.selfId &&
      sameName(o.name, place.name) &&
      (!policy.uniquePerLevel || metamodel.objectLevel(o) === place.level) &&
      (policy.uniqueName === "repository" ||
        (policy.uniqueName === "folder" && o.folderId === place.folderId) ||
        (policy.uniqueName === "container" && containerOf(state, metamodel, o.id) === place.containerId)),
  );
  if (!clash) return null;
  const typeName = metamodel.objectType(clash.type)?.definition.name ?? clash.type;
  const where =
    policy.uniqueName === "repository"
      ? "in this repository"
      : policy.uniqueName === "folder"
        ? "in this folder"
        : `in ${state.objects.get(place.containerId!)?.name ?? "its container"}`;
  return {
    object: clash,
    enforcement: policy.onClash,
    message: `${/^[aeiou]/i.test(typeName) ? "An" : "A"} ${typeName} named "${clash.name}" already exists ${where}`,
  };
}

/**
 * Live relationships the type's `distinct` setting counts as the same as `rel`: the same type and ends, and for
 * `pairAndPayload` the same payload and interaction too.
 */
export function duplicateRelationships(
  state: ModelState,
  metamodel: Metamodel,
  rel: Pick<RelationshipRow, "id" | "type" | "sourceId" | "targetId" | "payload" | "parentId">,
): RelationshipRow[] {
  const distinct = metamodel.relationshipType(rel.type)?.distinct ?? "pair";
  if (distinct === "none") return [];
  return state.relationships
    .find("bySource", rel.sourceId)
    .filter(
      (r) =>
        r.id !== rel.id &&
        r.type === rel.type &&
        r.targetId === rel.targetId &&
        (distinct === "pair" ||
          (r.parentId === rel.parentId &&
            r.payload.length === rel.payload.length &&
            r.payload.every((p, i) => p === rel.payload[i]))),
    );
}
