// The change engine: applies one change atomically, enforcing the essential rules of design/02-model/overview.md §3
// and the per-property concurrency rules of design/03-platform/collaboration-and-changes.md §2.
// Pure: no I/O. The same code runs on the server (inside a database transaction) and in the browser (optimistically).
import {
  LEVEL_PROPERTY,
  MAX_EDITS_PER_CHANGE,
  type Actor,
  type Annotation,
  type Change,
  type DiagramEdit,
  type Edit,
  type Id,
  type LogEntry,
  type ModelEdit,
  type ObjectOccurrence,
  type PropertyValue,
  type Rejection,
  type RelationshipOccurrence,
  type RuleFinding,
  type StylePatch,
  type TypeKey,
} from "@connectome/model";
import type { Metamodel, ResolvedDiagramType, ResolvedObjectType, ResolvedRelationshipType } from "./metamodel";
import { checkValue } from "./properties";
import type {
  AnnotationRow,
  CollectionName,
  DiagramRow,
  FieldStamp,
  FolderRow,
  ObjectOccurrenceRow,
  ObjectRow,
  RelationshipOccurrenceRow,
  RelationshipRow,
  Rows,
  VersionedCollection,
} from "./rows";
import type { ModelState, TouchedRow } from "./state";

export interface ApplyContext {
  metamodel: Metamodel;
  actor: Actor;
  /** The scenario the change is written to. Folders are shared by all scenarios, so deleting one needs the baseline. */
  scenario: { id: Id; isBaseline: boolean };
  /** Commit time (ISO 8601); defaults to now. */
  now?: string;
  /** Permission hook: return the scope that forbids the edit, or null to allow it. */
  authorize?: (edit: Edit, index: number) => string | null;
}

export type ApplyResult =
  | {
      ok: true;
      log: LogEntry[];
      /** New version of every versioned item the change touched. */
      versions: Record<Id, number>;
      /** Warnings from `warn` rules; they never block a change. */
      findings: RuleFinding[];
      touched: TouchedRow[];
    }
  | { ok: false; reasons: Rejection[] };

/**
 * Applies a change to the state: all edits or none. On success the state holds the result and the
 * returned log carries one inverse per edit; on rejection the state is unchanged.
 */
export function applyChange(state: ModelState, change: Change, ctx: ApplyContext): ApplyResult {
  if (change.edits.length === 0 || change.edits.length > MAX_EDITS_PER_CHANGE) {
    const message = `A change has 1 to ${MAX_EDITS_PER_CHANGE} edits`;
    return { ok: false, reasons: [{ code: "invalid", editIndex: 0, property: "edits", message }] };
  }
  if (change.scenarioId !== ctx.scenario.id) {
    const message = "The change is for a different scenario";
    return { ok: false, reasons: [{ code: "invalid", editIndex: 0, property: "scenarioId", message }] };
  }

  state.begin();
  try {
    const tx = new Transaction(state, ctx);
    change.edits.forEach((edit, index) => tx.apply(edit, index));
    const { log, versions, findings } = tx.finish();
    return { ok: true, log, versions, findings, touched: state.commit() };
  } catch (error) {
    state.rollback();
    if (error instanceof Reject) return { ok: false, reasons: [error.rejection] };
    throw error;
  }
}

/** The edits that undo a committed change: each entry's inverse, last edit first. */
export function invertLog(log: readonly LogEntry[]): Edit[] {
  return [...log].reverse().flatMap((entry) => entry.inverse);
}

// ==================================================================================== internals

class Reject extends Error {
  constructor(readonly rejection: Rejection) {
    super(rejection.code);
  }
}

const MAX_NAME = 200;
const VERSIONED: ReadonlySet<CollectionName> = new Set<VersionedCollection>(["objects", "relationships", "diagrams"]);
const SYMBOL_STYLE_KEYS = new Set(["shape", "fill", "stroke", "icon", "width", "height", "label"]);
const LINE_STYLE_KEYS = new Set(["style", "color", "startArrow", "endArrow"]);
/** A placeholder replaced by the item's final version when the change finishes. */
const PENDING_VERSION = -1;

const sameName = (a: string, b: string) => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

function stripMeta<T extends { deleted: boolean; scenarioId?: Id; baseVersion?: number | null }>(row: T) {
  const { deleted: _d, scenarioId: _s, baseVersion: _b, ...rest } = row;
  return rest;
}

function toObjectOccurrence(row: ObjectOccurrenceRow): ObjectOccurrence {
  const { diagramId: _diagramId, ...rest } = stripMeta(row);
  return rest;
}

function toRelationshipOccurrence(row: RelationshipOccurrenceRow): RelationshipOccurrence {
  const { diagramId: _diagramId, ...rest } = stripMeta(row);
  return rest;
}

function toAnnotation(row: AnnotationRow): Annotation {
  const { diagramId: _diagramId, ...rest } = stripMeta(row);
  return rest;
}

class Transaction {
  private readonly mm: Metamodel;
  private index = 0;
  private steps: Edit[][] = [];
  private readonly log: LogEntry[] = [];
  private readonly findings: RuleFinding[] = [];
  /** Versioned items touched by this change: their row when the change started (undefined if new). */
  private readonly startRows = new Map<string, Rows[VersionedCollection] | undefined>();
  private readonly changedFields = new Map<string, Set<string>>();

  constructor(
    private readonly state: ModelState,
    private readonly ctx: ApplyContext,
  ) {
    this.mm = ctx.metamodel;
  }

  apply(edit: Edit, index: number): void {
    this.index = index;
    this.steps = [];
    const forbidden = this.ctx.authorize?.(edit, index);
    if (forbidden) this.reject({ code: "forbidden", editIndex: index, scope: forbidden });
    const itemId = this.dispatch(edit);
    this.log.push({ editIndex: index, itemId, edit, inverse: this.steps.reverse().flat() });
  }

  finish(): { log: LogEntry[]; versions: Record<Id, number>; findings: RuleFinding[] } {
    const versions: Record<Id, number> = {};
    const now = this.ctx.now ?? new Date().toISOString();
    for (const [key, start] of this.startRows) {
      const [collection, id] = splitKey(key);
      const row = this.state.collection(collection).getAny(id)!;
      const version = (start?.version ?? 0) + 1;
      const stamp: FieldStamp = { v: version, by: this.ctx.actor.id };
      const fields = this.changedFields.get(key) ?? new Set<string>();
      const fieldVersions = fields.has("*")
        ? { "*": stamp }
        : { ...row.fieldVersions, ...Object.fromEntries([...fields].map((f) => [f, stamp])) };
      const audit = collection === "diagrams" ? {} : { updatedAt: now, updatedBy: this.ctx.actor.id };
      this.state.put(collection, { ...row, ...audit, version, fieldVersions } as never);
      versions[id] = version;
    }
    for (const entry of this.log) {
      for (const inverse of entry.inverse) {
        if ("baseVersion" in inverse && inverse.baseVersion === PENDING_VERSION) {
          const version = versions[inverse.id];
          if (version === undefined) throw new Error(`No final version for ${inverse.id}`);
          inverse.baseVersion = version;
        }
      }
    }
    return { log: this.log, versions, findings: this.findings };
  }

  // ------------------------------------------------------------------ dispatch

  private dispatch(edit: Edit): Id | null {
    switch (edit.edit) {
      case "createObject":
        return this.createObject(edit);
      case "setProperties":
        return this.setProperties(edit);
      case "renameObject":
        return this.renameObject(edit);
      case "setTags":
        return this.setTags(edit);
      case "moveToFolder":
        return this.moveToFolder(edit);
      case "changeObjectType":
        return this.changeObjectType(edit);
      case "deleteObject":
        return this.deleteObjectEdit(edit);
      case "createRelationship":
        return this.createRelationship(edit);
      case "reconnectRelationship":
        return this.reconnectRelationship(edit);
      case "changeRelationshipType":
        return this.changeRelationshipType(edit);
      case "setPayload":
        return this.setPayload(edit);
      case "deleteRelationship":
        return this.deleteRelationshipEdit(edit);
      case "createFolder":
        return this.createFolder(edit);
      case "renameFolder":
        return this.renameFolder(edit);
      case "moveFolder":
        return this.moveFolder(edit);
      case "deleteFolder":
        return this.deleteFolderEdit(edit);
      case "createDiagram":
        return this.createDiagram(edit);
      case "updateDiagram":
        return this.updateDiagram(edit);
      case "deleteDiagram":
        return this.deleteDiagramEdit(edit);
      case "addObjectOccurrence":
        return this.addObjectOccurrence(edit);
      case "moveObjectOccurrence":
        return this.moveObjectOccurrence(edit);
      case "styleOccurrence":
        return this.styleOccurrence(edit);
      case "removeOccurrence":
        return this.removeOccurrence(edit);
      case "addRelationshipOccurrence":
        return this.addRelationshipOccurrence(edit);
      case "routeRelationshipOccurrence":
        return this.routeRelationshipOccurrence(edit);
      case "addAnnotation":
        return this.addAnnotation(edit);
      case "updateAnnotation":
        return this.updateAnnotation(edit);
      case "removeAnnotation":
        return this.removeAnnotation(edit);
    }
  }

