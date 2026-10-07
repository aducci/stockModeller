// A metamodel compiled for fast lookups: resolved inheritance, rule matching and diagram types.
import {
  LEVEL_PROPERTY,
  corePackage,
  isRendition,
  semanticKindInfo,
  type DiagramType,
  type MetamodelPackage,
  type ObjectType,
  type PayloadUse,
  type PropertySet,
  type PropertyType,
  type RelationshipRule,
  type RelationshipType,
  type SemanticCategory,
  type SemanticKind,
  type SemanticLevel,
  type SymbolStyle,
  type TypeKey,
  type ValueList,
} from "@connectome/model";

export class MetamodelError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid metamodel:\n- ${problems.join("\n- ")}`);
    this.name = "MetamodelError";
  }
}

export interface ResolvedObjectType {
  definition: ObjectType;
  /** This type first, then its parents up to the root. */
  lineage: TypeKey[];
  /** Property types assigned to this type or inherited. */
  properties: ReadonlySet<string>;
  uniqueName: "repository" | "folder" | "none";
  keyPattern: string | undefined;
  symbol: Partial<SymbolStyle>;
  /** Semantic category and default level (design/02-model/semantics.md §4), inherited through `extends`. */
  category: SemanticCategory;
  level: SemanticLevel | undefined;
  levelFixed: boolean;
  /** Its property sets, inherited: the root's first, a subtype's set replacing one with the same key in place. */
  propertySets: PropertySet[];
}

/** A relationship type with its semantic defaults filled in (semantics.md §2.2). */
export interface ResolvedRelationshipType extends RelationshipType {
  semantic: SemanticKind;
  semanticDirection: "forward" | "reverse";
  nesting: boolean;
  singleParent: boolean;
  payload: PayloadUse;
}

export interface CompiledRule extends RelationshipRule {
  key: string;
}

export interface ResolvedDiagramType {
  definition: DiagramType;
  nesting: "nested" | "lines";
  /** Property types diagrams of this type carry. */
  properties: ReadonlySet<string>;
}

export class Metamodel {
  private readonly objectTypes = new Map<TypeKey, ResolvedObjectType>();
  private readonly relationshipTypes = new Map<TypeKey, ResolvedRelationshipType>();
  private readonly relationshipProperties = new Map<TypeKey, ReadonlySet<string>>();
  private readonly propertyTypes = new Map<string, PropertyType>();
  private readonly valueLists = new Map<string, ValueList>();
  private readonly diagramTypes = new Map<TypeKey, ResolvedDiagramType>();
  private readonly rulesByRelationshipType = new Map<TypeKey, CompiledRule[]>();

  constructor(
    readonly name: string,
    readonly version: string,
  ) {}

  objectType(key: TypeKey): ResolvedObjectType | undefined {
    return this.objectTypes.get(key);
  }

  /** Every object type, in the package's order (abstract ones included). */
  allObjectTypes(): ResolvedObjectType[] {
    return [...this.objectTypes.values()];
  }

  relationshipType(key: TypeKey): ResolvedRelationshipType | undefined {
    return this.relationshipTypes.get(key);
  }

  /** Every relationship type, in the package's order. */
  allRelationshipTypes(): ResolvedRelationshipType[] {
    return [...this.relationshipTypes.values()];
  }

  /** Property types a relationship of this type may have: its own and its kind's core properties. */
  relationshipTypeProperties(key: TypeKey): ReadonlySet<string> {
    return this.relationshipProperties.get(key) ?? new Set();
  }

  /**
   * How a relationship reads from one of its ends, in the kind's terms (semantics.md §9.1): from the source it is
   * "outgoing", from the target "incoming"; a `reverse` type swaps them.
   */
  semanticDirection(key: TypeKey, end: "source" | "target"): "outgoing" | "incoming" {
    const reverse = this.relationshipTypes.get(key)?.semanticDirection === "reverse";
    return (end === "source") !== reverse ? "outgoing" : "incoming";
  }

  /** An object's semantic level: its own `semantic.level`, or its type's default. */
  objectLevel(object: { type: TypeKey; properties: Record<string, unknown> }): SemanticLevel | undefined {
    const own = object.properties[LEVEL_PROPERTY];
    return typeof own === "string" ? (own as SemanticLevel) : this.objectTypes.get(object.type)?.level;
  }

  propertyType(key: string): PropertyType | undefined {
    return this.propertyTypes.get(key);
  }

  /** Every property type, the core package's first. */
  allPropertyTypes(): PropertyType[] {
    return [...this.propertyTypes.values()];
  }

  /** Every value list, the core package's first. */
  allValueLists(): ValueList[] {
    return [...this.valueLists.values()];
  }

  valueList(key: string): ValueList | undefined {
    return this.valueLists.get(key);
  }

  diagramType(key: TypeKey): ResolvedDiagramType | undefined {
    return this.diagramTypes.get(key);
  }

  /** Every diagram type, in the package's order (offered by "New diagram"). */
  allDiagramTypes(): ResolvedDiagramType[] {
    return [...this.diagramTypes.values()];
  }

  /** True when `type` is `ancestor` or inherits from it. `"*"` matches every type. */
  isA(type: TypeKey, ancestor: TypeKey | "*"): boolean {
    if (ancestor === "*") return true;
    return this.objectTypes.get(type)?.lineage.includes(ancestor) ?? false;
  }

  /** The relationship rules of a type that match a source and target object type (inheritance and `*` included). */
  matchingRules(relationshipType: TypeKey, sourceType: TypeKey, targetType: TypeKey): CompiledRule[] {
    return (this.rulesByRelationshipType.get(relationshipType) ?? []).filter(
      (r) => this.isA(sourceType, r.sourceType) && this.isA(targetType, r.targetType),
    );
  }

  /** Relationship types the rules allow from one object type to another (drives the connection picker). */
  allowedRelationshipTypes(sourceType: TypeKey, targetType: TypeKey): ResolvedRelationshipType[] {
    return [...this.relationshipTypes.values()].filter(
      (t) => this.matchingRules(t.key, sourceType, targetType).length > 0,
    );
  }

  /** Whether a diagram type admits objects of a type (a listed type admits its subtypes). */
  diagramAllowsObjectType(diagramType: ResolvedDiagramType, type: TypeKey): boolean {
    return diagramType.definition.objectTypes.some((allowed) => this.isA(type, allowed));
  }

  /** Whether a diagram type admits relationships of a type. No list means every type. */
  diagramAllowsRelationshipType(diagramType: ResolvedDiagramType, type: TypeKey): boolean {
    const allowed = diagramType.definition.relationshipTypes;
    return !allowed || allowed.includes(type);
  }

  /** Compiles a package and diagram types, checking every reference. Throws MetamodelError listing all problems. */
  static compile(pkg: MetamodelPackage, diagramTypes: DiagramType[] = []): Metamodel {
    const mm = new Metamodel(pkg.name, pkg.version);
    const problems: string[] = [];
    const duplicate = (kind: string, key: string) => problems.push(`${kind} "${key}" is defined twice`);

    // The core package comes first and its keys are reserved (semantics.md §4.3).
    for (const list of corePackage.valueLists ?? []) mm.valueLists.set(list.key, list);
    for (const pt of corePackage.propertyTypes ?? []) mm.propertyTypes.set(pt.key, pt);
    const reserved = (kind: string, key: string) =>
      problems.push(`${kind} "${key}" is reserved by the core package and cannot be redefined`);

    for (const list of pkg.valueLists ?? []) {
      if (corePackage.valueLists?.some((l) => l.key === list.key)) reserved("Value list", list.key);
      else if (mm.valueLists.has(list.key)) duplicate("Value list", list.key);
      mm.valueLists.set(list.key, list);
    }

    for (const pt of pkg.propertyTypes ?? []) {
      if (corePackage.propertyTypes?.some((p) => p.key === pt.key)) reserved("Property type", pt.key);
      else if (mm.propertyTypes.has(pt.key)) duplicate("Property type", pt.key);
      mm.propertyTypes.set(pt.key, pt);
      if ((pt.dataType === "list" || pt.dataType === "multiList") && !pt.valueList) {
        problems.push(`Property type "${pt.key}" is a ${pt.dataType} but names no value list`);
      }
      if (pt.valueList && !mm.valueLists.has(pt.valueList)) {
        problems.push(`Property type "${pt.key}" uses unknown value list "${pt.valueList}"`);
      }
      if (pt.dataType === "calculated" && !pt.formula) problems.push(`Calculated property "${pt.key}" has no formula`);
    }

    const definitions = new Map<TypeKey, ObjectType>();
    for (const ot of pkg.objectTypes) {
      if (definitions.has(ot.key)) duplicate("Object type", ot.key);
      definitions.set(ot.key, ot);
    }

    for (const ot of pkg.objectTypes) {
      const lineage: TypeKey[] = [];
      let current: ObjectType | undefined = ot;
      while (current) {
        if (lineage.includes(current.key)) {
          problems.push(`Object type "${ot.key}" inherits from itself (${[...lineage, current.key].join(" → ")})`);
          break;
        }
        lineage.push(current.key);
        if (!current.extends) break;
        const parent = definitions.get(current.extends);
        if (!parent) problems.push(`Object type "${current.key}" extends unknown type "${current.extends}"`);
        current = parent;
      }
      const chain = lineage.map((k) => definitions.get(k)!).filter(Boolean);
      const properties = new Set([...chain.flatMap((t) => t.properties ?? []), LEVEL_PROPERTY]);
      for (const p of ot.properties ?? []) {
        if (!mm.propertyTypes.has(p)) problems.push(`Object type "${ot.key}" uses unknown property type "${p}"`);
      }
      const inherited = <K extends keyof ObjectType>(field: K) => chain.find((t) => t[field] !== undefined)?.[field];
      const propertySets = new Map<string, PropertySet>();
      for (const t of [...chain].reverse()) for (const set of t.propertySets ?? []) propertySets.set(set.key, set);
      for (const set of ot.propertySets ?? []) {
        if ((ot.propertySets ?? []).filter((x) => x.key === set.key).length > 1)
          problems.push(`Object type "${ot.key}" defines property set "${set.key}" twice`);
        for (const p of set.properties)
          if (!properties.has(p))
            problems.push(`Property set "${set.key}" of "${ot.key}" lists "${p}", which the type does not have`);
      }
      mm.objectTypes.set(ot.key, {
        definition: ot,
        lineage,
        properties,
        uniqueName: inherited("uniqueName") ?? "none",
        keyPattern: inherited("keyPattern"),
        symbol: Object.assign({}, ...[...chain].reverse().map((t) => t.symbol ?? {})),
        category: inherited("category") ?? "other",
        level: inherited("level"),
        levelFixed: inherited("levelFixed") ?? false,
        propertySets: [...propertySets.values()],
      });
      if (inherited("levelFixed") && !inherited("level"))
        problems.push(`Object type "${ot.key}" fixes its level but names none`);
    }

    for (const rt of pkg.relationshipTypes) {
      if (mm.relationshipTypes.has(rt.key)) duplicate("Relationship type", rt.key);
      const semantic = rt.semantic ?? "association";
      const kind = semanticKindInfo(semantic);
      // Containment is the repository's structure: always nesting, always one parent (semantics.md §3).
      const containment = semantic === "containment";
      if (containment && (rt.nesting === false || rt.singleParent === false))
        problems.push(`Relationship type "${rt.key}" is a containment, which always nests with a single parent`);
      // Types without a kind keep the nesting they had before kinds existed.
      if (rt.cascadeDelete && semantic !== "composition")
        problems.push(`Relationship type "${rt.key}" cascades deletes but is not a composition`);
      if (rt.nesting && rt.semantic !== undefined && !kind.nestable)
        problems.push(`Relationship type "${rt.key}" is a ${semantic}, which cannot be shown by nesting`);
      mm.relationshipTypes.set(rt.key, {
        ...rt,
        semantic,
        semanticDirection: rt.semanticDirection ?? "forward",
        nesting: containment || (rt.nesting ?? false),
        singleParent: containment || (rt.singleParent ?? false),
        payload: rt.payload ?? (semantic === "flow" || semantic === "trigger" ? "optional" : "none"),
      });
      mm.relationshipProperties.set(rt.key, new Set([...(rt.properties ?? []), ...kind.properties]));
      for (const p of rt.properties ?? []) {
        if (!mm.propertyTypes.has(p)) problems.push(`Relationship type "${rt.key}" uses unknown property type "${p}"`);
      }
      if (rt.singleParent && !rt.nesting && !containment)
        problems.push(`Relationship type "${rt.key}" is singleParent but not nesting`);
    }

    const typeRef = (ref: string, where: string) => {
      if (ref !== "*" && !mm.objectTypes.has(ref)) problems.push(`${where} uses unknown object type "${ref}"`);
    };

    for (const rule of pkg.relationshipRules ?? []) {
      const key = `${rule.relationshipType}:${rule.sourceType}->${rule.targetType}`;
      if (!mm.relationshipTypes.has(rule.relationshipType)) {
        problems.push(`Rule ${key} uses unknown relationship type "${rule.relationshipType}"`);
      }
      typeRef(rule.sourceType, `Rule ${key}`);
      typeRef(rule.targetType, `Rule ${key}`);
      const list = mm.rulesByRelationshipType.get(rule.relationshipType) ?? [];
      list.push({ ...rule, enforcement: rule.enforcement ?? "block", key });
      mm.rulesByRelationshipType.set(rule.relationshipType, list);
    }

    for (const dt of diagramTypes) {
      if (mm.diagramTypes.has(dt.key)) duplicate("Diagram type", dt.key);
      for (const t of dt.objectTypes) typeRef(t, `Diagram type "${dt.key}"`);
      for (const t of dt.relationshipTypes ?? []) {
        if (!mm.relationshipTypes.has(t))
          problems.push(`Diagram type "${dt.key}" uses unknown relationship type "${t}"`);
      }
      for (const r of [dt.renditions?.default, ...(dt.renditions?.semanticZoom ?? []).map((z) => z.rendition)]) {
        if (r !== undefined && !isRendition(r)) problems.push(`Diagram type "${dt.key}" uses unknown rendition "${r}"`);
      }
      for (const p of dt.properties ?? []) {
        if (!mm.propertyTypes.has(p)) problems.push(`Diagram type "${dt.key}" uses unknown property type "${p}"`);
      }
      mm.diagramTypes.set(dt.key, {
        definition: dt,
        nesting: dt.nesting ?? "nested",
        properties: new Set(dt.properties ?? []),
      });
    }

    if (problems.length > 0) throw new MetamodelError(problems);
    return mm;
  }
}
