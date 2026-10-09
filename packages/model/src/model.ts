// Connectome — model types shared by browser, server and SDK. Mirrors 02-model/overview.md.
// Ids are ULIDs. Property keys are "<group>.<name>", e.g. "lifecycle.status".

export type Id = string;
export type IsoDate = string;
export type IsoDateTime = string;
export type PropertyKey = string;
export type TypeKey = string;

// ================================================================ repository
export interface Repository {
  id: Id;
  workspaceId: Id;
  name: string;
  description: string;
  metamodelVersion: string;
  seq: number; // last committed change
  settings: { currency: string };
}

export type ScenarioState = "baseline" | "draft" | "proposed" | "approved" | "merged" | "archived";
export interface Scenario {
  id: Id;
  parentId: Id | null;
  name: string;
  state: ScenarioState;
}

export interface Folder {
  id: Id;
  parentId: Id | null;
  name: string;
  /** build: place among its siblings in the explorer (edit `setRank`); absent = after the ranked ones, by name. */
  rank?: string;
}

// ================================================================ metamodel
export type DataType =
  | "text"
  | "richText"
  | "number"
  | "money"
  | "date"
  | "boolean"
  | "list"
  | "multiList"
  | "objectRef"
  | "person"
  | "url"
  | "calculated";

export interface ValueList {
  key: string;
  values: Array<{ key: string; label: string; color?: string; order?: number }>;
}

/** build: an editor hint on a property type; "auto" picks one from the data type and the value list. */
export type PropertyEditor =
  "auto" | "dropdown" | "segmented" | "radio" | "rating" | "switch" | "checkbox" | "checkboxes" | "chips";

export interface PropertyType {
  key: PropertyKey;
  name: string;
  group: string;
  dataType: DataType;
  unit?: string;
  valueList?: string;
  objectTypes?: TypeKey[];
  required?: boolean;
  default?: PropertyValue;
  help?: string;
  validation?: { min?: number; max?: number; pattern?: string; maxLength?: number; decimals?: number };
  formula?: { expression: string; resultType: Exclude<DataType, "calculated" | "richText"> };
  role?: string; // e.g. "lifecycle.activeFrom", "owner"
  /** build: how the properties panel edits the value (design/04-ux/workbench.md "Properties panel"); default auto. */
  editor?: PropertyEditor;
  master?: string; // external system that owns the value
}

export interface SymbolStyle {
  shape: "rect" | "roundRect" | "ellipse" | "hexagon" | "cylinder" | "person" | "icon";
  fill: string;
  stroke: string;
  icon?: string;
  /** Which rendition draws it: box, card, glyph, chip or container (notation-and-metamodel-admin.md §4). */
  rendition?: string;
  width: number;
  height: number;
  label: string;
}

export interface LineStyle {
  style: "solid" | "dashed" | "dotted";
  color: string;
  startArrow: "none" | "arrow" | "diamond" | "circle";
  endArrow: "none" | "arrow" | "diamond" | "circle";
}

/** The built-in semantic vocabulary (02-model/semantics.md). Custom types map onto it. */
export type SemanticKind =
  | "containment"
  | "composition"
  | "aggregation"
  | "association"
  | "realisation"
  | "representation"
  | "serving"
  | "access"
  | "flow"
  | "trigger"
  | "assignment"
  | "influence"
  | "specialisation"
  | "interaction";

export type SemanticCategory =
  | "actor"
  | "capability"
  | "behaviour"
  | "service"
  | "interface"
  | "component"
  | "information"
  | "technology"
  | "location"
  | "motivation"
  | "other";

export type SemanticAbstraction = "conceptual" | "logical" | "physical" | "implementation";
/** Whether a relationship type carries a payload (semantics §2.2). */
export type PayloadUse = "none" | "optional" | "expected";

/** build: a named, ordered selection of a type's properties (design/04-ux/workbench.md "Properties panel"). */
export interface PropertySet {
  key: string;
  name: string;
  properties: PropertyKey[];
}

