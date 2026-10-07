// Views beyond the free canvas (design/02-model/views-and-design-artifacts.md). Built in slice V-1: the matrix.
import type { Id, SemanticCategory, SemanticKind, TypeKey } from "./model";

/** What a diagram of a type shows and how it is laid out (§2). Absent = canvas. */
export type ViewKind = "canvas" | "matrix";
export const VIEW_KINDS: readonly ViewKind[] = ["canvas", "matrix"];

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
