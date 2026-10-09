// A metamodel compiled for fast lookups: resolved inheritance, rule matching and diagram types.
import {
  COMPONENT_KEYS,
  LAYOUT_KEY,
  ABSTRACTION_PROPERTY,
  REGION_COMPONENT_KEYS,
  SEMANTIC_KINDS,
  SUBJECT_KEY,
  corePackage,
  isRegion,
  isRendition,
  resolveTemplate,
  semanticKindInfo,
  type DiagramType,
  type ResolvedSection,
  type ResolvedTemplate,
  type SectionDefinition,
  type MetamodelPackage,
  type ObjectType,
  type PayloadUse,
  type PropertySet,
  type PropertyType,
  type RelationshipRule,
  type RelationshipType,
  type SemanticCategory,
  type SemanticKind,
  type SemanticAbstraction,
  type SymbolStyle,
  type TypeKey,
  type ValueList,
  validateSection,
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
  /** Name uniqueness (design/02-model/duplicates-and-identity.md §4), each field inherited through `extends`. */
  uniqueName: "repository" | "folder" | "container" | "none";
  uniqueAcross: "type" | "family";
  uniquePerAbstraction: boolean;
  onClash: "block" | "warn";
  keyPattern: string | undefined;
  symbol: Partial<SymbolStyle>;
  /** Semantic category and default abstraction (design/02-model/semantics.md §4), inherited through `extends`. */
  category: SemanticCategory;
  abstraction: SemanticAbstraction | undefined;
  abstractionFixed: boolean;
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
  distinct: "pair" | "pairAndPayload" | "none";
}

export interface CompiledRule extends RelationshipRule {
  key: string;
}

export interface ResolvedDiagramType {
  definition: DiagramType;
  nesting: "nested" | "lines";
  /** Property types diagrams of this type carry. */
  properties: ReadonlySet<string>;
  /** A document type's template with its base and patterns resolved (views-and-design-artifacts.md §8.4). */
  template?: ResolvedTemplate;
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

  /** An object's abstraction: its own `semantic.abstraction`, or its type's default. */
  objectAbstraction(object: { type: TypeKey; properties: Record<string, unknown> }): SemanticAbstraction | undefined {
    const own = object.properties[ABSTRACTION_PROPERTY];
    return typeof own === "string" ? (own as SemanticAbstraction) : this.objectTypes.get(object.type)?.abstraction;
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
      const properties = new Set([...chain.flatMap((t) => t.properties ?? []), ABSTRACTION_PROPERTY]);
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
        uniqueAcross: inherited("uniqueAcross") ?? "type",
        uniquePerAbstraction: inherited("uniquePerAbstraction") ?? true,
        onClash: inherited("onClash") ?? "block",
        keyPattern: inherited("keyPattern"),
        symbol: Object.assign({}, ...[...chain].reverse().map((t) => t.symbol ?? {})),
        category: inherited("category") ?? "other",
        abstraction: inherited("abstraction"),
        abstractionFixed: inherited("abstractionFixed") ?? false,
        propertySets: [...propertySets.values()],
      });
      if (inherited("abstractionFixed") && !inherited("abstraction"))
        problems.push(`Object type "${ot.key}" fixes its abstraction but names none`);
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
        // Flows, triggers and interactions differ by what they carry; other kinds say nothing new the second time.
        distinct:
          rt.distinct ??
          (semantic === "flow" || semantic === "trigger" || semantic === "interaction" ? "pairAndPayload" : "pair"),
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
      if (dt.matrix) {
        const where = `Diagram type "${dt.key}"`;
        const scopes = [dt.matrix.rows, dt.matrix.columns];
        for (const scope of scopes) {
          for (const t of scope.from.type ?? []) typeRef(t, where);
          for (const step of scope.steps ?? []) for (const t of step.to?.type ?? []) typeRef(t, where);
        }
        const relTypes = [
          ...(dt.matrix.relationships.types ?? []),
          ...(dt.matrix.create ? [dt.matrix.create] : []),
          ...scopes.flatMap((s) => (s.steps ?? []).flatMap((st) => st.type ?? [])),
        ];
        for (const t of relTypes) {
          if (!mm.relationshipTypes.has(t)) problems.push(`${where} uses unknown relationship type "${t}"`);
        }
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
    // Document templates last: their linked diagrams may name any diagram type, and they may extend each other.
    const patternKeys = new Set<string>();
    for (const p of pkg.documentPatterns ?? []) {
      if (patternKeys.has(p.key)) duplicate("Document pattern", p.key);
      patternKeys.add(p.key);
    }
    const templateOf = (key: TypeKey) => diagramTypes.find((d) => d.key === key)?.document;
    for (const dt of diagramTypes) {
      if (!dt.document) continue;
      const template = resolveTemplate(dt.key, templateOf, pkg.documentPatterns ?? [], problems);
      checkDocument(mm, dt.key, template, typeRef, problems);
      mm.diagramTypes.get(dt.key)!.template = template;
    }

    if (problems.length > 0) throw new MetamodelError(problems);
    return mm;
  }
}

