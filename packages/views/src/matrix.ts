// The matrix view (views-and-design-artifacts.md §4): rows and columns of objects, a cell per pair showing the
// relationships between them, and what a click on an empty cell may create.
import type { DiagramType, Id, MatrixDefinition, TypeKey } from "@connectome/model";
import type { Metamodel, ModelState, ObjectRow, RelationshipRow } from "@connectome/engine";
import { evaluateScope, matchesRelationship } from "./scope";

/** Used when neither the diagram nor its type says anything. */
export const EMPTY_MATRIX: MatrixDefinition = {
  rows: { from: {} },
  columns: { from: {} },
  relationships: { dir: "rowToColumn" },
};

/** A matrix's definition: the diagram's own keys over its type's `matrix`, over the empty matrix. */
export function matrixDefinition(type: DiagramType | undefined, own: Record<string, unknown> | undefined) {
  return { ...EMPTY_MATRIX, ...type?.matrix, ...own } as MatrixDefinition;
}

export interface MatrixAxisItem {
  object: ObjectRow;
  /** Nesting depth when rows are grouped by containment; 0 otherwise. */
  depth: number;
  /** Whether other items in the axis sit inside this one. */
  hasChildren: boolean;
}

/** One relationship type a click on an empty cell would create, and which way it would run. */
export interface CellOption {
  type: TypeKey;
  name: string;
  sourceId: Id;
  targetId: Id;
}

export interface MatrixModel {
  definition: MatrixDefinition;
  rows: MatrixAxisItem[];
  columns: MatrixAxisItem[];
  /** The relationships a cell shows, in creation order. */
  cell(rowId: Id, columnId: Id): RelationshipRow[];
  rowTotal(rowId: Id): number;
  columnTotal(columnId: Id): number;
  /** The relationship types a click could create for this pair, empty when the rules allow none. */
  options(rowId: Id, columnId: Id): CellOption[];
}

const key = (rowId: Id, columnId: Id) => `${rowId}|${columnId}`;

/** Rows nested under their containers when both are rows (depth-first, keeping the scope's order). */
function grouped(state: ModelState, metamodel: Metamodel, objects: ObjectRow[]): MatrixAxisItem[] {
  const inAxis = new Set(objects.map((o) => o.id));
  const parentOf = new Map<Id, Id>();
  for (const o of objects) {
    const holder = state.relationships
      .find("byTarget", o.id)
      .find((r) => metamodel.relationshipType(r.type)?.semantic === "containment" && inAxis.has(r.sourceId));
    if (holder && holder.sourceId !== o.id) parentOf.set(o.id, holder.sourceId);
  }
  const children = new Map<Id, ObjectRow[]>();
  for (const o of objects) {
    const p = parentOf.get(o.id);
    if (p) children.set(p, [...(children.get(p) ?? []), o]);
  }
  const out: MatrixAxisItem[] = [];
  const seen = new Set<Id>();
  const visit = (o: ObjectRow, depth: number) => {
    if (seen.has(o.id)) return; // containment is acyclic, but never loop on bad data
    seen.add(o.id);
    const kids = children.get(o.id) ?? [];
    out.push({ object: o, depth, hasChildren: kids.length > 0 });
    for (const k of kids) visit(k, depth + 1);
  };
  for (const o of objects) if (!parentOf.has(o.id)) visit(o, 0);
  return out;
}

const flat = (objects: ObjectRow[]): MatrixAxisItem[] =>
  objects.map((object) => ({ object, depth: 0, hasChildren: false }));

export function projectMatrix(state: ModelState, metamodel: Metamodel, definition: MatrixDefinition): MatrixModel {
  const rowObjects = evaluateScope(state, metamodel, definition.rows);
  const columnObjects = evaluateScope(state, metamodel, definition.columns);
  const rowIds = new Set(rowObjects.map((o) => o.id));
  const columnIds = new Set(columnObjects.map((o) => o.id));
  const dir = definition.relationships.dir ?? "rowToColumn";
  const by = { type: definition.relationships.types, kind: definition.relationships.kinds };

  const cells = new Map<string, RelationshipRow[]>();
  const rowTotals = new Map<Id, number>();
  const columnTotals = new Map<Id, number>();
  const put = (rowId: Id, columnId: Id, r: RelationshipRow) => {
    const k = key(rowId, columnId);
    const list = cells.get(k) ?? [];
    if (list.some((x) => x.id === r.id)) return; // an object in both axes with a relationship to itself
    cells.set(k, [...list, r]);
    rowTotals.set(rowId, (rowTotals.get(rowId) ?? 0) + 1);
    columnTotals.set(columnId, (columnTotals.get(columnId) ?? 0) + 1);
  };
  for (const row of rowObjects) {
    if (dir !== "columnToRow")
      for (const r of state.relationships.find("bySource", row.id))
        if (columnIds.has(r.targetId) && matchesRelationship(metamodel, r, by)) put(row.id, r.targetId, r);
    if (dir !== "rowToColumn")
      for (const r of state.relationships.find("byTarget", row.id))
        if (columnIds.has(r.sourceId) && matchesRelationship(metamodel, r, by)) put(row.id, r.sourceId, r);
  }

  let rows = definition.groupRows ? grouped(state, metamodel, rowObjects) : flat(rowObjects);
  let columns = flat(columnObjects);
  if (definition.hideEmpty) {
    // Keep a container row when something inside it has relationships, so the grouping still reads.
    const keep = new Set<Id>();
    const stack: MatrixAxisItem[] = [];
    for (const item of rows) {
      while (stack.length > item.depth) stack.pop();
      if (rowTotals.get(item.object.id)) {
        keep.add(item.object.id);
        for (const a of stack) keep.add(a.object.id);
      }
      stack.push(item);
    }
    rows = rows.filter((i) => keep.has(i.object.id));
    columns = columns.filter((i) => columnTotals.get(i.object.id));
  }

  const candidates = (): TypeKey[] => {
    if (definition.create) return [definition.create];
    const all = metamodel.allRelationshipTypes();
    return all
      .filter(
        (t) =>
          (definition.relationships.types?.includes(t.key) ?? false) ||
          (definition.relationships.kinds?.includes(t.semantic) ?? false) ||
          (!definition.relationships.types?.length && !definition.relationships.kinds?.length),
      )
      .map((t) => t.key);
  };
  const types = candidates();

  return {
    definition,
    rows,
    columns,
    cell: (rowId, columnId) => cells.get(key(rowId, columnId)) ?? [],
    rowTotal: (rowId) => rowTotals.get(rowId) ?? 0,
    columnTotal: (columnId) => columnTotals.get(columnId) ?? 0,
    options(rowId, columnId) {
      if (!rowIds.has(rowId) || !columnIds.has(columnId) || rowId === columnId) return [];
      const row = state.objects.get(rowId)!;
      const column = state.objects.get(columnId)!;
      const ways: [ObjectRow, ObjectRow][] =
        dir === "rowToColumn"
          ? [[row, column]]
          : dir === "columnToRow"
            ? [[column, row]]
            : [
                [row, column],
                [column, row],
              ];
      const out: CellOption[] = [];
      for (const [source, target] of ways) {
        for (const t of metamodel.allowedRelationshipTypes(source.type, target.type)) {
          if (!types.includes(t.key) || out.some((o) => o.type === t.key)) continue;
          out.push({ type: t.key, name: t.verb, sourceId: source.id, targetId: target.id });
        }
      }
      return out;
    },
  };
}
