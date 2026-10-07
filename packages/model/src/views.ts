// Views beyond the free canvas (design/02-model/views-and-design-artifacts.md). Built in slice V-1: the matrix;
// slice V-2: the document view (design artifacts).
import type { Id, PropertyKey, SemanticCategory, SemanticKind, TypeKey } from "./model";

/** What a diagram of a type shows and how it is laid out (§2). Absent = canvas. */
export type ViewKind = "canvas" | "matrix" | "document";
export const VIEW_KINDS: readonly ViewKind[] = ["canvas", "matrix", "document"];

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

/** The components a document section can be (§8.1). Built in V-2; the rest of §8.1 follows in later slices. */
export type ComponentKey = "heading" | "prose" | "facts" | "diagramLink" | "relationTable";
export const COMPONENT_KEYS: readonly ComponentKey[] = ["heading", "prose", "facts", "diagramLink", "relationTable"];

/** A document's definition key holding its subject; a template may not name a section after it. */
export const SUBJECT_KEY = "subject";

/** One section of a document template (§7.1). */
export type SectionDefinition = { key: string; title: string; guidance?: string; required?: boolean } & (
  | { component: "heading" }
  | { component: "prose"; config?: { mentions?: { create?: boolean } } }
  | { component: "facts"; config: { properties: PropertyKey[] } }
  | { component: "diagramLink"; config: { diagramType: TypeKey; placeSubject?: boolean } }
  | { component: "relationTable"; config: RelationTableConfig }
);

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
}

/**
 * A table column: "direction", "payload", a property key, or one column over several properties (the first that the
 * row's relationship type has), so a flow's and an interaction's protocol share a column.
 */
export type TableColumn = string | { key: string; label: string; properties: PropertyKey[] };

/** A document template (§7.1): a diagram type of kind "document". */
export interface DocumentTemplate {
  /** Which objects may be the subject. */
  subject: { type?: TypeKey[]; category?: SemanticCategory[] };
  sections: SectionDefinition[];
}

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
}