/** A resolved document template (views-and-design-artifacts.md §7.1, §8.4 "Validation"): everything it names must exist. */
function checkDocument(
  mm: Metamodel,
  key: TypeKey,
  template: ResolvedTemplate,
  typeRef: (t: TypeKey, where: string) => void,
  problems: string[],
): void {
  const where = `Document template "${key}"`;
  for (const t of template.subject.type ?? []) typeRef(t, where);
  const keys = new Set<string>();
  const sections = template.entries.filter((e): e is ResolvedSection => !isRegion(e));
  for (const entry of template.entries) {
    const entryKey = isRegion(entry) ? entry.region : entry.key;
    if (entryKey === SUBJECT_KEY || entryKey === LAYOUT_KEY)
      problems.push(`${where}, section "${entryKey}": "${entryKey}" is reserved for the document's own state`);
    if (keys.has(entryKey))
      problems.push(`${where} has two sections "${entryKey}" (a pattern used twice needs a prefix)`);
    keys.add(entryKey);
    if (isRegion(entry)) {
      for (const c of entry.palette)
        if (!REGION_COMPONENT_KEYS.includes(c))
          problems.push(`${where}, region "${entry.region}" offers "${c}", which authors cannot add`);
      continue;
    }
    problems.push(...checkSection(mm, entry, sections, `${where}, section "${entry.key}"`));
  }
}

/**
 * One section of a document, against the metamodel and its sibling sections: a template's, or one an author added in
 * a region. `inRow` is true for a repeater's children, which see the row.
 */
export function checkSection(
  mm: Metamodel,
  section: SectionDefinition,
  siblings: readonly SectionDefinition[],
  at: string,
  inRow = false,
): string[] {
  const problems: string[] = [];
  if (!COMPONENT_KEYS.includes(section.component)) return [`${at} uses unknown component "${section.component}"`];
  const schema = validateSection(section);
  if (!schema.ok) return [`${at} is not a valid section: ${schema.errors.slice(0, 3).join("; ")}`];
  const kinds = (list: readonly string[] | undefined) => {
    for (const k of list ?? [])
      if (!SEMANTIC_KINDS.some((x) => x.kind === k)) problems.push(`${at} uses unknown kind "${k}"`);
  };
  const relTypes = (list: readonly string[] | undefined) => {
    for (const t of list ?? [])
      if (!mm.relationshipType(t)) problems.push(`${at} uses unknown relationship type "${t}"`);
  };
  const ofKind = (typeKey: TypeKey, kind: string, what: string) => {
    const dt = mm.diagramType(typeKey);
    if (!dt) problems.push(`${at} ${what} unknown diagram type "${typeKey}"`);
    else if ((dt.definition.kind ?? "canvas") !== kind)
      problems.push(`${at} ${what} "${typeKey}", which is not a ${kind === "canvas" ? "canvas" : `${kind} type`}`);
  };
  if (inRow && !["heading", "prose", "facts", "sequenceLink"].includes(section.component))
    problems.push(`${at}: a repeater shows headings, prose, facts and sequences, not "${section.component}"`);
  if (!inRow && section.component === "sequenceLink") problems.push(`${at}: a sequence link belongs in a repeater`);
  if (section.component === "facts") {
    if (!inRow && section.config.of !== undefined) problems.push(`${at}: only a repeater's facts are of a row`);
    for (const p of section.config.properties)
      if (!mm.propertyType(p)) problems.push(`${at} uses unknown property "${p}"`);
  }
  if (section.component === "diagramLink") ofKind(section.config.diagramType, "canvas", "links");
  if (section.component === "sequenceLink") ofKind(section.config.diagramType, "sequence", "opens");
  if (section.component === "relationTable") {
    const c = section.config;
    relTypes(c.source.relationships.types);
    kinds(c.source.relationships.kinds);
    relTypes(c.add?.types);
    kinds(c.add?.kinds);
    if (c.perRow) ofKind(c.perRow.sequence, "sequence", "has rows open");
    if (c.source.section !== undefined) {
      const linked = siblings.find((x) => x.key === c.source.section);
      if (linked?.component !== "diagramLink")
        problems.push(`${at} reads section "${c.source.section}", which is not a linked diagram`);
    }
    const columnKeys = new Set<string>();
    for (const col of c.columns) {
      const props = typeof col === "string" ? (col === "direction" || col === "payload" ? [] : [col]) : col.properties;
      for (const p of props) if (!mm.propertyType(p)) problems.push(`${at} uses unknown property "${p}"`);
      columnKeys.add(typeof col === "string" ? col : col.key);
    }
    for (const r of c.required ?? [])
      if (!columnKeys.has(r)) problems.push(`${at} requires "${r}", which is not one of its columns`);
  }
  if (section.component === "repeater") {
    const source = siblings.find((x) => x.key === section.config.source.section);
    if (source?.component !== "relationTable")
      problems.push(`${at} repeats section "${section.config.source.section}", which is not a relation table`);
    const childKeys = new Set<string>();
    for (const child of section.config.sections) {
      if (childKeys.has(child.key)) problems.push(`${at} has two sections "${child.key}"`);
      childKeys.add(child.key);
      problems.push(...checkSection(mm, child, section.config.sections, `${at}, section "${child.key}"`, true));
    }
  }
  return problems;
}