  // ------------------------------------------------------------------ objects

  private createObject(e: Extract<ModelEdit, { edit: "createObject" }>): Id {
    this.requireNewId("objects", e.id);
    const type = this.instantiableType(e.type, "type");
    this.checkName(e.name);
    this.refLive("folders", e.folderId, "folderId");
    this.checkUniqueName(e.type, e.name, e.folderId, e.id);
    const properties = this.checkProperties(type.properties, {}, e.properties ?? {}, "properties");
    this.checkLevel(type, e.properties ?? {});
    const key = e.key ?? this.nextKey(e.type, type.keyPattern);
    if (key !== null) this.checkUniqueKey(e.type, key, e.id);

    const tombstone = this.state.objects.getAny(e.id);
    this.write("objects", {
      id: e.id,
      type: e.type,
      name: e.name,
      key,
      folderId: e.folderId,
      description: e.description ?? "",
      properties,
      tags: this.checkTags(e.tags ?? []),
      externalIds: e.externalIds ?? {},
      version: tombstone?.version ?? 0,
      fieldVersions: {},
      deleted: false,
      updatedAt: null,
      updatedBy: null,
      ...this.meta(tombstone),
    });
    this.markChanged("objects", e.id, ["*"]);
    this.step({ edit: "deleteObject", id: e.id, baseVersion: PENDING_VERSION });
    return e.id;
  }

  private setProperties(e: Extract<ModelEdit, { edit: "setProperties" }>): Id {
    const obj = this.requireLive("objects", e.id);
    const fields = Object.keys(e.set).map((k) => `properties.${k}`);
    this.checkBase("objects", obj, e.baseVersion, fields);
    const allowed = this.mm.objectType(obj.type)?.properties ?? new Set<string>();
    const properties = this.checkProperties(allowed, obj.properties, e.set, "properties");
    const type = this.mm.objectType(obj.type);
    if (type) this.checkLevel(type, e.set);
    const previous = Object.fromEntries(Object.keys(e.set).map((k) => [k, obj.properties[k] ?? null]));
    this.write("objects", { ...obj, properties });
    this.markChanged("objects", obj.id, fields);
    this.step({ edit: "setProperties", id: obj.id, baseVersion: PENDING_VERSION, set: previous });
    return obj.id;
  }

  private renameObject(e: Extract<ModelEdit, { edit: "renameObject" }>): Id {
    const obj = this.requireLive("objects", e.id);
    this.checkBase("objects", obj, e.baseVersion, ["name"]);
    this.checkName(e.name);
    this.checkUniqueName(obj.type, e.name, obj.folderId, obj.id);
    this.write("objects", { ...obj, name: e.name });
    this.markChanged("objects", obj.id, ["name"]);
    this.step({ edit: "renameObject", id: obj.id, baseVersion: PENDING_VERSION, name: obj.name });
    return obj.id;
  }

  private setTags(e: Extract<ModelEdit, { edit: "setTags" }>): Id {
    const obj = this.requireLive("objects", e.id);
    this.checkBase("objects", obj, e.baseVersion, ["tags"]);
    this.write("objects", { ...obj, tags: this.checkTags(e.tags) });
    this.markChanged("objects", obj.id, ["tags"]);
    this.step({ edit: "setTags", id: obj.id, baseVersion: PENDING_VERSION, tags: obj.tags });
    return obj.id;
  }

  private moveToFolder(e: Extract<ModelEdit, { edit: "moveToFolder" }>): Id {
    const obj = this.requireLive("objects", e.id);
    this.checkBase("objects", obj, e.baseVersion, ["folderId"]);
    this.refLive("folders", e.folderId, "folderId");
    // Folder follows container (design/02-model/semantics.md §3): contents move with their container only.
    const container = this.containerRelationship(obj.id);
    const parent = container && this.state.objects.get(container.sourceId)!;
    if (parent && parent.folderId !== e.folderId) {
      this.invalid("folderId", `${obj.name} is part of ${parent.name}, so it stays in its folder; take it out first`);
    }
    this.relocate(obj, e.folderId, true);
    return obj.id;
  }

  private changeObjectType(e: Extract<ModelEdit, { edit: "changeObjectType" }>): Id {
    const obj = this.requireLive("objects", e.id);
    const fields = ["type", ...Object.keys(obj.properties).map((k) => `properties.${k}`)];
    this.checkBase("objects", obj, e.baseVersion, fields);
    const type = this.instantiableType(e.type, "type");

    // Carry values over (renamed through propertyMap); values the new type cannot hold are dropped.
    const properties: Record<string, PropertyValue> = {};
    const reverseMap: Record<string, string> = {};
    const dropped: Record<string, PropertyValue> = {};
    for (const [from, value] of Object.entries(obj.properties)) {
      const to = e.propertyMap?.[from] ?? from;
      // A fixed level is the type's, never a carried-over value.
      const fixedLevel = to === LEVEL_PROPERTY && type.levelFixed;
      if (type.properties.has(to) && !(to in properties) && !fixedLevel) {
        const pt = this.mm.propertyType(to)!;
        const problem = pt.dataType === "calculated" ? null : checkValue(pt, value, this.valueContext());
        if (problem) this.invalid(`properties.${to}`, `${pt.name} ${problem} (from ${from})`);
        properties[to] = value;
        if (to !== from) reverseMap[to] = from;
      } else {
        dropped[from] = value;
      }
    }
    if (obj.key !== null) this.checkUniqueKey(e.type, obj.key, obj.id);
    this.checkUniqueName(e.type, obj.name, obj.folderId, obj.id);

    for (const rel of this.relationshipsOf(obj.id)) {
      const source = rel.sourceId === obj.id ? e.type : this.state.objects.get(rel.sourceId)!.type;
      const target = rel.targetId === obj.id ? e.type : this.state.objects.get(rel.targetId)!.type;
      this.checkRelationshipRules(rel.type, source, target, rel.sourceId, rel.id);
    }
    for (const occ of this.state.objectOccurrences.find("byObject", obj.id)) {
      const diagram = this.state.diagrams.get(occ.diagramId)!;
      const dt = this.mm.diagramType(diagram.diagramType);
      if (dt && !this.mm.diagramAllowsObjectType(dt, e.type)) {
        this.invalid(
          "type",
          `${obj.name} occurs on "${diagram.name}", whose diagram type does not show ${type.definition.name}`,
        );
      }
    }

    this.write("objects", { ...obj, type: e.type, properties });
    this.markChanged("objects", obj.id, [...fields, ...Object.keys(properties).map((k) => `properties.${k}`)]);
    const inverse: Edit[] = [
      { edit: "changeObjectType", id: obj.id, baseVersion: PENDING_VERSION, type: obj.type, propertyMap: reverseMap },
    ];
    if (Object.keys(dropped).length > 0) {
      inverse.push({ edit: "setProperties", id: obj.id, baseVersion: PENDING_VERSION, set: dropped });
    }
    this.step(...inverse);
    return obj.id;
  }

  private deleteObjectEdit(e: Extract<ModelEdit, { edit: "deleteObject" }>): Id {
    const obj = this.requireLive("objects", e.id);
    this.checkBase("objects", obj, e.baseVersion, ["*"]);
    this.deleteObject(obj, e.contents ?? "moveUp");
    return obj.id;
  }

  /**
   * Deletes an object, its relationships and all its occurrences (rule 7). Its contents move up to its own container
   * (when the rules allow) or are deleted too; parts through a cascading composition are deleted (semantics.md §7).
   */
  private deleteObject(obj: ObjectRow, contents: "moveUp" | "deleteContents"): void {
    const container = this.containerRelationship(obj.id);
    const grandparent = container && this.state.objects.get(container.sourceId)!;
    for (const rel of this.contentRelationships(obj.id)) {
      const child = this.state.objects.get(rel.targetId);
      if (!child) continue;
      if (contents === "deleteContents") this.deleteObject(child, contents);
      else if (grandparent && this.mm.matchingRules(rel.type, grandparent.type, child.type).length > 0) {
        this.reconnect(rel, grandparent.id, rel.targetId, ["sourceId"], { sourceId: rel.sourceId });
      }
      // Otherwise the relationship goes with the object below and the child stays at the top of its folder.
    }
    for (const rel of this.state.relationships.find("bySource", obj.id)) {
      const type = this.mm.relationshipType(rel.type);
      const part = this.state.objects.get(rel.targetId);
      if (type?.semantic === "composition" && type.cascadeDelete && part) this.deleteObject(part, contents);
    }
    // It is no longer carried by anything (semantics.md §5).
    for (const rel of this.state.relationships.find("byPayload", obj.id)) {
      this.writePayload(
        rel,
        rel.payload.filter((id) => id !== obj.id),
      );
    }
    for (const occ of this.state.objectOccurrences.find("byObject", obj.id)) this.removeObjectOccurrence(occ);
    for (const rel of this.relationshipsOf(obj.id)) {
      // Deleting an interaction has already deleted its messages.
      const live = this.state.relationships.get(rel.id);
      if (live) this.deleteRelationship(live);
    }
    const current = this.state.objects.get(obj.id)!;
    this.write("objects", { ...current, deleted: true });
    this.markChanged("objects", obj.id, ["*"]);
    this.step({
      edit: "createObject",
      id: current.id,
      type: current.type,
      name: current.name,
      folderId: current.folderId,
      ...(current.key !== null ? { key: current.key } : {}),
      description: current.description,
      properties: this.storedProperties(current),
      tags: current.tags,
      externalIds: current.externalIds,
    });
  }

