// A first slice of the query language (design/03-platform/queries.md): `type:` and `folder:` filters
// joined with AND. The full language (paths, properties, functions) arrives in M1; this grammar is a
// subset of it, so queries written now keep working.
import type { Metamodel, ModelState, ObjectRow } from "@connectome/engine";
import { invalid } from "./problems";

type Filter = (o: ObjectRow) => boolean;

const TERM = /^(type|folder):(?:"([^"]*)"|(\S+))$/;

function splitTerms(q: string): string[] {
  const terms: string[] = [];
  const re = /\s*((?:[a-z]+:)?(?:"[^"]*"|\S+))/g;
  for (const m of q.matchAll(re)) terms.push(m[1]!);
  return terms;
}

/** The ids of a folder and all its subfolders, found by path ("Applications/Finance"). */
function folderSubtree(state: ModelState, path: string): Set<string> {
  let parent: string | null = null;
  for (const name of path.split("/").filter(Boolean)) {
    const match: { id: string } | undefined = state.folders.find("byParent", parent ?? "").find((f) => f.name === name);
    if (!match) return new Set();
    parent = match.id;
  }
  const ids = new Set<string>();
  const queue = parent ? [parent] : [];
  while (queue.length > 0) {
    const id = queue.pop()!;
    ids.add(id);
    for (const sub of state.folders.find("byParent", id)) queue.push(sub.id);
  }
  return ids;
}

export function compileQuery(q: string, state: ModelState, metamodel: Metamodel): Filter {
  const parts = splitTerms(q.trim());
  const filters: Filter[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    if (i % 2 === 1) {
      if (part !== "AND") throw invalid(`Only AND is supported between terms until M1 (found "${part}")`);
      continue;
    }
    const m = TERM.exec(part);
    if (!m) throw invalid(`Unsupported query term "${part}": until M1, queries support type:<key> and folder:"<path>"`);
    const value = m[2] ?? m[3]!;
    if (m[1] === "type") {
      if (!metamodel.objectType(value)) throw invalid(`Unknown object type "${value}"`);
      filters.push((o) => metamodel.isA(o.type, value));
    } else {
      const folders = folderSubtree(state, value);
      filters.push((o) => folders.has(o.folderId));
    }
  }
  if (parts.length % 2 === 0 && parts.length > 0) throw invalid("A query cannot end with AND");
  return (o) => filters.every((f) => f(o));
}
