// Views beyond the free canvas (design/02-model/views-and-design-artifacts.md). Built in slice V-1: the matrix;
// slice V-2: the document view (design artifacts).
import type { Id, PropertyKey, SemanticCategory, SemanticKind, TypeKey } from "./model";

/** What a diagram of a type shows and how it is laid out (§2). Absent = canvas. */
export type ViewKind = "canvas" | "matrix" | "document" | "sequence";
export const VIEW_KINDS: readonly ViewKind[] = ["canvas", "matrix", "document", "sequence"];

/** Kinds whose diagrams hold occurrences drawn by hand (lifelines and messages are occurrences in a sequence). */
export const DRAWN_KINDS: readonly ViewKind[] = ["canvas", "sequence"];

/** One step of a structured path (§3): follow relationships by type or by semantic kind, then filter what is reached. */
export interface ScopeStep {
  type?: TypeKey[];
  kind?: SemanticKind[];
  dir: "out" | "in" | "either";
  to?: ScopeFilter;
}

export interface ScopeFilter {
  /** Object types; a type matches its subtypes too. */
  type?: TypeKey[];
  category?: SemanticCategory[];
  folder?: Id;
}

/** A structured path (§3): the AST the query parser will produce later (decision V11). */
export interface Scope {
  from: ScopeFilter;
  steps?: ScopeStep[];
  order?: "name" | "rank";
}

/** A matrix view's definition (§4). Stored on the diagram; missing keys come from the diagram type's `matrix`. */
export interface MatrixDefinition {
  rows: Scope;
  columns: Scope;
  relationships: {
    types?: TypeKey[];
    kinds?: SemanticKind[];
    /** Which way a relationship runs for a cell to show it. */
    dir?: "rowToColumn" | "columnToRow" | "either";
  };
  /** The relationship type a click on an empty cell creates; otherwise the allowed matching type, or a choice. */
  create?: TypeKey;
  /** Nest rows under their containers when both are rows. */
  groupRows?: boolean;
  hideEmpty?: boolean;
}

// ================================================================ documents (§7–§8)

/** The components a document section can be (§8.1). Built in V-2 and V-4; the rest of §8.1 follows in later slices. */
export type ComponentKey =
  "heading" | "prose" | "facts" | "diagramLink" | "relationTable" | "repeater" | "sequenceLink";
export const COMPONENT_KEYS: readonly ComponentKey[] = [
  "heading",
  "prose",
  "facts",
  "diagramLink",
  "relationTable",
  "repeater",
  "sequenceLink",
];
/** Components an author may add in a region; the repeater and sequenceLink need a row, so they come from templates. */
export const REGION_COMPONENT_KEYS: readonly ComponentKey[] = [
  "heading",
  "prose",
  "facts",
  "diagramLink",
  "relationTable",
];

/**
 * A view's definition key holding its subject, the element it is about: a document's, or since slice DOC-1 any
 * diagram's (views-and-design-artifacts.md §12). A template may not name a section after it.
 */
export const SUBJECT_KEY = "subject";

/** build (slice DOC-1): a link in a url property to a diagram or document of the repository is `diagram:<id>`. */
export const DIAGRAM_LINK = "diagram:";