  // ------------------------------------------------------------------ relationships

  private createRelationship(e: Extract<ModelEdit, { edit: "createRelationship" }>): Id {
    this.requireNewId("relationships", e.id);
    const type = this.mm.relationshipType(e.type);
    if (!type) this.invalid("type", `Unknown relationship type "${e.type}"`);
    const source = this.refLive("objects", e.sourceId, "sourceId");
    const target = this.refLive("objects", e.targetId, "targetId");
    if (source.id === target.id) this.invalid("targetId", "A relationship connects two different objects");
    if (e.name !== undefined && e.name.length > MAX_NAME)
      this.invalid("name", `Names have at most ${MAX_NAME} characters`);
    const properties = this.checkProperties(
      this.mm.relationshipTypeProperties(e.type),
      {},
      e.properties ?? {},
      "properties",
    );
    this.checkRelationshipRules(e.type, source.type, target.type, source.id, e.id);
    this.checkNesting(e.type, source.id, target.id, e.id);
    const payload = this.checkPayload(type, e.payload ?? [], "payload");
    const parentId = e.parentId ?? null;
    let rank = e.rank ?? 0;
    if (parentId !== null) {
      this.checkMessage(type, parentId, source.id, target.id, "parentId");
      if (e.rank === undefined) {
        const ranks = this.messagesOf(parentId).map((m) => m.rank);
        rank = ranks.length > 0 ? Math.max(...ranks) + 1 : 0;
      }
    }

    const tombstone = this.state.relationships.getAny(e.id);
    this.write("relationships", {
      id: e.id,
      type: e.type,
      sourceId: e.sourceId,
      targetId: e.targetId,
      name: e.name ?? "",
      properties,
      tags: this.checkTags(e.tags ?? []),
      externalIds: e.externalIds ?? {},
      derivedBy: null,
      payload,
      parentId,
      rank,
      version: tombstone?.version ?? 0,
      fieldVersions: {},
      deleted: false,
      updatedAt: null,
      updatedBy: null,
      ...this.meta(tombstone),
    });
    this.markChanged("relationships", e.id, ["*"]);
    if (type.semantic === "containment") this.relocate(target, source.folderId);
    this.step({ edit: "deleteRelationship", id: e.id, baseVersion: PENDING_VERSION });
    return e.id;
  }

  private reconnectRelationship(e: Extract<ModelEdit, { edit: "reconnectRelationship" }>): Id {
    const rel = this.requireLive("relationships", e.id);
    const fields = [
      ...(e.sourceId !== undefined ? ["sourceId"] : []),
      ...(e.targetId !== undefined ? ["targetId"] : []),
    ];
    if (fields.length === 0) this.invalid("sourceId", "Give a new source, a new target or both");
    this.checkBase("relationships", rel, e.baseVersion, fields);
    this.reconnect(rel, e.sourceId ?? rel.sourceId, e.targetId ?? rel.targetId, fields, {
      ...(e.sourceId !== undefined ? { sourceId: rel.sourceId } : {}),
      ...(e.targetId !== undefined ? { targetId: rel.targetId } : {}),
    });
    return rel.id;
  }

  private reconnect(
    rel: RelationshipRow,
    sourceId: Id,
    targetId: Id,
    fields: string[],
    previous: { sourceId?: Id; targetId?: Id },
  ): void {
    const source = this.refLive("objects", sourceId, "sourceId");
    const target = this.refLive("objects", targetId, "targetId");
    if (source.id === target.id) this.invalid("targetId", "A relationship connects two different objects");
    this.checkRelationshipRules(rel.type, source.type, target.type, source.id, rel.id);
    this.checkNesting(rel.type, source.id, target.id, rel.id);
    if (rel.parentId !== null) {
      this.checkMessage(this.mm.relationshipType(rel.type)!, rel.parentId, source.id, target.id, "sourceId");
    }

    // Its occurrences joined occurrences of the old objects, so they no longer show it (rule 6).
    for (const ro of this.state.relationshipOccurrences.find("byRelationship", rel.id))
      this.removeRelationshipOccurrence(ro);
    this.write("relationships", { ...rel, sourceId: source.id, targetId: target.id });
    this.unnestUnbacked(rel.sourceId, rel.targetId);
    this.markChanged("relationships", rel.id, fields);
    // An interaction's messages follow it: requests keep its direction, responses go back (semantics.md §6). The
    // inverse reconnects the interaction, which moves them back the same way, so they record no steps of their own.
    for (const message of this.messagesOf(rel.id)) {
      const request = message.sourceId === rel.sourceId;
      const [s, t] = request ? [source, target] : [target, source];
      if (message.sourceId === s.id && message.targetId === t.id) continue;
      this.checkRelationshipRules(message.type, s.type, t.type, s.id, message.id);
      for (const ro of this.state.relationshipOccurrences.find("byRelationship", message.id))
        this.removeRelationshipOccurrence(ro);
      this.write("relationships", { ...message, sourceId: s.id, targetId: t.id });
      this.markChanged("relationships", message.id, ["sourceId", "targetId"]);
    }
    // A re-parented content moves into its new container's folder (semantics.md §3).
    if (this.isContainment(rel.type)) this.relocate(target, source.folderId);
    this.step({ edit: "reconnectRelationship", id: rel.id, baseVersion: PENDING_VERSION, ...previous });
  }

  private changeRelationshipType(e: Extract<ModelEdit, { edit: "changeRelationshipType" }>): Id {
    const rel = this.requireLive("relationships", e.id);
    const fields = ["type", ...Object.keys(rel.properties).map((k) => `properties.${k}`)];
    this.checkBase("relationships", rel, e.baseVersion, fields);
    const type = this.mm.relationshipType(e.type);
    if (!type) this.invalid("type", `Unknown relationship type "${e.type}"`);
    const source = this.state.objects.get(rel.sourceId)!;
    const target = this.state.objects.get(rel.targetId)!;

    // Carry values over (renamed through propertyMap); values the new type cannot hold are dropped.
    const allowed = this.mm.relationshipTypeProperties(e.type);
    const carried: Record<string, PropertyValue> = {};
    const reverseMap: Record<string, string> = {};
    const dropped: Record<string, PropertyValue> = {};
    for (const [from, value] of Object.entries(rel.properties)) {
      const to = e.propertyMap?.[from] ?? from;
      if (allowed.has(to) && !(to in carried)) {
        const pt = this.mm.propertyType(to)!;
        const problem = checkValue(pt, value, this.valueContext());
        if (problem) this.invalid(`properties.${to}`, `${pt.name} ${problem} (from ${from})`);
        carried[to] = value;
        if (to !== from) reverseMap[to] = from;
      } else {
        dropped[from] = value;
      }
    }
    for (const key of Object.keys(e.set ?? {})) {
      if (key in carried) this.invalid(`set.${key}`, `"${key}" is already carried over from the old type`);
    }
    const properties = this.checkProperties(allowed, carried, e.set ?? {}, "set");

    this.checkRelationshipRules(e.type, source.type, target.type, source.id, rel.id);
    this.checkNesting(e.type, source.id, target.id, rel.id);
    if (rel.parentId !== null && type.semantic !== "flow") this.invalid("type", "A message is always a flow");
    if (type.semantic !== "interaction" && this.messagesOf(rel.id).length > 0)
      this.invalid("type", `It has messages, so it stays an interaction`);
    if (rel.payload.length > 0 && type.payload === "none")
      this.invalid("type", `${type.name} carries no payload; remove the payload first`);
    for (const ro of this.state.relationshipOccurrences.find("byRelationship", rel.id)) {
      const diagram = this.state.diagrams.get(ro.diagramId)!;
      const dt = this.mm.diagramType(diagram.diagramType);
      if (dt && !this.mm.diagramAllowsRelationshipType(dt, e.type)) {
        this.invalid("type", `This relationship is shown on "${diagram.name}", which does not show ${type.name}`);
      }
      if (ro.shownAs === "nesting" && !type.nesting) this.removeRelationshipOccurrence(ro);
    }

    this.write("relationships", { ...rel, type: e.type, properties });
    this.markChanged("relationships", rel.id, [...fields, ...Object.keys(properties).map((k) => `properties.${k}`)]);
    this.unnestUnbacked(rel.sourceId, rel.targetId);
    if (type.semantic === "containment") this.relocate(target, source.folderId);
    this.step({
      edit: "changeRelationshipType",
      id: rel.id,
      baseVersion: PENDING_VERSION,
      type: rel.type,
      ...(Object.keys(reverseMap).length > 0 ? { propertyMap: reverseMap } : {}),
      ...(Object.keys(dropped).length > 0 ? { set: dropped } : {}),
    });
    return rel.id;
  }