export interface ObjectType {
  key: TypeKey;
  name: string;
  plural?: string;
  extends?: TypeKey;
  abstract?: boolean;
  layer?: string;
  properties: PropertyKey[];
  symbol?: Partial<SymbolStyle>;
  uniqueName?: "repository" | "folder" | "container" | "none"; // design/02-model/duplicates-and-identity.md §4
  uniqueAcross?: "type" | "family"; // family: also clashes with parent, child and sibling types
  uniquePerAbstraction?: boolean; // default true: the same name may exist at another abstraction
  onClash?: "block" | "warn"; // default block; warn saves and adds a finding
  keyPattern?: string; // "APP-{0000}"
  defaultFolder?: string; // folder path
  category?: SemanticCategory; // design/02-model/semantics.md §4.1; inherited through extends
  abstraction?: SemanticAbstraction; // default semantic.abstraction of its objects
  abstractionFixed?: boolean; // objects always have the type's abstraction
  /** build: named selections of its properties (properties panel, review pages); inherited, replaced by key. */
  propertySets?: PropertySet[];
}

export interface RelationshipType {
  key: TypeKey;
  name: string;
  verb: string;
  inverseVerb: string;
  nesting?: boolean; // can be shown by placing one symbol inside another; forms hierarchies
  singleParent?: boolean; // at most one parent through this type
  semantic?: SemanticKind; // what the engine understands it to mean (default "association")
  semanticDirection?: "forward" | "reverse"; // reverse: the source plays the kind's target role
  cascadeDelete?: boolean; // composition: deleting the whole deletes its parts
  payload?: PayloadUse; // whether relationships carry objects (default "optional" for flow and trigger, else "none")
  distinct?: "pair" | "pairAndPayload" | "none"; // what counts as a duplicate relationship (default by kind)
  properties?: PropertyKey[];
  line?: Partial<LineStyle>;
}

export interface RelationshipRule {
  relationshipType: TypeKey;
  sourceType: TypeKey | "*";
  targetType: TypeKey | "*";
  cardinality?: "0..1" | "0..*" | "1..1" | "1..*";
  enforcement: "block" | "warn";
}

// Diagram types: see diagram-type.schema.json (structure kept as JSON for packages).

// ================================================================ model
export type Money = { amount: number; currency: string };
export type PropertyValue = string | number | boolean | Money | string[] | null;

interface ModelItem {
  id: Id;
  type: TypeKey;
  version: number;
  properties: Record<PropertyKey, PropertyValue>;
  tags: string[];
  externalIds: Record<string, string>;
  updatedAt: IsoDateTime;
  updatedBy: Id;
}

/** An object. Named ModelObject in code because "Object" is reserved in TypeScript. */
export interface ModelObject extends ModelItem {
  name: string;
  key: string | null;
  folderId: Id;
  description: string;
  /** build: place among its siblings (in its folder, or its container) in the explorer. */
  rank?: string;
  /** build: who last confirmed each property's value, and when (reviews in the properties panel); absent = none. */
  confirmations?: Record<PropertyKey, Confirmation>;
  /** build: other names it goes by, for search and duplicate detection (edit `setAliases`); absent = none. */
  aliases?: string[];
  /** build: objects someone judged it is not a duplicate of (edit `setNotDuplicates`); absent = none. */
  notDuplicates?: NotDuplicate[];
}

/**
 * build: "not the same thing as `of`", judged while the two had these names (duplicates-and-identity.md §6). A rename
 * of either makes the pair a candidate again.
 */
export interface NotDuplicate {
  of: Id;
  name: string;
  otherName: string;
}

/** build: "this value is still right", as of a commit (edit `confirmProperties`). */
export interface Confirmation {
  by: Id;
  at: IsoDateTime;
}

export interface Relationship extends ModelItem {
  sourceId: Id;
  targetId: Id;
  name: string;
  derivedBy: string | null; // derived relationships: the rule that maintains it
  payload: Id[]; // what it carries, in order (semantics §5)
  parentId: Id | null; // a message: the interaction it belongs to (semantics §6)
  rank: number; // orders the messages of an interaction
}

