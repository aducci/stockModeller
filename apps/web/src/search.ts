// Search instead of lists (design/02-model/views-and-design-artifacts.md §13): picking an element or a diagram from
// the whole repository by typing part of its name. Pure, so it can be tested on its own.
import type { DiagramRow, Metamodel, ModelState, ObjectRow } from "@connectome/engine";
import type { Id } from "@connectome/model";
import { folderPath } from "./text";

export type Found =
  | { kind: "object"; id: Id; name: string; what: string; where: string; object: ObjectRow }
  | { kind: "diagram"; id: Id; name: string; what: string; where: string; diagram: DiagramRow };

export interface SearchScope {
  /** Elements that may be picked; absent = none. */
  objects?: (o: ObjectRow) => boolean;
  /** Diagrams (of any kind) that may be picked; absent = none. */
  diagrams?: (d: DiagramRow) => boolean;
  /** The folder of the item the pick is for: its neighbours are offered before anything is typed, and rank first. */
  nearFolderId?: Id | null;
  limit?: number;
}

/** The most matches shown, and how many neighbours are offered before anything is typed. */
export const SEARCH_LIMIT = 20;
export const NEAR_LIMIT = 8;

const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase();

/** 0: the name starts with the query, 1: a word does, 2: it is anywhere in the name; null: no match. */
function score(name: string, query: string): number | null {
  const n = fold(name);
  if (n.startsWith(query)) return 0;
  const at = n.indexOf(query);
  if (at < 0) return null;
  return n.split(/[\s\-_/.()]+/).some((w) => w.startsWith(query)) ? 1 : 2;
}

/**
 * The elements and diagrams in scope whose name matches `query`, best first: a match at the start of the name, then
 * at the start of a word, then anywhere; neighbours (same folder) before others, then by name. With nothing typed,
 * only the neighbours, a few of them.
 */
export function search(state: ModelState, metamodel: Metamodel, query: string, scope: SearchScope): Found[] {
  const q = fold(query.trim());
  const near = scope.nearFolderId ?? null;
  const ranked: { found: Found; rank: number }[] = [];
  const consider = (found: Found, folderId: Id) => {
    const nearby = near !== null && folderId === near ? 0 : 1;
    if (!q) {
      if (nearby === 0) ranked.push({ found, rank: 0 });
      return;
    }
    const s = score(found.name, q);
    if (s !== null) ranked.push({ found, rank: s * 2 + nearby });
  };
  const where = (folderId: Id) => folderPath(state, folderId).join(" / ");
  if (scope.objects)
    for (const o of state.objects.live())
      if (scope.objects(o))
        consider(
          {
            kind: "object",
            id: o.id,
            name: o.name,
            what: metamodel.objectType(o.type)?.definition.name ?? o.type,
            where: where(o.folderId),
            object: o,
          },
          o.folderId,
        );
  if (scope.diagrams)
    for (const d of state.diagrams.live())
      if (scope.diagrams(d))
        consider(
          {
            kind: "diagram",
            id: d.id,
            name: d.name,
            what: metamodel.diagramType(d.diagramType)?.definition.name ?? d.diagramType,
            where: where(d.folderId),
            diagram: d,
          },
          d.folderId,
        );
  ranked.sort((a, b) => a.rank - b.rank || a.found.name.localeCompare(b.found.name));
  return ranked.slice(0, q ? (scope.limit ?? SEARCH_LIMIT) : NEAR_LIMIT).map((r) => r.found);
}
