// In-memory model state with secondary indexes and a rollback journal.
// The server keeps one per repository and scenario (the resolution cache in storage.md §3);
// the browser keeps one for optimistic edits. Rows are replaced, never mutated in place.
import type { Id } from "@connectome/model";
import { COLLECTIONS, type CollectionName, type Rows } from "./rows";

/** An index value; a list indexes the row under each of its values. */
type IndexKey<T> = (row: T) => string | readonly string[] | null;

const INDEXES: { [C in CollectionName]: Record<string, IndexKey<Rows[C]>> } = {
  folders: { byParent: (r) => r.parentId ?? "" },
  objects: { byFolder: (r) => r.folderId, byType: (r) => r.type },
  relationships: {
    bySource: (r) => r.sourceId,
    byTarget: (r) => r.targetId,
    byParent: (r) => r.parentId,
    byPayload: (r) => r.payload,
  },
  diagrams: { byFolder: (r) => r.folderId },
  objectOccurrences: {
    byDiagram: (r) => r.diagramId,
    byObject: (r) => r.objectId,
    byParent: (r) => r.parentOccurrenceId,
    byDrillDown: (r) => r.drillDownDiagramId,
  },
  relationshipOccurrences: {
    byDiagram: (r) => r.diagramId,
    byRelationship: (r) => r.relationshipId,
    bySource: (r) => r.sourceOccurrenceId,
    byTarget: (r) => r.targetOccurrenceId,
  },
  annotations: { byDiagram: (r) => r.diagramId, byParent: (r) => r.parentOccurrenceId },
  links: {
    bySource: (r) => r.sourceId,
    byObject: (r) => ("objectId" in r.target ? r.target.objectId : null),
    byDiagram: (r) => ("diagramId" in r.target ? r.target.diagramId : null),
  },
};

function values(value: string | readonly string[] | null): readonly string[] {
  if (value === null) return [];
  return typeof value === "string" ? [value] : value;
}

export class Collection<T extends { id: Id; deleted: boolean }> {
  private readonly rows = new Map<Id, T>();
  private readonly indexes = new Map<string, { key: IndexKey<T>; map: Map<string, Set<Id>> }>();

  constructor(indexes: Record<string, IndexKey<T>>) {
    for (const [name, key] of Object.entries(indexes)) this.indexes.set(name, { key, map: new Map() });
  }

  /** A live row (not deleted). */
  get(id: Id): T | undefined {
    const row = this.rows.get(id);
    return row && !row.deleted ? row : undefined;
  }

  /** A row, including tombstones. */
  getAny(id: Id): T | undefined {
    return this.rows.get(id);
  }

  /** Live rows whose index value equals `value`. */
  find(index: string, value: string): T[] {
    const ids = this.index(index).map.get(value);
    if (!ids) return [];
    return [...ids].map((id) => this.rows.get(id)!);
  }

  count(index: string, value: string): number {
    return this.index(index).map.get(value)?.size ?? 0;
  }

  *live(): IterableIterator<T> {
    for (const row of this.rows.values()) if (!row.deleted) yield row;
  }

  *all(): IterableIterator<T> {
    yield* this.rows.values();
  }

  get size(): number {
    return this.rows.size;
  }

  /** @internal Use ModelState.put so the change is journalled. */
  set(row: T | undefined, id: Id): void {
    const previous = this.rows.get(id);
    if (previous && !previous.deleted) this.unindex(previous);
    if (row) {
      this.rows.set(id, row);
      if (!row.deleted) this.addToIndexes(row);
    } else {
      this.rows.delete(id);
    }
  }

  private index(name: string) {
    const index = this.indexes.get(name);
    if (!index) throw new Error(`Unknown index ${name}`);
    return index;
  }

  private addToIndexes(row: T) {
    for (const { key, map } of this.indexes.values()) {
      for (const value of values(key(row))) {
        let ids = map.get(value);
        if (!ids) map.set(value, (ids = new Set()));
        ids.add(row.id);
      }
    }
  }

  private unindex(row: T) {
    for (const { key, map } of this.indexes.values()) {
      for (const value of values(key(row))) {
        const ids = map.get(value);
        ids?.delete(row.id);
        if (ids?.size === 0) map.delete(value);
      }
    }
  }
}