  private deleteRelationshipEdit(e: Extract<ModelEdit, { edit: "deleteRelationship" }>): Id {
    const rel = this.requireLive("relationships", e.id);
    this.checkBase("relationships", rel, e.baseVersion, ["*"]);
    this.deleteRelationship(rel);
    return rel.id;
  }

  private setPayload(e: Extract<ModelEdit, { edit: "setPayload" }>): Id {
    const rel = this.requireLive("relationships", e.id);
    this.checkBase("relationships", rel, e.baseVersion, ["payload"]);
    const payload = this.checkPayload(this.mm.relationshipType(rel.type)!, e.payload, "payload");
    this.writePayload(rel, payload);
    return rel.id;
  }

  private writePayload(rel: RelationshipRow, payload: Id[]): void {
    this.write("relationships", { ...rel, payload });
    this.markChanged("relationships", rel.id, ["payload"]);
    this.step({ edit: "setPayload", id: rel.id, baseVersion: PENDING_VERSION, payload: rel.payload });
  }

  /** Deleting an interaction deletes its messages first, so undo restores the interaction before them. */
  private deleteRelationship(rel: RelationshipRow): void {
    for (const message of this.messagesOf(rel.id)) this.deleteRelationship(message);
    for (const ro of this.state.relationshipOccurrences.find("byRelationship", rel.id))
      this.removeRelationshipOccurrence(ro);
    this.write("relationships", { ...rel, deleted: true });
    this.markChanged("relationships", rel.id, ["*"]);
    this.unnestUnbacked(rel.sourceId, rel.targetId);
    this.step({
      edit: "createRelationship",
      id: rel.id,
      type: rel.type,
      sourceId: rel.sourceId,
      targetId: rel.targetId,
      name: rel.name,
      properties: rel.properties,
      tags: rel.tags,
      externalIds: rel.externalIds,
      ...(rel.payload.length > 0 ? { payload: rel.payload } : {}),
      ...(rel.parentId !== null ? { parentId: rel.parentId } : {}),
      ...(rel.parentId !== null || rel.rank !== 0 ? { rank: rel.rank } : {}),
    });
  }