// ================================================================ diagrams
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Diagram {
  id: Id;
  name: string;
  description: string;
  diagramType: TypeKey;
  /** build: place among its siblings in the explorer. */
  rank?: string;
  folderId: Id;
  version: number;
  generatedBy: { rule: string; focusObjectId: Id } | null;
  /** build (slice V-1): what a matrix or other view shows (02-model/views-and-design-artifacts.md); absent = {}. */
  definition?: Record<string, unknown>;
  /** build: values of its diagram type's `properties` (slice A-1b); absent means none. */
  properties?: Record<PropertyKey, PropertyValue>;
  objectOccurrences: ObjectOccurrence[];
  relationshipOccurrences: RelationshipOccurrence[];
  annotations: Annotation[];
}

export interface ObjectOccurrence extends Rect {
  id: Id;
  objectId: Id; // many occurrences may point to the same object, also on one diagram
  parentOccurrenceId: Id | null; // nested: x/y relative to the parent occurrence
  z: number;
  style: Partial<SymbolStyle>;
  drillDownDiagramId: Id | null;
  pinned: boolean; // generated diagrams: keep on regeneration
}

export interface RelationshipOccurrence {
  id: Id;
  relationshipId: Id;
  sourceOccurrenceId: Id;
  targetOccurrenceId: Id; // occurrences of the relationship's source and target objects
  shownAs: "line" | "nesting";
  route: { mode: "auto" } | { mode: "manual"; points: Array<[number, number]> };
  labelPosition: number;
  style: Partial<LineStyle>;
  /** build (slice V-3): a message's place in a sequence view, a fractional-index key; absent elsewhere. */
  step?: string;
}

export interface Annotation extends Rect {
  id: Id;
  parentOccurrenceId: Id | null;
  z: number;
  content:
    | { shape: "text" | "note" | "rect" | "ellipse"; text: string }
    | { shape: "frame"; title: string }
    | { shape: "image"; attachmentId: Id };
  style: Partial<SymbolStyle>;
}

// ================================================================ catalogues and other views
export type CatalogueColumn =
  | { kind: "name" | "key" | "type" | "folder" }
  | { kind: "property"; property: PropertyKey; editable: boolean }
  | { kind: "related"; path: string; label: string } // "-realizes-> type:capability"
  | { kind: "aggregate"; expression: string; label: string }; // "count(<-serves-)"

export interface Catalogue {
  id: Id;
  name: string;
  folderId: Id;
  version: number;
  query: string;
  columns: CatalogueColumn[];
  sort: Array<{ column: number; direction: "asc" | "desc" }>;
  groupBy?: PropertyKey;
  asOf?: IsoDate | "today";
}

export type OtherView =
  | { kind: "matrix"; rows: string; columns: string; relationshipType: TypeKey; cellProperty?: PropertyKey }
  | { kind: "roadmap"; query: string; groupBy?: string; from: IsoDate; to: IsoDate; colourBy?: PropertyKey }
  | {
      kind: "chart";
      chart: "bar" | "pie" | "heatmap" | "bubble";
      query: string;
      groupBy?: string;
      measure: { fn: "count" | "sum" | "avg"; of?: PropertyKey };
    }
  | {
      kind: "dashboard";
      tiles: Array<Rect & { viewId?: Id; figure?: { query: string; measure: string; label: string } }>;
    };

// ================================================================ collaboration
export interface Comment {
  id: Id;
  threadId: Id;
  anchor: { objectId: Id } | { relationshipId: Id } | { diagramId: Id; occurrenceId?: Id } | { changeRequestId: Id };
  authorId: Id;
  body: string;
  resolved: boolean;
  createdAt: IsoDateTime;
}

export interface ChangeRequest {
  id: Id;
  title: string;
  description: string;
  scenarioId: Id | null;
  authorId: Id;
  state: "open" | "inReview" | "approved" | "rejected" | "applied" | "withdrawn";
  reviewers: Array<{
    userId?: Id;
    groupId?: Id;
    required: boolean;
    decision?: "approved" | "rejected" | "changesRequested";
    comment?: string;
  }>;
}

export interface RuleFinding {
  rule: string;
  itemId: Id;
  severity: "info" | "warning" | "error";
  message: string;
}
