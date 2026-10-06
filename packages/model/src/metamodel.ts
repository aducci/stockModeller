// Connectome — metamodel packages and diagram types, as stored in JSON.
// Shapes follow design/05-structures/metamodel.schema.json and diagram-type.schema.json.
import type {
  ObjectType,
  PropertyType,
  RelationshipRule,
  RelationshipType,
  RuleFinding,
  SymbolStyle,
  TypeKey,
  ValueList,
} from "./model";

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

export interface DiagramType {
  key: TypeKey;
  name: string;
  description?: string;
  objectTypes: TypeKey[];
  relationshipTypes?: TypeKey[];
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