/** The links a url property holds: none, one (a single value) or a list (`many`). */
export function linksOf(value: unknown): string[] {
  if (typeof value === "string") return value ? [value] : [];
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** The diagram a link names, or undefined for a web link. */
export function linkedDiagramId(link: string): string | undefined {
  return link.startsWith(DIAGRAM_LINK) ? link.slice(DIAGRAM_LINK.length) : undefined;
}

/** What authors may change in a section (§8.2): `fixed` nothing but its content, `free` also its title and whether it shows. */
export type SectionLock = "fixed" | "configurable" | "free";

/** The freedoms a `configurable` section grants (§8.2); a `free` section has them all, a `fixed` one none. */
export interface SectionAllow {
  /** Facts: add more of the subject's properties. */
  addProperties?: boolean;
  /** Tables: hide optional columns, add property columns. */
  columns?: boolean;
  /** Hide the section when it is not required. */
  hide?: boolean;
}

interface SectionCommon {
  key: string;
  title: string;
  guidance?: string;
  required?: boolean;
  /** Default `configurable`. */
  lock?: SectionLock;
  allow?: SectionAllow;
  /** In a template that `extends` another: insert after this section of the base (default: at the end). */
  after?: string;
}

/** One section of a document template (§7.1). */
export type SectionDefinition = SectionCommon &
  (
    | { component: "heading" }
    | { component: "prose"; config?: { mentions?: { create?: boolean } } }
    | { component: "facts"; config: FactsConfig }
    | { component: "diagramLink"; config: { diagramType: TypeKey; placeSubject?: boolean } }
    | { component: "relationTable"; config: RelationTableConfig }
    | { component: "repeater"; config: RepeaterConfig }
    | { component: "sequenceLink"; config: { diagramType: TypeKey } }
  );

export interface FactsConfig {
  properties: PropertyKey[];
  /** Inside a repeater: the row's counterpart (`row`, the default there) or its relationship. Elsewhere the subject. */
  of?: "row" | "relationship";
}

/** A table of relationships (§7.2): rows from a linked diagram's connectors, or from the subject's relationships. */
export interface RelationTableConfig {
  /** `section` names a diagramLink section: one row per connector on that diagram. Otherwise the subject's own. */
  source: { section?: string; relationships: { types?: TypeKey[]; kinds?: SemanticKind[] } };
  /** The counterpart is always the first column; these follow it. */
  columns: TableColumn[];
  /** Keys of the columns a row must fill to be described. */
  required?: string[];
  /** Offer "+ Add" for these relationship types or kinds, placed on the linked diagram when the source is one. */
  add?: { label?: string; types?: TypeKey[]; kinds?: SemanticKind[] };
  /** Warn about the subject's relationships of the source's types or kinds that are not on the linked diagram. */
  missing?: boolean;
  /** Per row, a child sequence diagram of this type for the row's interaction, created on demand (§7.2, V4). */
  perRow?: { sequence: TypeKey };
  /**
   * build (slice DOC-2): under each row, what its connection stands for (§12): the elements in a reference property
   * of the connection, and the more concrete flows its ends' scopes imply.
   */
  expand?: RelationTableExpand;
}

export interface RelationTableExpand {
  /** An objectRef property with `many` on the rows' relationship types, e.g. `integration.informationFlows`. */
  property: PropertyKey;
  /** An objectRef property with `many` holding the implied elements a connection does not stand for. */
  exclude?: PropertyKey;
  /** "+ Add" under a row creates one of these types and lists it in the property, in one change. */
  add?: { label?: string; types: TypeKey[] };
  /** A sequence diagram of this type about each element, created on demand. */
  sequence?: TypeKey;
  /** A row is to describe until it stands for at least one element or implied flow. */
  required?: boolean;
}

/**
 * For each row of a relation table section, a block of child sections (§8.1): the row's facts, its sequence, a note.
 * Children see the row: facts of the counterpart or the relationship, a sequenceLink for the row's interaction.
 */
export interface RepeaterConfig {
  /** The key of a relationTable section. */
  source: { section: string };
  sections: SectionDefinition[];
}

/**
 * A table column: "direction", "payload", a property key, or one column over several properties (the first that the
 * row's relationship type has), so a flow's and an interaction's protocol share a column.
 */
export type TableColumn = string | { key: string; label: string; properties: PropertyKey[] };

/** A place in a template where authors may add sections from a palette (§8.2). */
export interface RegionDefinition {
  region: string;
  title: string;
  guidance?: string;
  palette: ComponentKey[];
  /** At most this many added sections. */
  max?: number;
  after?: string;
}

/** A template includes a pattern (§8.4) with its parameters; `prefix` keeps keys apart when a pattern is used twice. */
export interface PatternUse {
  use: string;
  with?: Record<string, unknown>;
  prefix?: string;
  after?: string;
}

export type TemplateEntry = SectionDefinition | RegionDefinition | PatternUse;

/** What a template may change in a section it got from a pattern or a base template; never its bindings (§8.4). */
export interface SectionOverride {
  title?: string;
  guidance?: string;
  lock?: SectionLock;
  allow?: SectionAllow;
}

/** A document template (§7.1): a diagram type of kind "document". */
export interface DocumentTemplate {
  /** Which objects may be the subject. Inherited when the template extends another. */
  subject?: { type?: TypeKey[]; category?: SemanticCategory[] };
  /** Another document type whose sections come first; this template's own are inserted (`after`) or appended. */
  extends?: TypeKey;
  sections: TemplateEntry[];
  /** By section key, after patterns and the base are resolved. */
  overrides?: Record<string, SectionOverride>;
}

/** A reusable, parameterised group of sections (§8.4), defined in a metamodel package. */
export interface DocumentPattern {
  key: string;
  name: string;
  description?: string;
  /** A string value `"$template.<param>"` anywhere in the sections is replaced by the parameter; `null` removes it. */
  params?: Record<string, { description?: string; default?: unknown }>;
  sections: (SectionDefinition | RegionDefinition)[];
}

/** A template with its patterns and base resolved: sections and regions in order, every section with its lock. */
export interface ResolvedTemplate {
  subject: { type?: TypeKey[]; category?: SemanticCategory[] };
  entries: (ResolvedSection | RegionDefinition)[];
}
export type ResolvedSection = SectionDefinition & { lock: SectionLock; allow: SectionAllow };

/** Prose (§9): paragraphs of text runs and mentions, so a renamed object needs no rewrite. */
export type ProseInline = string | { mention: Id };
export interface ProseState {
  paragraphs: ProseInline[][];
}
export interface DiagramLinkState {
  diagramId: Id;
}
export interface RelationTableState {
  /** Relationships the missing banner no longer mentions. */
  ignored?: Id[];
  /** Each row's sequence diagram, by the row's relationship. */
  sequences?: Record<Id, Id>;
}

/**
 * What an author changed in a section, within its lock (§8.2). Kept under the section's key in `definition.layout`,
 * so changing the layout never conflicts with writing the content.
 */
export interface SectionLayout {
  hidden?: boolean;
  title?: string;
  /** Facts: more properties. */
  properties?: PropertyKey[];
  /** Tables: optional columns not shown, and property columns added. */
  hiddenColumns?: string[];
  columns?: PropertyKey[];
}

/** The definition key holding every section's layout, and the sections authors added in regions. */
export const LAYOUT_KEY = "layout";
export interface DocumentLayout {
  sections?: Record<string, SectionLayout>;
  /** By region: the sections added there, in order (each `free`, its content under its own key). */
  regions?: Record<string, SectionDefinition[]>;
}

/** A repeater's state: by row relationship, each child section's state. */
export interface RepeaterState {
  rows?: Record<Id, Record<string, unknown>>;
}