  /** The messages of an interaction, in order. */
  private messagesOf(interactionId: Id): RelationshipRow[] {
    return this.state.relationships
      .find("byParent", interactionId)
      .sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));
  }

  /** Semantics §5: only types that carry a payload get one; each entry is a live object, listed once. */
  private checkPayload(type: ResolvedRelationshipType, payload: Id[], property: string): Id[] {
    if (payload.length > 0 && type.payload === "none") this.invalid(property, `${type.name} carries no payload`);
    payload.forEach((id, i) => {
      this.refLive("objects", id, `${property}.${i}`);
      if (payload.indexOf(id) !== i) this.invalid(`${property}.${i}`, "An object is listed once in a payload");
    });
    return [...payload];
  }

  /** Semantics §6: a message is a flow between its interaction's two objects, in either direction. */
  private checkMessage(type: ResolvedRelationshipType, parentId: Id, sourceId: Id, targetId: Id, property: string) {
    const parent = this.refLive("relationships", parentId, "parentId");
    if (this.mm.relationshipType(parent.type)?.semantic !== "interaction")
      this.invalid("parentId", "Only interactions have messages");
    if (type.semantic !== "flow") this.invalid("type", "A message is a flow");
    const forward = sourceId === parent.sourceId && targetId === parent.targetId;
    const back = sourceId === parent.targetId && targetId === parent.sourceId;
    if (!forward && !back) {
      this.reject({
        code: "ruleViolation",
        editIndex: this.index,
        rule: "message:endpoints",
        message: `A message connects its interaction's two objects (${property})`,
      });
    }
  }

  private relationshipsOf(objectId: Id): RelationshipRow[] {
    return [
      ...this.state.relationships.find("bySource", objectId),
      ...this.state.relationships.find("byTarget", objectId),
    ];
  }

  /** Rule 3: the relationship type must allow the pair; `warn` rules allow it and add a finding. */
  private checkRelationshipRules(
    type: TypeKey,
    sourceType: TypeKey,
    targetType: TypeKey,
    sourceId: Id,
    relId: Id,
  ): void {
    const rules = this.mm.matchingRules(type, sourceType, targetType);
    const verb = this.mm.relationshipType(type)?.verb ?? type;
    const sentence = `${this.typeName(sourceType)} ${verb} ${this.typeName(targetType)}`;
    if (rules.length === 0) {
      this.reject({
        code: "ruleViolation",
        editIndex: this.index,
        rule: `${type}:allowedPairs`,
        message: `No rule allows "${sentence}"`,
      });
    }
    if (rules.every((r) => r.enforcement === "warn")) {
      this.finding(rules[0]!.key, relId, `"${sentence}" is allowed, but the metamodel discourages it`);
    }
    for (const rule of rules) {
      if (rule.cardinality !== "0..1" && rule.cardinality !== "1..1") continue;
      const others = this.state.relationships
        .find("bySource", sourceId)
        .filter(
          (r) =>
            r.id !== relId && r.type === type && this.mm.isA(this.state.objects.get(r.targetId)!.type, rule.targetType),
        );
      if (others.length === 0) continue;
      const message = `"${sentence}": a ${this.typeName(sourceType)} may have at most one`;
      if (rule.enforcement === "block") {
        this.reject({ code: "ruleViolation", editIndex: this.index, rule: rule.key, message });
      }
      this.finding(rule.key, relId, message);
    }
  }

  /** Rule 5: nesting relationships never form a cycle, and single-parent types allow one parent. */
  private checkNesting(type: TypeKey, sourceId: Id, targetId: Id, relId: Id): void {
    const rt = this.mm.relationshipType(type);
    if (!rt?.nesting) return;
    // Containment is one hierarchy whatever the type (semantics.md §3); other nesting types are one each (B1).
    const sameHierarchy = (r: RelationshipRow) =>
      rt.semantic === "containment" ? this.isContainment(r.type) : r.type === type;
    if (rt.singleParent) {
      const parents = this.state.relationships
        .find("byTarget", targetId)
        .filter((r) => sameHierarchy(r) && r.id !== relId);
      if (parents.length > 0) {
        const parent = this.state.objects.get(parents[0]!.sourceId)!;
        this.reject({
          code: "ruleViolation",
          editIndex: this.index,
          rule: `${type}:singleParent`,
          message: `${this.state.objects.get(targetId)!.name} already ${rt.inverseVerb} ${parent.name}`,
        });
      }
    }
    // Walk up from the new parent: reaching the new child means the relationship would close a loop.
    const seen = new Set<Id>();
    const queue = [sourceId];
    while (queue.length > 0) {
      const current = queue.pop()!;
      if (current === targetId) {
        this.reject({
          code: "ruleViolation",
          editIndex: this.index,
          rule: `${type}:noCycles`,
          message: `${this.state.objects.get(sourceId)!.name} is already inside ${this.state.objects.get(targetId)!.name}`,
        });
      }
      if (seen.has(current)) continue;
      seen.add(current);
      for (const r of this.state.relationships.find("byTarget", current)) {
        if (sameHierarchy(r) && r.id !== relId) queue.push(r.sourceId);
      }
    }
  }

  private isContainment(type: TypeKey): boolean {
    return this.mm.relationshipType(type)?.semantic === "containment";
  }

  /** The containment relationship that holds an object, if any (there is at most one). */
  private containerRelationship(objectId: Id): RelationshipRow | undefined {
    return this.state.relationships.find("byTarget", objectId).find((r) => this.isContainment(r.type));
  }

  private contentRelationships(objectId: Id): RelationshipRow[] {
    return this.state.relationships.find("bySource", objectId).filter((r) => this.isContainment(r.type));
  }

  /**
   * Moves an object and everything it contains into a folder (folder follows container, semantics.md §3). The
   * deepest contents are stepped first, so undo moves the root first and its contents follow it.
   */
  private relocate(root: ObjectRow, folderId: Id, includeRoot = false): void {
    const subtree: Id[] = [];
    const visit = (id: Id) => {
      if (subtree.includes(id)) return;
      subtree.push(id);
      for (const r of this.contentRelationships(id)) visit(r.targetId);
    };
    visit(root.id);
    for (const id of subtree.reverse()) {
      const obj = this.state.objects.get(id)!;
      if (obj.folderId === folderId && !(includeRoot && id === root.id)) continue;
      this.checkUniqueName(obj.type, obj.name, folderId, obj.id);
      this.write("objects", { ...obj, folderId });
      this.markChanged("objects", obj.id, ["folderId"]);
      this.step({ edit: "moveToFolder", id: obj.id, baseVersion: PENDING_VERSION, folderId: obj.folderId });
    }
  }

  private hasNestingRelationship(parentObjectId: Id, childObjectId: Id): boolean {
    return this.state.relationships
      .find("bySource", parentObjectId)
      .some((r) => r.targetId === childObjectId && this.mm.relationshipType(r.type)?.nesting === true);
  }

  /** After a nesting relationship goes away, occurrences it backed move out of their parent (rule 6). */
  private unnestUnbacked(parentObjectId: Id, childObjectId: Id): void {
    if (this.hasNestingRelationship(parentObjectId, childObjectId)) return;
    for (const child of this.state.objectOccurrences.find("byObject", childObjectId)) {
      if (!child.parentOccurrenceId) continue;
      const parent = this.state.objectOccurrences.get(child.parentOccurrenceId);
      if (parent?.objectId === parentObjectId) this.moveToRoot(child);
    }
  }

  // ------------------------------------------------------------------ folders

  private createFolder(e: Extract<ModelEdit, { edit: "createFolder" }>): Id {
    this.requireNewId("folders", e.id);
    if (e.parentId !== null) this.refLive("folders", e.parentId, "parentId");
    this.checkFolderName(e.name, e.parentId, e.id);
    this.write("folders", { id: e.id, parentId: e.parentId, name: e.name, deleted: false });
    this.step({ edit: "deleteFolder", id: e.id, contents: "refuseIfNotEmpty" });
    return e.id;
  }

  private renameFolder(e: Extract<ModelEdit, { edit: "renameFolder" }>): Id {
    const folder = this.requireLive("folders", e.id);
    this.checkFolderName(e.name, folder.parentId, folder.id);
    this.write("folders", { ...folder, name: e.name });
    this.step({ edit: "renameFolder", id: folder.id, name: folder.name });
    return folder.id;
  }

  private moveFolder(e: Extract<ModelEdit, { edit: "moveFolder" }>): Id {
    const folder = this.requireLive("folders", e.id);
    for (let p = e.parentId; p !== null; p = this.refLive("folders", p, "parentId").parentId) {
      if (p === folder.id) this.invalid("parentId", "A folder cannot move into itself or one of its subfolders");
    }
    this.checkFolderName(folder.name, e.parentId, folder.id);
    this.write("folders", { ...folder, parentId: e.parentId });
    this.step({ edit: "moveFolder", id: folder.id, parentId: folder.parentId });
    return folder.id;
  }

  private deleteFolderEdit(e: Extract<ModelEdit, { edit: "deleteFolder" }>): Id {
    const folder = this.requireLive("folders", e.id);
    if (!this.ctx.scenario.isBaseline) {
      this.invalid("id", "Folders are shared by every scenario; delete them in the baseline");
    }
    if (e.contents === "refuseIfNotEmpty") {
      const counts = [
        [this.state.folders.count("byParent", folder.id), "folder"],
        [this.state.objects.count("byFolder", folder.id), "object"],
        [this.state.diagrams.count("byFolder", folder.id), "diagram"],
      ] as const;
      const contents = counts.filter(([n]) => n > 0).map(([n, what]) => `${n} ${what}${n === 1 ? "" : "s"}`);
      if (contents.length > 0) this.invalid("contents", `"${folder.name}" is not empty: ${contents.join(", ")}`);
    }
    this.deleteFolder(folder);
    return folder.id;
  }

  private deleteFolder(folder: FolderRow): void {
    for (const sub of this.state.folders.find("byParent", folder.id)) this.deleteFolder(sub);
    for (const diagram of this.state.diagrams.find("byFolder", folder.id)) this.deleteDiagram(diagram);
    for (const { id } of this.state.objects.find("byFolder", folder.id)) {
      const obj = this.state.objects.get(id); // an earlier delete may have taken it with it
      if (obj) this.deleteObject(obj, "deleteContents");
    }
    this.write("folders", { ...folder, deleted: true });
    this.step({ edit: "createFolder", id: folder.id, parentId: folder.parentId, name: folder.name });
  }

  private checkFolderName(name: string, parentId: Id | null, selfId: Id): void {
    this.checkName(name);
    if (name.includes("/")) this.invalid("name", 'Folder names cannot contain "/"');
    const clash = this.state.folders.find("byParent", parentId ?? "").find((f) => f.id !== selfId && f.name === name);
    if (clash) this.invalid("name", `A folder named "${name}" already exists here`);
  }

  // ------------------------------------------------------------------ diagrams

  private createDiagram(e: Extract<DiagramEdit, { edit: "createDiagram" }>): Id {
    this.requireNewId("diagrams", e.id);
    this.checkName(e.name);
    this.diagramTypeOf(e.diagramType, "diagramType");
    this.refLive("folders", e.folderId, "folderId");
    const tombstone = this.state.diagrams.getAny(e.id);
    this.write("diagrams", {
      id: e.id,
      name: e.name,
      description: e.description ?? "",
      diagramType: e.diagramType,
      folderId: e.folderId,
      generatedBy: null,
      version: tombstone?.version ?? 0,
      fieldVersions: {},
      deleted: false,
      ...this.meta(tombstone),
    });
    this.markChanged("diagrams", e.id, ["*"]);
    this.step({ edit: "deleteDiagram", id: e.id });
    return e.id;
  }

  private updateDiagram(e: Extract<DiagramEdit, { edit: "updateDiagram" }>): Id {
    const diagram = this.requireLive("diagrams", e.id);
    const fields = Object.keys(e.set);
    if (fields.length === 0) this.invalid("set", "Nothing to update");
    this.checkBase("diagrams", diagram, e.baseVersion, fields);
    if (e.set.name !== undefined) this.checkName(e.set.name);
    if (e.set.folderId !== undefined) this.refLive("folders", e.set.folderId, "set.folderId");
    if (e.set.diagramType !== undefined) {
      const dt = this.diagramTypeOf(e.set.diagramType, "set.diagramType");
      for (const occ of this.state.objectOccurrences.find("byDiagram", diagram.id)) {
        const obj = this.state.objects.get(occ.objectId)!;
        if (!this.mm.diagramAllowsObjectType(dt, obj.type)) {
          this.invalid("set.diagramType", `${dt.definition.name} diagrams cannot show ${obj.name}`);
        }
      }
    }
    const previous = Object.fromEntries(fields.map((f) => [f, diagram[f as keyof typeof e.set]]));
    this.write("diagrams", { ...diagram, ...e.set });
    this.markChanged("diagrams", diagram.id, fields);
    this.step({ edit: "updateDiagram", id: diagram.id, baseVersion: PENDING_VERSION, set: previous });
    return diagram.id;
  }

  private deleteDiagramEdit(e: Extract<DiagramEdit, { edit: "deleteDiagram" }>): Id {
    this.deleteDiagram(this.requireLive("diagrams", e.id));
    return e.id;
  }

  /** Deletes a diagram and everything on it. Objects are never deleted with a diagram. */
  private deleteDiagram(diagram: DiagramRow): void {
    for (const ro of this.state.relationshipOccurrences.find("byDiagram", diagram.id))
      this.removeRelationshipOccurrence(ro);
    for (const an of this.state.annotations.find("byDiagram", diagram.id)) this.removeAnnotationRow(an);
    // Deepest occurrences first, so nothing needs re-parenting and the inverse re-adds parents first.
    const occurrences = this.state.objectOccurrences.find("byDiagram", diagram.id);
    const depth = (o: ObjectOccurrenceRow): number => {
      const parent = o.parentOccurrenceId ? this.state.objectOccurrences.get(o.parentOccurrenceId) : undefined;
      return parent ? 1 + depth(parent) : 0;
    };
    for (const occ of occurrences.sort((a, b) => depth(b) - depth(a))) {
      this.write("objectOccurrences", { ...occ, deleted: true });
      this.step({ edit: "addObjectOccurrence", diagramId: diagram.id, occurrence: toObjectOccurrence(occ) });
    }
    this.write("diagrams", { ...diagram, deleted: true });
    this.markChanged("diagrams", diagram.id, ["*"]);
    this.step({
      edit: "createDiagram",
      id: diagram.id,
      name: diagram.name,
      diagramType: diagram.diagramType,
      folderId: diagram.folderId,
      description: diagram.description,
    });
  }

  private diagramTypeOf(key: TypeKey, property: string): ResolvedDiagramType {
    const dt = this.mm.diagramType(key);
    if (!dt) this.invalid(property, `Unknown diagram type "${key}"`);
    return dt;
  }

  private diagramOf(diagramId: Id): { diagram: DiagramRow; type: ResolvedDiagramType } {
    const diagram = this.refLive("diagrams", diagramId, "diagramId");
    return { diagram, type: this.diagramTypeOf(diagram.diagramType, "diagramId") };
  }

  // ------------------------------------------------------------------ occurrences

  private addObjectOccurrence(e: Extract<DiagramEdit, { edit: "addObjectOccurrence" }>): Id {
    const { diagram, type } = this.diagramOf(e.diagramId);
    const occ = e.occurrence;
    this.requireNewId("objectOccurrences", occ.id, "occurrence.id");
    const obj = this.refLive("objects", occ.objectId, "occurrence.objectId");
    if (!this.mm.diagramAllowsObjectType(type, obj.type)) {
      this.invalid(
        "occurrence.objectId",
        `${type.definition.name} diagrams do not show ${this.typeName(obj.type)} objects`,
      );
    }
    this.checkLayout(occ, "occurrence");
    if (occ.parentOccurrenceId !== null)
      this.checkParentOccurrence(diagram, type, occ.parentOccurrenceId, obj.id, occ.id);
    if (occ.drillDownDiagramId !== null)
      this.refLive("diagrams", occ.drillDownDiagramId, "occurrence.drillDownDiagramId");
    this.checkStyle(occ.style, SYMBOL_STYLE_KEYS, "occurrence.style");
    this.write("objectOccurrences", {
      ...occ,
      diagramId: diagram.id,
      deleted: false,
      ...this.meta(this.state.objectOccurrences.getAny(occ.id)),
    });
    this.step({ edit: "removeOccurrence", diagramId: diagram.id, occurrenceId: occ.id });
    return occ.id;
  }

  private moveObjectOccurrence(e: Extract<DiagramEdit, { edit: "moveObjectOccurrence" }>): Id {
    const { diagram, type } = this.diagramOf(e.diagramId);
    const occ = this.occurrenceOn("objectOccurrences", e.occurrenceId, diagram.id);
    const next = { ...occ, x: e.x, y: e.y, w: e.w ?? occ.w, h: e.h ?? occ.h };
    this.checkLayout(next, "");
    if (e.parentOccurrenceId !== undefined && e.parentOccurrenceId !== occ.parentOccurrenceId) {
      if (e.parentOccurrenceId !== null) {
        this.checkParentOccurrence(diagram, type, e.parentOccurrenceId, occ.objectId, occ.id);
      }
      // A nesting line from the old parent no longer matches the picture.
      for (const ro of this.state.relationshipOccurrences.find("byTarget", occ.id)) {
        if (ro.shownAs === "nesting") this.removeRelationshipOccurrence(ro);
      }
      next.parentOccurrenceId = e.parentOccurrenceId;
    }
    this.write("objectOccurrences", next);
    this.step({
      edit: "moveObjectOccurrence",
      diagramId: diagram.id,
      occurrenceId: occ.id,
      x: occ.x,
      y: occ.y,
      w: occ.w,
      h: occ.h,
      parentOccurrenceId: occ.parentOccurrenceId,
    });
    return occ.id;
  }

  private styleOccurrence(e: Extract<DiagramEdit, { edit: "styleOccurrence" }>): Id {
    const { diagram } = this.diagramOf(e.diagramId);
    const objectOcc = this.state.objectOccurrences.get(e.occurrenceId);
    const relOcc = objectOcc ? undefined : this.state.relationshipOccurrences.get(e.occurrenceId);
    const occ = objectOcc ?? relOcc;
    if (!occ || occ.diagramId !== diagram.id) this.missing("objectOccurrences", e.occurrenceId, "occurrenceId");
    const keys = objectOcc ? SYMBOL_STYLE_KEYS : LINE_STYLE_KEYS;
    this.checkStyle(e.style, keys, "style");
    if (relOcc && e.z !== undefined) this.invalid("z", "Lines have no z-order");

    const style: Record<string, unknown> = { ...occ.style };
    const previous: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(e.style)) {
      previous[k] = style[k] ?? null;
      if (v === null || v === undefined) delete style[k];
      else style[k] = v;
    }
    if (objectOcc) {
      this.write("objectOccurrences", { ...objectOcc, style, ...(e.z !== undefined ? { z: e.z } : {}) });
      this.step({
        edit: "styleOccurrence",
        diagramId: diagram.id,
        occurrenceId: occ.id,
        style: previous as StylePatch,
        ...(e.z !== undefined ? { z: objectOcc.z } : {}),
      });
    } else {
      this.write("relationshipOccurrences", { ...relOcc!, style });
      this.step({
        edit: "styleOccurrence",
        diagramId: diagram.id,
        occurrenceId: occ.id,
        style: previous as StylePatch,
      });
    }
    return occ.id;
  }

  private removeOccurrence(e: Extract<DiagramEdit, { edit: "removeOccurrence" }>): Id {
    const { diagram } = this.diagramOf(e.diagramId);
    const objectOcc = this.state.objectOccurrences.get(e.occurrenceId);
    if (objectOcc && objectOcc.diagramId === diagram.id) {
      this.removeObjectOccurrence(objectOcc);
      return objectOcc.id;
    }
    const relOcc = this.state.relationshipOccurrences.get(e.occurrenceId);
    if (relOcc && relOcc.diagramId === diagram.id) {
      this.removeRelationshipOccurrence(relOcc);
      return relOcc.id;
    }
    const known =
      this.state.objectOccurrences.getAny(e.occurrenceId) ?? this.state.relationshipOccurrences.getAny(e.occurrenceId);
    if (known) this.reject({ code: "gone", editIndex: this.index, itemId: e.occurrenceId });
    this.invalid("occurrenceId", `No occurrence ${e.occurrenceId} on this diagram`);
  }

  /** Removes an occurrence from its diagram (rule 8: the object stays), with its lines; nested items move out. */
  private removeObjectOccurrence(occ: ObjectOccurrenceRow): void {
    for (const ro of [
      ...this.state.relationshipOccurrences.find("bySource", occ.id),
      ...this.state.relationshipOccurrences.find("byTarget", occ.id),
    ]) {
      this.removeRelationshipOccurrence(ro);
    }
    for (const child of this.state.objectOccurrences.find("byParent", occ.id)) this.moveToRoot(child);
    for (const an of this.state.annotations.find("byParent", occ.id)) this.moveAnnotationToRoot(an);
    const current = this.state.objectOccurrences.get(occ.id)!;
    this.write("objectOccurrences", { ...current, deleted: true });
    this.step({ edit: "addObjectOccurrence", diagramId: current.diagramId, occurrence: toObjectOccurrence(current) });
  }

  private removeRelationshipOccurrence(ro: RelationshipOccurrenceRow): void {
    const current = this.state.relationshipOccurrences.get(ro.id);
    if (!current) return;
    this.write("relationshipOccurrences", { ...current, deleted: true });
    this.step({
      edit: "addRelationshipOccurrence",
      diagramId: current.diagramId,
      occurrence: toRelationshipOccurrence(current),
    });
  }

  /** Moves a nested occurrence to the top level of its diagram, keeping it where it is on screen. */
  private moveToRoot(child: ObjectOccurrenceRow): void {
    const current = this.state.objectOccurrences.get(child.id)!;
    const { x, y } = this.absolutePosition(current.parentOccurrenceId);
    for (const ro of this.state.relationshipOccurrences.find("byTarget", current.id)) {
      if (ro.shownAs === "nesting") this.removeRelationshipOccurrence(ro);
    }
    this.write("objectOccurrences", { ...current, parentOccurrenceId: null, x: current.x + x, y: current.y + y });
    this.step({
      edit: "moveObjectOccurrence",
      diagramId: current.diagramId,
      occurrenceId: current.id,
      x: current.x,
      y: current.y,
      parentOccurrenceId: current.parentOccurrenceId,
    });
  }

  private moveAnnotationToRoot(an: AnnotationRow): void {
    const { x, y } = this.absolutePosition(an.parentOccurrenceId);
    this.write("annotations", { ...an, parentOccurrenceId: null, x: an.x + x, y: an.y + y });
    this.step({
      edit: "updateAnnotation",
      diagramId: an.diagramId,
      annotationId: an.id,
      set: { parentOccurrenceId: an.parentOccurrenceId, x: an.x, y: an.y },
    });
  }

  /** The diagram position of an occurrence's top-left corner (0,0 for the diagram itself). */
  private absolutePosition(occurrenceId: Id | null): { x: number; y: number } {
    let x = 0;
    let y = 0;
    for (let id = occurrenceId; id;) {
      const occ = this.state.objectOccurrences.get(id);
      if (!occ) break;
      x += occ.x;
      y += occ.y;
      id = occ.parentOccurrenceId;
    }
    return { x, y };
  }

  /** A nested occurrence needs a parent on the same diagram and a nesting relationship behind it (rule 6). */
  private checkParentOccurrence(
    diagram: DiagramRow,
    type: ResolvedDiagramType,
    parentId: Id,
    objectId: Id,
    selfId: Id,
  ): void {
    if (type.nesting === "lines") {
      this.invalid("parentOccurrenceId", `${type.definition.name} diagrams show nesting as lines, not by placement`);
    }
    const parent = this.occurrenceOn("objectOccurrences", parentId, diagram.id, "parentOccurrenceId");
    for (let p: ObjectOccurrenceRow | undefined = parent; p;) {
      if (p.id === selfId) this.invalid("parentOccurrenceId", "An occurrence cannot be placed inside itself");
      p = p.parentOccurrenceId ? this.state.objectOccurrences.get(p.parentOccurrenceId) : undefined;
    }
    if (!this.hasNestingRelationship(parent.objectId, objectId)) {
      const parentName = this.state.objects.get(parent.objectId)!.name;
      const childName = this.state.objects.get(objectId)!.name;
      this.reject({
        code: "ruleViolation",
        editIndex: this.index,
        rule: "nesting:backedByRelationship",
        message: `${childName} can only be placed inside ${parentName} if a nesting relationship connects them`,
      });
    }
  }

  private addRelationshipOccurrence(e: Extract<DiagramEdit, { edit: "addRelationshipOccurrence" }>): Id {
    const { diagram, type } = this.diagramOf(e.diagramId);
    const ro = e.occurrence;
    this.requireNewId("relationshipOccurrences", ro.id, "occurrence.id");
    const rel = this.refLive("relationships", ro.relationshipId, "occurrence.relationshipId");
    if (!this.mm.diagramAllowsRelationshipType(type, rel.type)) {
      this.invalid(
        "occurrence.relationshipId",
        `${type.definition.name} diagrams do not show "${rel.type}" relationships`,
      );
    }
    const source = this.occurrenceOn(
      "objectOccurrences",
      ro.sourceOccurrenceId,
      diagram.id,
      "occurrence.sourceOccurrenceId",
    );
    const target = this.occurrenceOn(
      "objectOccurrences",
      ro.targetOccurrenceId,
      diagram.id,
      "occurrence.targetOccurrenceId",
    );
    if (source.objectId !== rel.sourceId || target.objectId !== rel.targetId) {
      this.invalid("occurrence", "A line must join occurrences of the relationship's source and target objects");
    }
    if (ro.shownAs === "nesting") {
      if (!this.mm.relationshipType(rel.type)?.nesting)
        this.invalid("occurrence.shownAs", "Only nesting relationships are shown by nesting");
      if (type.nesting === "lines")
        this.invalid("occurrence.shownAs", `${type.definition.name} diagrams show nesting as lines`);
      if (target.parentOccurrenceId !== source.id) {
        this.invalid("occurrence.shownAs", "The target occurrence must be placed inside the source occurrence");
      }
    }
    this.checkRoute(ro.route, ro.labelPosition);
    this.checkStyle(ro.style, LINE_STYLE_KEYS, "occurrence.style");
    this.write("relationshipOccurrences", {
      ...ro,
      diagramId: diagram.id,
      deleted: false,
      ...this.meta(this.state.relationshipOccurrences.getAny(ro.id)),
    });
    this.step({ edit: "removeOccurrence", diagramId: diagram.id, occurrenceId: ro.id });
    return ro.id;
  }

  private routeRelationshipOccurrence(e: Extract<DiagramEdit, { edit: "routeRelationshipOccurrence" }>): Id {
    const { diagram } = this.diagramOf(e.diagramId);
    const ro = this.occurrenceOn("relationshipOccurrences", e.occurrenceId, diagram.id);
    this.checkRoute(e.route, e.labelPosition ?? ro.labelPosition);
    this.write("relationshipOccurrences", {
      ...ro,
      route: e.route,
      labelPosition: e.labelPosition ?? ro.labelPosition,
    });
    this.step({
      edit: "routeRelationshipOccurrence",
      diagramId: diagram.id,
      occurrenceId: ro.id,
      route: ro.route,
      labelPosition: ro.labelPosition,
    });
    return ro.id;
  }

  private checkRoute(route: RelationshipOccurrence["route"], labelPosition: number): void {
    if (route.mode === "manual" && route.points.some((p) => !p.every(Number.isFinite))) {
      this.invalid("route", "Route points must be numbers");
    }
    if (!(labelPosition >= 0 && labelPosition <= 1)) this.invalid("labelPosition", "Label position is between 0 and 1");
  }

  // ------------------------------------------------------------------ annotations

  private addAnnotation(e: Extract<DiagramEdit, { edit: "addAnnotation" }>): Id {
    const { diagram } = this.diagramOf(e.diagramId);
    const an = e.annotation;
    this.requireNewId("annotations", an.id, "annotation.id");
    this.checkLayout(an, "annotation");
    if (an.parentOccurrenceId !== null) {
      this.occurrenceOn("objectOccurrences", an.parentOccurrenceId, diagram.id, "annotation.parentOccurrenceId");
    }
    this.checkStyle(an.style, SYMBOL_STYLE_KEYS, "annotation.style");
    this.write("annotations", {
      ...an,
      diagramId: diagram.id,
      deleted: false,
      ...this.meta(this.state.annotations.getAny(an.id)),
    });
    this.step({ edit: "removeAnnotation", diagramId: diagram.id, annotationId: an.id });
    return an.id;
  }

  private updateAnnotation(e: Extract<DiagramEdit, { edit: "updateAnnotation" }>): Id {
    const { diagram } = this.diagramOf(e.diagramId);
    const an = this.occurrenceOn("annotations", e.annotationId, diagram.id, "annotationId");
    const next = { ...an, ...e.set };
    this.checkLayout(next, "set");
    if (e.set.parentOccurrenceId) {
      this.occurrenceOn("objectOccurrences", e.set.parentOccurrenceId, diagram.id, "set.parentOccurrenceId");
    }
    if (e.set.style) this.checkStyle(e.set.style, SYMBOL_STYLE_KEYS, "set.style");
    const previous = Object.fromEntries(Object.keys(e.set).map((k) => [k, an[k as keyof Annotation]]));
    this.write("annotations", next);
    this.step({ edit: "updateAnnotation", diagramId: diagram.id, annotationId: an.id, set: previous });
    return an.id;
  }

  private removeAnnotation(e: Extract<DiagramEdit, { edit: "removeAnnotation" }>): Id {
    const { diagram } = this.diagramOf(e.diagramId);
    this.removeAnnotationRow(this.occurrenceOn("annotations", e.annotationId, diagram.id, "annotationId"));
    return e.annotationId;
  }

  private removeAnnotationRow(an: AnnotationRow): void {
    this.write("annotations", { ...an, deleted: true });
    this.step({ edit: "addAnnotation", diagramId: an.diagramId, annotation: toAnnotation(an) });
  }

  // ------------------------------------------------------------------ shared checks

  private checkLayout(r: { x: number; y: number; w: number; h: number }, prefix: string): void {
    const at = (p: string) => (prefix ? `${prefix}.${p}` : p);
    for (const p of ["x", "y"] as const)
      if (!Number.isInteger(r[p])) this.invalid(at(p), "Positions are whole numbers");
    for (const p of ["w", "h"] as const) {
      if (!Number.isInteger(r[p]) || r[p] <= 0) this.invalid(at(p), "Sizes are positive whole numbers");
    }
  }

  private checkStyle(style: object, allowed: ReadonlySet<string>, property: string): void {
    for (const key of Object.keys(style))
      if (!allowed.has(key)) this.invalid(`${property}.${key}`, "Not a style of this item");
  }

  private checkName(name: string): void {
    const trimmed = name.trim();
    if (trimmed.length === 0) this.invalid("name", "A name is required");
    if (name.length > MAX_NAME) this.invalid("name", `Names have at most ${MAX_NAME} characters`);
  }

  private checkTags(tags: string[]): string[] {
    if (new Set(tags).size !== tags.length) this.invalid("tags", "Tags must not repeat");
    if (tags.some((t) => t.trim().length === 0)) this.invalid("tags", "Tags cannot be empty");
    return tags;
  }

  private instantiableType(key: TypeKey, property: string) {
    const type = this.mm.objectType(key);
    if (!type) this.invalid(property, `Unknown object type "${key}"`);
    if (type.definition.abstract)
      this.invalid(property, `${type.definition.name} is abstract: choose one of its subtypes`);
    return type;
  }

  private typeName(key: TypeKey): string {
    return this.mm.objectType(key)?.definition.name ?? key;
  }

  /** Checks a name against the object type's uniqueness setting (case-insensitive). */
  private checkUniqueName(type: TypeKey, name: string, folderId: Id, selfId: Id): void {
    const scope = this.mm.objectType(type)?.uniqueName ?? "none";
    if (scope === "none") return;
    const clash = this.state.objects
      .find("byType", type)
      .find((o) => o.id !== selfId && sameName(o.name, name) && (scope === "repository" || o.folderId === folderId));
    if (clash) {
      const where = scope === "repository" ? "in this repository" : "in this folder";
      this.invalid("name", `A ${this.typeName(type)} named "${clash.name}" already exists ${where}`);
    }
  }

  private checkUniqueKey(type: TypeKey, key: string, selfId: Id): void {
    const clash = this.state.objects.find("byType", type).find((o) => o.id !== selfId && o.key === key);
    if (clash) this.invalid("key", `Key ${key} is already used by ${clash.name}`);
  }

  /** The next key for a pattern such as `APP-{0000}` (tombstones count, so keys are never reused). */
  private nextKey(type: TypeKey, pattern: string | undefined): string | null {
    if (!pattern) return null;
    const match = /^(.*)\{(0+)\}(.*)$/.exec(pattern);
    if (!match) return null;
    const [, prefix, zeros, suffix] = match as unknown as [string, string, string, string];
    const shape = new RegExp(`^${escapeRegExp(prefix)}(\\d+)${escapeRegExp(suffix)}$`);
    let max = 0;
    for (const obj of this.state.objects.all()) {
      if (obj.type !== type || obj.key === null) continue;
      const n = shape.exec(obj.key);
      if (n) max = Math.max(max, Number(n[1]));
    }
    return `${prefix}${String(max + 1).padStart(zeros.length, "0")}${suffix}`;
  }

  /** A type with a fixed level only accepts its own level (design/02-model/semantics.md §4.2). */
  private checkLevel(type: ResolvedObjectType, set: Record<string, PropertyValue>): void {
    const value = set[LEVEL_PROPERTY];
    if (type.levelFixed && value != null && value !== type.level)
      this.invalid(`properties.${LEVEL_PROPERTY}`, `${type.definition.name} is always ${type.level}`);
  }

  /** Rule 2: only assigned property types, with values of the right data type. `null` clears a value. */
  private checkProperties(
    allowed: ReadonlySet<string>,
    current: Record<string, PropertyValue>,
    set: Record<string, PropertyValue>,
    prefix: string,
  ): Record<string, PropertyValue> {
    const result = { ...current };
    for (const [key, value] of Object.entries(set)) {
      const property = `${prefix}.${key}`;
      if (value === null) {
        if (!allowed.has(key) && !(key in current)) this.invalid(property, `Unknown property "${key}" for this type`);
        delete result[key];
        continue;
      }
      if (!allowed.has(key)) this.invalid(property, `This type has no property "${key}"`);
      const pt = this.mm.propertyType(key)!;
      let problem: string | null;
      if (pt.dataType === "calculated") {
        // Calculated values are written only by the system (as follow-up changes), typed by the formula.
        problem =
          this.ctx.actor.kind === "system"
            ? checkValue({ ...pt, dataType: pt.formula?.resultType ?? "text" }, value, this.valueContext())
            : "is calculated and cannot be set";
      } else {
        problem = checkValue(pt, value, this.valueContext());
      }
      if (problem) this.invalid(property, `${pt.name} ${problem}`);
      result[key] = value;
    }
    return result;
  }

  private valueContext() {
    return { metamodel: this.mm, objectTypeOf: (id: string) => this.state.objects.get(id)?.type };
  }

  private storedProperties(obj: ObjectRow): Record<string, PropertyValue> {
    // Calculated values are recomputed after a restore rather than written back by a user change.
    return Object.fromEntries(
      Object.entries(obj.properties).filter(([k]) => this.mm.propertyType(k)?.dataType !== "calculated"),
    );
  }

  // ------------------------------------------------------------------ concurrency

  /**
   * Per-property conflict check. `fields` are the fields the edit touches; `"*"` means the whole item
   * (deletes), which conflicts with any change made since the edit's base version.
   */
  private checkBase<C extends VersionedCollection>(
    collection: C,
    row: Rows[C],
    baseVersion: number,
    fields: string[],
  ): void {
    const key = `${collection}:${row.id}`;
    const start = this.startRows.has(key) ? this.startRows.get(key) : row;
    if (!start) return; // created in this change
    if (baseVersion > start.version) this.invalid("baseVersion", `Version ${baseVersion} does not exist yet`);
    if (start.version === baseVersion) return;
    const stamps = start.fieldVersions;
    const latest = (f: string) => {
      const own = stamps[f];
      const all = stamps["*"];
      if (!own) return all;
      if (!all) return own;
      return own.v >= all.v ? own : all;
    };
    for (const field of fields) {
      const stamp =
        field === "*"
          ? Object.values(stamps).reduce<FieldStamp | undefined>((a, b) => (!a || b.v > a.v ? b : a), undefined)
          : latest(field);
      if (stamp && stamp.v > baseVersion) {
        this.reject({ code: "conflict", editIndex: this.index, property: field, changedBy: stamp.by });
      }
    }
  }

  private markChanged(collection: VersionedCollection, id: Id, fields: string[]): void {
    const key = `${collection}:${id}`;
    let set = this.changedFields.get(key);
    if (!set) this.changedFields.set(key, (set = new Set()));
    for (const f of fields) set.add(f);
  }

  // ------------------------------------------------------------------ state access

  private write<C extends CollectionName>(collection: C, row: Rows[C]): void {
    if (VERSIONED.has(collection)) {
      const key = `${collection}:${row.id}`;
      if (!this.startRows.has(key)) {
        this.startRows.set(
          key,
          this.state.collection(collection).getAny(row.id) as Rows[VersionedCollection] | undefined,
        );
      }
      if (row.deleted) this.markChanged(collection as VersionedCollection, row.id, ["*"]);
    }
    this.state.put(collection, row);
  }

  /** Scenario bookkeeping carried over when an item is restored from a tombstone. */
  private meta(tombstone: { scenarioId?: Id; baseVersion?: number | null } | undefined) {
    if (!tombstone) return {};
    return {
      ...(tombstone.scenarioId !== undefined ? { scenarioId: tombstone.scenarioId } : {}),
      ...(tombstone.baseVersion !== undefined ? { baseVersion: tombstone.baseVersion } : {}),
    };
  }

  private requireNewId(collection: CollectionName, id: Id, property = "id"): void {
    if (this.state.collection(collection).get(id)) this.invalid(property, `${id} already exists`);
  }

  /** The item an edit is about. Deleted meanwhile → "gone". */
  private requireLive<C extends CollectionName>(collection: C, id: Id): Rows[C] {
    const row = this.state.collection(collection).get(id);
    if (row) return row;
    return this.missing(collection, id, "id");
  }

  /** An item an edit refers to (a folder, a source object…). */
  private refLive<C extends CollectionName>(collection: C, id: Id, property: string): Rows[C] {
    const row = this.state.collection(collection).get(id);
    if (row) return row;
    return this.missing(collection, id, property);
  }

  private occurrenceOn<C extends "objectOccurrences" | "relationshipOccurrences" | "annotations">(
    collection: C,
    id: Id,
    diagramId: Id,
    property = "occurrenceId",
  ): Rows[C] {
    const row = this.state.collection(collection).get(id);
    if (row && row.diagramId === diagramId) return row;
    if (row) this.invalid(property, `${id} is on another diagram`);
    return this.missing(collection, id, property);
  }

  private missing(collection: CollectionName, id: Id, property: string): never {
    if (this.state.collection(collection).getAny(id)) this.reject({ code: "gone", editIndex: this.index, itemId: id });
    this.invalid(
      property,
      `Unknown ${collection
        .replace(/s$/, "")
        .replace(/([A-Z])/g, " $1")
        .toLowerCase()} ${id}`,
    );
  }

  // ------------------------------------------------------------------ results

  private step(...edits: Edit[]): void {
    this.steps.push(edits);
  }

  private finding(rule: string, itemId: Id, message: string): void {
    this.findings.push({ rule, itemId, severity: "warning", message });
  }

  private invalid(property: string, message: string): never {
    this.reject({ code: "invalid", editIndex: this.index, property, message });
  }

  private reject(rejection: Rejection): never {
    throw new Reject(rejection);
  }
}

function splitKey(key: string): [VersionedCollection, Id] {
  const i = key.indexOf(":");
  return [key.slice(0, i) as VersionedCollection, key.slice(i + 1)];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
