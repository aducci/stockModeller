// Connectome — edits and changes: the only way anything is written. See 03-platform/collaboration-and-changes.md.
// Additions made while building are marked "build:" (see storage.md, "Additions made while building").
import type {
  Id,
  TypeKey,
  PropertyKey,
  PropertyValue,
  Confirmation,
  ObjectOccurrence,
  RelationshipOccurrence,
  Annotation,
  SymbolStyle,
  LineStyle,
  RuleFinding,
} from "./model";

export interface OnExisting {
  id: Id;
  baseVersion: number;
}

/** build: a style patch; `null` removes an override (needed so every style edit has an exact inverse). */
export type StylePatch = { [K in keyof (SymbolStyle & LineStyle)]?: (SymbolStyle & LineStyle)[K] | null };

// ================================================================ model edits
export type ModelEdit =
  | {
      edit: "createObject";
      id: Id;
      type: TypeKey;
      name: string;
      folderId: Id;
      key?: string;
      description?: string;
      properties?: Record<PropertyKey, PropertyValue>;
      tags?: string[];
      externalIds?: Record<string, string>;
      /** build: so that restoring a deleted object is exact. */
      confirmations?: Record<PropertyKey, Confirmation>;
    }
  | ({ edit: "setProperties"; set: Record<PropertyKey, PropertyValue> } & OnExisting) // null clears a value
  | ({ edit: "renameObject"; name: string } & OnExisting)
  | ({ edit: "setTags"; tags: string[] } & OnExisting)
  /** build: an object's description; "" clears it. */
  | ({ edit: "setDescription"; description: string } & OnExisting)
  /** build: confirms that the values of `keys` are still right, stamped with the change's author and time. */
  | ({ edit: "confirmProperties"; keys: PropertyKey[] } & OnExisting)
  /** build: puts confirmations back as they were (the inverse of confirmProperties); null removes one. */
  | ({ edit: "setConfirmations"; set: Record<PropertyKey, Confirmation | null> } & OnExisting)
  | ({ edit: "moveToFolder"; folderId: Id } & OnExisting)
  | ({ edit: "changeObjectType"; type: TypeKey; propertyMap?: Record<PropertyKey, PropertyKey> } & OnExisting)
  /**
   * Also deletes its relationships and occurrences. build: `contents` says what happens to the objects it contains
   * (semantics §7): "moveUp" (default) puts them in its own container, "deleteContents" deletes them too.
   */
  | ({ edit: "deleteObject"; contents?: "moveUp" | "deleteContents" } & OnExisting)
  | {
      edit: "createRelationship";
      id: Id;
      type: TypeKey;
      sourceId: Id;
      targetId: Id;
      name?: string;
      properties?: Record<PropertyKey, PropertyValue>;
      /** build: so that restoring a deleted relationship is exact. */
      tags?: string[];
      /** build: so that restoring a deleted relationship is exact. */
      externalIds?: Record<string, string>;
      /** build: what it carries (semantics §5); only types whose `payload` is not "none". */
      payload?: Id[];
      /** build: the interaction this flow is a message of (semantics §6). */
      parentId?: Id | null;
      /** build: orders an interaction's messages; defaults to after its last message. */
      rank?: number;
    }
  | ({ edit: "reconnectRelationship"; sourceId?: Id; targetId?: Id } & OnExisting)
  /** build: change a relationship's type (semantics §11); `set` restores values the old type had (used by undo). */
  | ({
      edit: "changeRelationshipType";
      type: TypeKey;
      propertyMap?: Record<PropertyKey, PropertyKey>;
      set?: Record<PropertyKey, PropertyValue>;
    } & OnExisting)
  /** build: replaces what a relationship carries (semantics §5). */
  | ({ edit: "setPayload"; payload: Id[] } & OnExisting)
  /** build: a relationship's property values, as setProperties does for objects; null clears a value. */
  | ({ edit: "setRelationshipProperties"; set: Record<PropertyKey, PropertyValue> } & OnExisting)
  /** Deleting an interaction deletes its messages too (semantics §6). */
  | ({ edit: "deleteRelationship" } & OnExisting)
  | { edit: "createFolder"; id: Id; parentId: Id | null; name: string }
  | { edit: "renameFolder"; id: Id; name: string }
  | { edit: "moveFolder"; id: Id; parentId: Id | null }
  | { edit: "deleteFolder"; id: Id; contents: "refuseIfNotEmpty" | "deleteContents" }
  /**
   * build: place an item among its siblings in the explorer (its folder, or its container for a contained object).
   * `rank` is a fractional-index key; `null` drops it (unranked items follow ranked ones, by name). Last writer wins.
   */
  | { edit: "setRank"; item: "folder" | "object" | "diagram"; id: Id; rank: string | null };

