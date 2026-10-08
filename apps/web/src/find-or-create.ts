// The find-or-create box (design/02-model/duplicates-and-identity.md §5): wherever a new object is named, the
// objects it may already be are offered first, and reusing an exact match is the default.
import { findSimilarObjects, nameClash, type Metamodel, type ModelState, type SimilarObject } from "@connectome/engine";
import type { Id, TypeKey } from "@connectome/model";

export interface FindOrCreateOptions {
  matches: SimilarObject[];
  /** Why the name cannot be created (the type refuses a second object with that name here), or null. */
  refused: string | null;
  /** The type allows a repeat of this name but discourages it (`onClash: warn`), or null. */
  warning: string | null;
  /** The option Enter takes: a match's index, or `matches.length` for "create". */
  defaultIndex: number;
}

/** What to offer for a name typed for a new object of `type` that would go into `folderId`. */
export function findOrCreateOptions(
  state: ModelState,
  metamodel: Metamodel,
  name: string,
  type: TypeKey,
  folderId: Id | null,
): FindOrCreateOptions {
  const matches = name.trim() ? findSimilarObjects(state, metamodel, { name, type, limit: 6 }) : [];
  // The engine's own test: a new object has no container yet, and the type's default level.
  const clash =
    folderId === null
      ? null
      : nameClash(state, metamodel, {
          type,
          name,
          folderId,
          containerId: null,
          level: metamodel.objectLevel({ type, properties: {} }),
          selfId: null,
        });
  const refused = clash?.enforcement === "block" ? clash.message : null;
  const warning = clash?.enforcement === "warn" ? clash.message : null;
  const exact = matches.findIndex((m) => m.exact);
  return { matches, refused, warning, defaultIndex: exact >= 0 ? exact : refused ? 0 : matches.length };
}