export interface TouchedRow<C extends CollectionName = CollectionName> {
  collection: C;
  id: Id;
  /** The row before the change; undefined when the change created it. */
  before: Rows[C] | undefined;
  /** The row after the change (deleted = true for tombstones). */
  after: Rows[C];
}

interface JournalEntry {
  collection: CollectionName;
  id: Id;
  previous: unknown;
}

export class ModelState {
  readonly folders = new Collection<Rows["folders"]>(INDEXES.folders);
  readonly objects = new Collection<Rows["objects"]>(INDEXES.objects);
  readonly relationships = new Collection<Rows["relationships"]>(INDEXES.relationships);
  readonly diagrams = new Collection<Rows["diagrams"]>(INDEXES.diagrams);
  readonly objectOccurrences = new Collection<Rows["objectOccurrences"]>(INDEXES.objectOccurrences);
  readonly relationshipOccurrences = new Collection<Rows["relationshipOccurrences"]>(INDEXES.relationshipOccurrences);
  readonly annotations = new Collection<Rows["annotations"]>(INDEXES.annotations);
  readonly links = new Collection<Rows["links"]>(INDEXES.links);

  private journal: JournalEntry[] | null = null;

  collection<C extends CollectionName>(name: C): Collection<Rows[C]> {
    return this[name] as unknown as Collection<Rows[C]>;
  }

  /** Loads stored rows without journalling (e.g. from the database). */
  load<C extends CollectionName>(name: C, rows: Iterable<Rows[C]>): void {
    if (this.journal) throw new Error("Cannot load rows during a transaction");
    const collection = this.collection(name);
    for (const row of rows) collection.set(row, row.id);
  }

  /** Writes a row. Inside a transaction the previous value is journalled so it can be rolled back. */
  put<C extends CollectionName>(name: C, row: Rows[C]): void {
    const collection = this.collection(name);
    this.journal?.push({ collection: name, id: row.id, previous: collection.getAny(row.id) });
    collection.set(row, row.id);
  }

  get inTransaction(): boolean {
    return this.journal !== null;
  }

  begin(): void {
    if (this.journal) throw new Error("A transaction is already open");
    this.journal = [];
  }

  /** Restores every row written since begin(). */
  rollback(): void {
    const journal = this.requireJournal();
    for (let i = journal.length - 1; i >= 0; i--) {
      const entry = journal[i]!;
      this.collection(entry.collection).set(entry.previous as never, entry.id);
    }
    this.journal = null;
  }

  /** Ends the transaction and returns each touched row once, in first-touch order. */
  commit(): TouchedRow[] {
    const journal = this.requireJournal();
    this.journal = null;
    const seen = new Map<string, TouchedRow>();
    for (const entry of journal) {
      const key = `${entry.collection}:${entry.id}`;
      if (!seen.has(key)) {
        seen.set(key, {
          collection: entry.collection,
          id: entry.id,
          before: entry.previous as never,
          after: undefined as never,
        });
      }
    }
    for (const touched of seen.values()) touched.after = this.collection(touched.collection).getAny(touched.id)!;
    return [...seen.values()];
  }

  /**
   * Puts the rows a committed change touched back as they were before it (removing rows it created).
   * Reverting the changes applied since a point, last first, restores the state exactly, versions included:
   * the browser uses this to take its pending changes off before applying a confirmed one (rebase).
   */
  revert(touched: readonly TouchedRow[]): void {
    if (this.journal) throw new Error("Cannot revert during a transaction");
    for (let i = touched.length - 1; i >= 0; i--) {
      const t = touched[i]!;
      this.collection(t.collection).set(t.before as never, t.id);
    }
  }

  /** A deep, independent copy (used by tests and to fork optimistic state). */
  clone(): ModelState {
    const copy = new ModelState();
    for (const name of COLLECTIONS)
      copy.load(
        name,
        [...this.collection(name).all()].map((r) => structuredClone(r)),
      );
    return copy;
  }

  private requireJournal(): JournalEntry[] {
    if (!this.journal) throw new Error("No open transaction");
    return this.journal;
  }
}
