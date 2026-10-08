// The find-or-create box (design/02-model/duplicates-and-identity.md §5): wherever a new object is named, the
// objects it may already be are offered first, and reusing an exact match is the default.
import { findSimilarObjects, type Metamodel, type ModelState, type SimilarObject } from "@connectome/engine";
import type { Id, TypeKey } from "@connectome/model";

export interface FindOrCreateOptions {
  matches: SimilarObject[];
  /** Why the name cannot be created (the type refuses a second object with that name here), or null. */
  refused: string | null;
  /** The option Enter takes: a match's index, or `matches.length` for "create". */
  defaultIndex: number;
}

/** The engine's own clash test (decision B8: exactly the type, case-insensitive). */
const sameName = (a: string, b: string) => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

/** What to offer for a name typed for a new object of `type` that would go into `folderId`. */
export function findOrCreateOptions(
  state: ModelState,
  metamodel: Metamodel,
  name: string,
  type: TypeKey,
  folderId: Id | null,
): FindOrCreateOptions {
  const matches = name.trim() ? findSimilarObjects(state, metamodel, { name, type, limit: 6 }) : [];
  const objectType = metamodel.objectType(type);
  const scope = objectType?.uniqueName ?? "none";
  let refused: string | null = null;
  if (scope !== "none" && name.trim()) {
    const clash = state.objects
      .find("byType", type)
      .find((o) => sameName(o.name, name) && (scope === "repository" || o.folderId === folderId));
    if (clash) {
      const where = scope === "repository" ? "in this repository" : "in this folder";
      const typeName = objectType!.definition.name;
      refused = `${/^[aeiou]/i.test(typeName) ? "An" : "A"} ${typeName} named “${clash.name}” already exists ${where}`;
    }
  }
  const exact = matches.findIndex((m) => m.exact);
  return { matches, refused, defaultIndex: exact >= 0 ? exact : refused ? 0 : matches.length };
}
