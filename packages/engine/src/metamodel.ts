// A metamodel compiled for fast lookups: resolved inheritance, rule matching and diagram types.
import type {
  DiagramType,
  MetamodelPackage,
  ObjectType,
  PropertyType,
  RelationshipRule,
  RelationshipType,
  SymbolStyle,
  TypeKey,
  ValueList,
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
}

export interface CompiledRule extends RelationshipRule {
  key: string;
}

export interface ResolvedDiagramType {
  definition: DiagramType;
  nesting: "nested" | "lines";
}

export class Metamodel {
  private readonly objectTypes = new Map<TypeKey, ResolvedObjectType>();
  private readonly relationshipTypes = new Map<TypeKey, RelationshipType>();
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

  relationshipType(key: TypeKey): RelationshipType | undefined {
    return this.relationshipTypes.get(key);
  }

  propertyType(key: string): PropertyType | undefined {
    return this.propertyTypes.get(key);
  }

  valueList(key: string): ValueList | undefined {
    return this.valueLists.get(key);
  }

  diagramType(key: TypeKey): ResolvedDiagramType | undefined {
    return this.diagramTypes.get(key);
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
  allowedRelationshipTypes(sourceType: TypeKey, targetType: TypeKey): RelationshipType[] {
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

    for (const list of pkg.valueLists ?? []) {
      if (mm.valueLists.has(list.key)) duplicate("Value list", list.key);
      mm.valueLists.set(list.key, list);
    }

    for (const pt of pkg.propertyTypes ?? []) {
      if (mm.propertyTypes.has(pt.key)) duplicate("Property type", pt.key);
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
      const properties = new Set(chain.flatMap((t) => t.properties ?? []));
      for (const p of ot.properties ?? []) {
        if (!mm.propertyTypes.has(p)) problems.push(`Object type "${ot.key}" uses unknown property type "${p}"`);
      }
      const inherited = <K extends keyof ObjectType>(field: K) => chain.find((t) => t[field] !== undefined)?.[field];
      mm.objectTypes.set(ot.key, {
        definition: ot,
        lineage,
        properties,
        uniqueName: inherited("uniqueName") ?? "none",
        keyPattern: inherited("keyPattern"),
        symbol: Object.assign({}, ...[...chain].reverse().map((t) => t.symbol ?? {})),
      });
    }

    for (const rt of pkg.relationshipTypes) {
      if (mm.relationshipTypes.has(rt.key)) duplicate("Relationship type", rt.key);
      mm.relationshipTypes.set(rt.key, rt);
      for (const p of rt.properties ?? []) {
        if (!mm.propertyTypes.has(p)) problems.push(`Relationship type "${rt.key}" uses unknown property type "${p}"`);
      }
      if (rt.singleParent && !rt.nesting)
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
      mm.diagramTypes.set(dt.key, { definition: dt, nesting: dt.nesting ?? "nested" });
    }

    if (problems.length > 0) throw new MetamodelError(problems);
    return mm;
  }
}