// ================================================================ diagram edits (layout: last writer wins)
export type DiagramEdit =
  | {
      edit: "createDiagram";
      id: Id;
      name: string;
      diagramType: TypeKey;
      folderId: Id;
      /** build: so that restoring a deleted diagram is exact. */
      description?: string;
      /** build: so that restoring a deleted diagram is exact (slice A-1b). */
      properties?: Record<PropertyKey, PropertyValue>;
    }
  | {
      edit: "updateDiagram";
      id: Id;
      baseVersion: number;
      set: { name?: string; description?: string; folderId?: Id; diagramType?: TypeKey };
    }
  /** build: a diagram's property values (its diagram type's `properties`); null clears a value. */
  | ({ edit: "setDiagramProperties"; set: Record<PropertyKey, PropertyValue> } & OnExisting)
  | { edit: "deleteDiagram"; id: Id }
  | { edit: "addObjectOccurrence"; diagramId: Id; occurrence: ObjectOccurrence }
  | {
      edit: "moveObjectOccurrence";
      diagramId: Id;
      occurrenceId: Id;
      x: number;
      y: number;
      w?: number;
      h?: number;
      /** Nesting under another occurrence must be backed by a nesting relationship (created in the same change if new). */
      parentOccurrenceId?: Id | null;
    }
  | { edit: "styleOccurrence"; diagramId: Id; occurrenceId: Id; style: StylePatch; z?: number }
  | { edit: "removeOccurrence"; diagramId: Id; occurrenceId: Id } // the object stays in the model
  | { edit: "addRelationshipOccurrence"; diagramId: Id; occurrence: RelationshipOccurrence }
  | {
      edit: "routeRelationshipOccurrence";
      diagramId: Id;
      occurrenceId: Id;
      route: RelationshipOccurrence["route"];
      labelPosition?: number;
    }
  | { edit: "addAnnotation"; diagramId: Id; annotation: Annotation }
  | { edit: "updateAnnotation"; diagramId: Id; annotationId: Id; set: Partial<Omit<Annotation, "id">> }
  /** build: annotations could be added and updated but not removed. */
  | { edit: "removeAnnotation"; diagramId: Id; annotationId: Id };

export type Edit = ModelEdit | DiagramEdit;
export type EditKind = Edit["edit"];

// ================================================================ changes
export const MAX_EDITS_PER_CHANGE = 10_000;

export interface Change {
  id: Id; // generated by the client; resending is safe
  scenarioId: Id;
  label: string; // "Move Claims Manager"
  changeRequestId?: Id;
  edits: Edit[]; // 1..10,000, applied in order, all or nothing
}

export interface Actor {
  kind: "user" | "automation" | "system";
  id: Id;
}

export type ChangeSource = "ui" | "api" | "automation" | "system" | "import" | "merge" | "undo";

export interface CommittedChange extends Change {
  seq: number;
  actor: Actor;
  source: ChangeSource;
  committedAt: string;
  versions: Record<Id, number>;
}

/**
 * build: one change_log row. `inverse` is a list because one edit can cascade
 * (deleting an object also deletes its relationships and occurrences); applying the
 * inverse lists of a change's entries in reverse order restores the state before it.
 */
export interface LogEntry {
  editIndex: number;
  itemId: Id | null;
  edit: Edit;
  inverse: Edit[];
}

export type Rejection =
  | { code: "conflict"; editIndex: number; property: string; changedBy: Id }
  | { code: "gone"; editIndex: number; itemId: Id }
  | { code: "ruleViolation"; editIndex: number; rule: string; message: string }
  | { code: "forbidden"; editIndex: number; scope: string }
  | { code: "invalid"; editIndex: number; property: string; message: string };

export type { RuleFinding };

// ================================================================ live connection (WebSocket)
export type ClientMessage =
  | { type: "submit"; change: Change }
  | { type: "presence"; diagramId?: Id; selection?: Id[]; cursor?: { x: number; y: number } }
  | { type: "interest"; add?: Id[]; remove?: Id[] };

export type ServerMessage =
  | { type: "committed"; change: CommittedChange }
  | { type: "rejected"; changeId: Id; reasons: Rejection[] }
  | { type: "held"; changeId: Id; changeRequestId: Id }
  | {
      type: "presence";
      users: Array<{
        id: Id;
        name: string;
        color: string;
        diagramId?: Id;
        selection: Id[];
        cursor?: { x: number; y: number };
      }>;
    }
  | { type: "resync"; fromSeq: number };
