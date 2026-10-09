// Connectome — metamodel packages and diagram types, as stored in JSON.
// Shapes follow design/05-structures/metamodel.schema.json and diagram-type.schema.json.
import type {
  ObjectType,
  PropertyKey,
  PropertyType,
  RelationshipRule,
  RelationshipType,
  RuleFinding,
  SemanticAbstraction,
  SemanticCategory,
  SymbolStyle,
  TypeKey,
  ValueList,
} from "./model";
import type { DocumentPattern, DocumentTemplate, MatrixDefinition, ViewKind } from "./views";

export interface Layer {
  key: string;
  name: string;
  order?: number;
  color?: string;
}

export interface ValidationRule {
  key: string;
  when: string;
  check: string;
  message: string;
  severity?: RuleFinding["severity"];
}

export interface DerivationRule {
  key: string;
  derive: string;
  from: string;
  store?: boolean;
}

export interface ExchangeMapping {
  format: string;
  objectTypes?: Record<string, TypeKey>;
  relationshipTypes?: Record<string, TypeKey>;
  properties?: Record<string, string>;
}

/** A metamodel or package: plain JSON (ADR-009). In a package, rule `enforcement` defaults to "block". */
export interface MetamodelPackage {
  name: string;
  version: string;
  prefix?: string;
  layers?: Layer[];
  valueLists?: ValueList[];
  propertyTypes?: PropertyType[];
  objectTypes: (ObjectType & { description?: string })[];
  relationshipTypes: RelationshipType[];
  relationshipRules?: (Omit<RelationshipRule, "enforcement"> & { enforcement?: RelationshipRule["enforcement"] })[];
  validationRules?: ValidationRule[];
  derivationRules?: DerivationRule[];
  exchangeMappings?: ExchangeMapping[];
  /** Reusable groups of document sections (views-and-design-artifacts.md §8.4), used by the package's templates. */
  documentPatterns?: DocumentPattern[];
  /** build (slice DOC-R2): the kinds of link an element can have (views-and-design-artifacts.md §13). */
  linkKinds?: LinkKind[];
}

/** What a link of a kind may point at: documents, other views, elements, web pages. */
export type LinkTargetKind = "document" | "diagram" | "element" | "web";

/** build (slice DOC-R2): a kind of link, e.g. *Documented in* (views-and-design-artifacts.md §13). */
export interface LinkKind {
  key: string;
  /** Read from the element: "Documented in". */
  name: string;
  /** Read from the target, under *Linked from*: "Documents"; absent = the name. */
  inverseName?: string;
  targets: LinkTargetKind[];
  /** Double-clicking a symbol of the element opens the first link of this kind (after the symbol's own child). */
  drillDown?: boolean;
}

export type ColourRuleAction =
  | { colourBy: string }
  | { gradient: { property: string; min: number; max: number; from: string; to: string } }
  | { badge: { icon: string; tooltip: string } }
  | { fade: true };

export interface GenerationRule {
  key: string;
  forEach: string;
  include: { path: string; depth?: number }[];
  layout?: "nested" | "layered" | "grid" | "radial";
  name: string;
  folder: string;
  orphans?: "archive" | "delete" | "keep";
  trigger?: "manual" | "onChange" | "nightly";
}

/** build (slice DOC-1): which elements a diagram type's diagrams may be about, and how an element links them. */
export interface DiagramSubject {
  type?: TypeKey[];
  category?: SemanticCategory[];
  /** build (slice DOC-R2): making a diagram of this type about an element adds a link of this kind to it. */
  linkKind?: string;
}

/** build (slice DOC-1b): a diagram type whose diagrams decompose their subject through a relationship type. */
export interface Decomposition {
  /** The relationship type from the subject to each part, e.g. `composedOf`. */
  relationship: TypeKey;
  /** Element types (and their subtypes) that become parts when drawn; absent = any the rules allow. */
  childTypes?: TypeKey[];
}

export interface DiagramType {
  key: TypeKey;
  name: string;
  description?: string;
  /** build (slice V-1): the view kind (02-model/views-and-design-artifacts.md §2); absent = canvas. */
  kind?: ViewKind;
  /**
   * build (slice DOC-1): what this type's diagrams are about (views-and-design-artifacts.md §12). The subject itself is
   * the diagram's `definition.subject`; a document takes the element types it accepts from `document.subject`.
   */
  subject?: DiagramSubject;
  /**
   * build (slice DOC-1b): drawing an element on a diagram of this type makes it a part of the diagram's subject
   * (views-and-design-artifacts.md §12).
   */
  decomposes?: Decomposition;
  /** build (slice DOC-2): the abstraction a relationship drawn on a diagram of this type gets (e.g. conceptual). */
  lineAbstraction?: SemanticAbstraction;
  /** build (slice V-1): a matrix type's default definition; a diagram's own definition overrides it key by key. */
  matrix?: MatrixDefinition;
  /** build (slice V-2): a document template (views-and-design-artifacts.md §7.1). */
  document?: DocumentTemplate;
  objectTypes: TypeKey[];
  relationshipTypes?: TypeKey[];
  /** build: property types diagrams of this type carry (slice A-1b). */
  properties?: PropertyKey[];
  nesting?: "nested" | "lines";
  showExistingRelationships?: boolean;
  symbols?: Record<TypeKey, Partial<SymbolStyle>>;
  /** The rendition occurrences start in, and the zoom levels below which every occurrence draws smaller. */
  renditions?: { default?: string; semanticZoom?: { below: number; rendition: string }[] };
  colourRules?: { name?: string; when: string; apply: ColourRuleAction }[];
  labels?: Record<TypeKey, string>;
  layout?: {
    algorithm?: "nested" | "layered" | "grid" | "radial" | "none";
    direction?: "down" | "right";
    spacing?: number;
  };
  legend?: { show?: boolean; position?: "topRight" | "bottomRight" | "bottomLeft" };
  inactiveObjects?: "show" | "fade" | "hide";
  generate?: GenerationRule[];
}
