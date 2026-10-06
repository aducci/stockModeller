// Connectome — SDK for automations and panels. See 03-platform/automation.md.
// Launch: use connect() from any script, anywhere. An automation module (exports `parameters` + default `run(ctx)`)
// runs locally with runAutomation() and, later, unchanged in the hosted runtime.
// Reads are read-only snapshots; change() is the only way to write.
import type { Id, TypeKey, PropertyKey, PropertyValue, ModelObject, Relationship, Diagram, RuleFinding } from "./model";

type Snapshot<T> = Readonly<T>;

// ================================================================ parameters (rendered as a form)
export interface Param<T> { readonly __value?: T; label: string }
export declare const param: {
  text(o: { label: string; default?: string }): Param<string>;
  number(o: { label: string; default?: number; min?: number; max?: number }): Param<number>;
  date(o: { label: string; default?: string }): Param<string>;
  boolean(o: { label: string; default?: boolean }): Param<boolean>;
  choice<T extends string>(o: { label: string; options: readonly T[]; default?: T }): Param<T>;
  object(o: { label: string; query: string }): Param<Snapshot<ModelObject>>;
  optionalObject(o: { label: string; query: string }): Param<Snapshot<ModelObject> | null>;
  objects(o: { label: string; query: string; min?: number; max?: number }): Param<ReadonlyArray<Snapshot<ModelObject>>>;
  folder(o: { label: string }): Param<{ id: Id; path: string }>;
  file(o: { label: string; accept: string[] }): Param<{ name: string; bytes: Uint8Array }>;
};
type Values<P> = { [K in keyof P]: P[K] extends Param<infer T> ? T : never };

// ================================================================ reading
export interface ModelReader {
  get(id: Id): Promise<Snapshot<ModelObject> | null>;
  getByKey(type: TypeKey, key: string): Promise<Snapshot<ModelObject> | null>;
  getByExternalId(system: string, externalId: string): Promise<Snapshot<ModelObject> | null>;
  query(query: string, options?: { limit?: number; asOf?: string }): Promise<ReadonlyArray<Snapshot<ModelObject>>>;
  relationships(objectId: Id, options?: { type?: TypeKey; direction?: "out" | "in" | "both" }): Promise<ReadonlyArray<Snapshot<Relationship>>>;
  occurrences(objectId: Id): Promise<ReadonlyArray<{ diagramId: Id; diagramName: string; occurrenceId: Id }>>;
  diagram(id: Id): Promise<Snapshot<Diagram> | null>;
  folder(path: string): Promise<{ id: Id; path: string } | null>;
  aggregate(query: string, spec: { groupBy?: string; measure: { fn: "count" | "sum" | "avg" | "min" | "max"; of?: PropertyKey } }): Promise<Array<{ group: string; value: number }>>;
  findings(options?: { rule?: string; severity?: RuleFinding["severity"] }): Promise<ReadonlyArray<RuleFinding>>;
}

// ================================================================ writing (inside change() only)
export interface ChangeWriter {
  createObject(type: TypeKey, name: string, init: { folderId: Id; key?: string; description?: string; properties?: Record<PropertyKey, PropertyValue>; tags?: string[]; externalIds?: Record<string, string> }): Id;
  setProperties(id: Id, set: Record<PropertyKey, PropertyValue>): void;
  rename(id: Id, name: string): void;
  setTags(id: Id, tags: string[]): void;
  moveToFolder(id: Id, folderId: Id): void;
  deleteObject(id: Id): void;
  createRelationship(type: TypeKey, sourceId: Id, targetId: Id, properties?: Record<PropertyKey, PropertyValue>): Id;
  deleteRelationship(id: Id): void;
  /** Create or update by key or external id: the safe way to write re-runnable automations. */
  upsertObject(type: TypeKey, match: { key: string } | { externalId: [system: string, id: string] }, values: { name: string; folderId: Id; properties?: Record<PropertyKey, PropertyValue> }): Id;
  diagram: {
    create(name: string, diagramType: TypeKey, folderId: Id): Id;
    addObject(diagramId: Id, objectId: Id, at?: { x: number; y: number; w?: number; h?: number; insideOccurrenceId?: Id }): Id;
    addRelationship(diagramId: Id, relationshipId: Id): Id;
    layout(diagramId: Id, algorithm?: "nested" | "layered" | "grid" | "radial"): void;
  };
}

// ================================================================ run context
export interface Report {
  require(condition: unknown, message: string): void;    // throws: ends the run with this message
  info(message: string): void;
  warn(message: string, item?: { id: Id; name: string }): void;
  created(item: { id: Id; name: string }, note?: string): void;
  changed(item: { id: Id; name: string }, note?: string): void;
  deleted(item: { id: Id; name: string }, note?: string): void;
  attach(fileName: string, data: Uint8Array | string, mimeType: string): void;
  summary(text: string): void;
}

export interface Progress { total(n: number): void; tick(n?: number): void; message(text: string): void; readonly cancelled: boolean }

export interface AutomationContext<P> {
  params: Values<P>;
  model: ModelReader;
  change<T>(label: string, fn: (c: ChangeWriter) => T | Promise<T>, options?: { scenarioId?: Id }): Promise<T>;
  report: Report;
  progress: Progress;
  secrets: { get(name: string): Promise<string> };
  http: { fetch(url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }): Promise<{ status: number; json(): Promise<unknown>; text(): Promise<string> }> };
  xlsx: { read(bytes: Uint8Array): Promise<Array<{ sheet: string; rows: Array<Record<string, unknown>> }>>; write(sheets: Array<{ sheet: string; rows: Array<Record<string, unknown>> }>): Promise<Uint8Array> };
  run: { id: Id; preview: boolean; scenarioId: Id; trigger: "manual" | "schedule" | "onChange" | "onChangeRequest" | "webhook" };
}

// ================================================================ running anywhere (launch)
export interface Connection {
  model: ModelReader;
  change<T>(label: string, fn: (c: ChangeWriter) => T | Promise<T>, options?: { scenarioId?: Id; preview?: boolean }): Promise<T>;
}
export declare function connect(options: { url: string; token: string; repository: string; scenario?: string }): Promise<Connection>;
export declare function runAutomation<P>(
  module: { parameters: P; default: (ctx: AutomationContext<P>) => Promise<void> },
  options: { url: string; token: string; repository: string; scenario?: string; params: Values<P>; preview?: boolean },
): Promise<{ report: unknown; changeIds: Id[] }>;

// ================================================================ panels (browser, later)
export interface PanelSdk {
  model: ModelReader;
  change<T>(label: string, fn: (c: ChangeWriter) => T | Promise<T>): Promise<T>;
  on(event: "selection", handler: (ids: Id[]) => void): () => void;
  on(event: "change", handler: (e: { ids: Id[]; label: string; actor: Id }) => void, options?: { query?: string }): () => void;
  on(event: "scenario", handler: (scenarioId: Id) => void): () => void;
  on(event: "visibility", handler: (visible: boolean) => void): () => void;
  workbench: {
    select(ids: Id[]): void;
    openDiagram(id: Id, options?: { focusObjectId?: Id }): void;
    toast(message: string, kind?: "info" | "success" | "warning" | "error"): void;
    setTitle(title: string): void;
  };
  state: { get<T>(key: string): Promise<T | undefined>; set<T>(key: string, value: T): Promise<void> };
}
