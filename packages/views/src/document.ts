// Design artifacts (views-and-design-artifacts.md §7–§8): a document about one subject, built from a template's
// sections. Each component projects its section from the model rows; the findings make the completeness. What an
// author changed within a section's lock (§8.2) and the sections added in regions are in `definition.layout`.
import {
  LAYOUT_KEY,
  SUBJECT_KEY,
  isRegion,
  sectionMay,
  type ComponentKey,
  type DiagramType,
  type DocumentLayout,
  type Id,
  type PropertyKey,
  type PropertyValue,
  type ProseInline,
  type ProseState,
  type RegionDefinition,
  type RegisterConfig,
  type RelationTableConfig,
  type RepeaterState,
  type ResolvedSection,
  type ResolvedTemplate,
  type SectionDefinition,
  type SectionLayout,
  type TypeKey,
} from "@connectome/model";
import {
  checkSection,
  type DiagramRow,
  type Metamodel,
  type ModelState,
  type ObjectRow,
  type RelationshipRow,
} from "@connectome/engine";
import { subFlows, type ImpliedFlow } from "@connectome/semantics";
import { matchesFilter, matchesRelationship } from "./scope";
import type { CellOption } from "./matrix";

type Section<C extends ComponentKey> = Extract<ResolvedSection, { component: C }>;

interface Context {
  state: ModelState;
  metamodel: Metamodel;
  definition: Record<string, unknown>;
  subject: ObjectRow | undefined;
  /** The document's top-level sections, the template's and those added in regions. */
  sections: readonly ResolvedSection[];
  /** Projected tables, for the repeaters that read them. */
  tables: Map<string, RelationTableModel>;
  /** What the other sections mention and show, for the registers (projected last). */
  scope?: DocumentScope;
}

/** Where one section instance is: its state, its layout, and inside a repeater the row it is about. */
interface Scope {
  state: unknown;
  layout: SectionLayout;
  row?: { relationship: RelationshipRow; counterpart: ObjectRow | undefined; sequence?: DiagramRow | null };
}

export interface HeadingModel {
  component: "heading";
}
export interface ProseModel {
  component: "prose";
  prose: ProseState;
  empty: boolean;
}
export interface FactModel {
  key: PropertyKey;
  value: PropertyValue | undefined;
}
export interface FactsModel {
  component: "facts";
  /** What the facts are of: the subject, or inside a repeater the row's counterpart or relationship. */
  target: { kind: "object"; row: ObjectRow } | { kind: "relationship"; row: RelationshipRow } | undefined;
  /** The properties the template and the author list, in order; ones the target's type lacks are left out. */
  facts: FactModel[];
  /** The target's other properties, when the author may add them. */
  addable: PropertyKey[];
}
export interface DiagramLinkModel {
  component: "diagramLink";
  diagramType: string;
  /** The linked diagram, when it exists. */
  diagram: DiagramRow | undefined;
  /** A diagram was linked and has been deleted since. */
  deleted: boolean;
}
export interface SequenceLinkModel {
  component: "sequenceLink";
  diagramType: string;
  /** The row's interaction; null when the row is not an interaction (only interactions have messages). */
  interaction: RelationshipRow | null;
  diagram: DiagramRow | undefined;
  deleted: boolean;
}
export interface TableCell {
  /** The property the cell edits, or "direction" / "payload". */
  field: string;
  value: PropertyValue | undefined;
  /** False when the row's relationship type has no such property (a flow has no interaction pattern). */
  applicable: boolean;
}
export interface TableRow {
  relationship: RelationshipRow;
  /** The end that is not the subject; the target when the subject is neither end. */
  counterpart: ObjectRow | undefined;
  /** From the subject: "out" when the subject is the source, "in" when the target, null when neither. */
  direction: "out" | "in" | null;
  cells: Record<string, TableCell>;
  /** Labels of the required columns this row has not filled. */
  toDescribe: string[];
  /**
   * With a template's `perRow` sequence: the row's sequence diagram once created, `undefined` before, and `null` when
   * the row is not an interaction (only interactions have messages).
   */
  sequence: DiagramRow | undefined | null;
  /** With the config's `expand` (slice DOC-2): the elements the row's connection stands for, listed then implied. */
  flows?: FlowRow[];
  /** With `expand`: the more concrete flows and interactions the connection implies. */
  implied?: ImpliedFlow[];
}
export interface FlowRow {
  object: ObjectRow;
  /** False when the connection lists it; true when an implied relationship brings it. */
  implied: boolean;
  /** The implied relationship that references it. */
  through?: RelationshipRow;
  /** With `expand.sequence`: the sequence about the element once made, `undefined` before, `null` without one. */
  sequence: DiagramRow | undefined | null;
}
export interface TableColumnModel {
  key: string;
  label: string;
  properties: PropertyKey[];
  /** Added by the author (a property column); they may remove it. */
  added?: boolean;
}
export interface RelationTableModel {
  component: "relationTable";
  config: RelationTableConfig;
  columns: TableColumnModel[];
  rows: TableRow[];
  /** The linked diagram rows come from, when the source is a diagramLink section. */
  linked: { section: string; title: string; diagram: DiagramRow | undefined } | undefined;
  /** The subject's relationships of the source's kinds that are not on the linked diagram, and not ignored. */
  missing: RelationshipRow[];
  /** Optional template columns the author hid, and properties of the rows they may add as columns. */
  hiddenColumns: TableColumnModel[];
  addableColumns: PropertyKey[];
}
export interface RepeaterRowModel {
  relationship: RelationshipRow;
  counterpart: ObjectRow | undefined;
  direction: "out" | "in" | null;
  sections: SectionModel[];
}
export interface RepeaterModel {
  component: "repeater";
  source: string;
  rows: RepeaterRowModel[];
}

export interface RegisterRow {
  object: ObjectRow;
  /** Why it is listed: "mentioned", then "about <element>" for each element it concerns in the document. */
  reasons: string[];
  cells: Record<string, TableCell>;
  /** Labels of the columns a check asks this row to fill. */
  toFill: string[];
}
export interface RegisterGroup {
  /** The rows' type when grouped by type. */
  type: TypeKey | null;
  name: string;
  rows: RegisterRow[];
}
export interface RegisterModel {
  component: "register";
  config: RegisterConfig;
  columns: TableColumnModel[];
  groups: RegisterGroup[];
  count: number;
}

/** What the author may change in a section (§8.2), given its lock and `allow`. */
export interface SectionFreedoms {
  hide: boolean;
  rename: boolean;
  addProperties: boolean;
  columns: boolean;
}

export type SectionModel = {
  definition: ResolvedSection;
  /** The title shown: the template's, or the author's in a free section. */
  title: string;
  /** Where the section's state is in the document's definition: its key, then inside a repeater the row's. */
  path: string[];
  findings: string[];
  /** Hidden by the author: not shown and not counted. */
  hidden: boolean;
  may: SectionFreedoms;
  /** The region the author added it in. */
  region?: string;
} & (
  | HeadingModel
  | ProseModel
  | FactsModel
  | DiagramLinkModel
  | RelationTableModel
  | RepeaterModel
  | SequenceLinkModel
  | RegisterModel
);

type Projection = SectionModel extends infer M
  ? M extends unknown
    ? Omit<M, "definition" | "title" | "path" | "hidden" | "may" | "region">
    : never
  : never;

/** A component (§8.1): its name for the palette, and a pure projection of one section with its findings. */
export interface Component<C extends ComponentKey = ComponentKey> {
  key: C;
  name: string;
  description: string;
  /** Whether the section counts towards completeness. */
  counts: boolean;
  project(ctx: Context, section: Section<C>, scope: Scope, title: string): Projection;
}

const isEmpty = (value: unknown) =>
  value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);

const proseOf = (value: unknown): ProseState =>
  value && typeof value === "object" && Array.isArray((value as ProseState).paragraphs)
    ? (value as ProseState)
    : { paragraphs: [] };

const diagramIdOf = (state: unknown): Id | undefined => {
  const id = (state as { diagramId?: unknown } | undefined)?.diagramId;
  return typeof id === "string" ? id : undefined;
};

const linkedDiagramId = (definition: Record<string, unknown>, key: string): Id | undefined =>
  diagramIdOf(definition[key]);

export const COMPONENTS: { [C in ComponentKey]: Component<C> } = {
  heading: {
    key: "heading",
    name: "Heading",
    description: "A title that structures the document.",
    counts: false,
    project: () => ({ component: "heading", findings: [] }),
  },
  prose: {
    key: "prose",
    name: "Prose",
    description: "Text with @ mentions of the model's elements.",
    counts: true,
    project: (_ctx, section, scope, title) => {
      const prose = proseOf(scope.state);
      const empty = !prose.paragraphs.some((p) => p.some((x) => typeof x !== "string" || x.trim() !== ""));
      return { component: "prose", prose, empty, findings: empty && section.required ? [`${title} is empty`] : [] };
    },
  },
  facts: {
    key: "facts",
    name: "Key facts",
    description: "Chosen properties of the subject, edited in place.",
    counts: true,
    project: (ctx, section, scope, title) => projectFacts(ctx, section, scope, title),
  },
  diagramLink: {
    key: "diagramLink",
    name: "Linked diagram",
    description: "A diagram the author draws, shown as a live preview.",
    counts: true,
    project: (ctx, section, scope, title) => {
      const id = diagramIdOf(scope.state);
      const diagram = id ? ctx.state.diagrams.get(id) : undefined;
      const deleted = id !== undefined && !diagram;
      const findings = deleted
        ? [`${title}: the linked diagram was deleted`]
        : !diagram && section.required
          ? [`${title}: no diagram yet`]
          : [];
      return { component: "diagramLink", diagramType: section.config.diagramType, diagram, deleted, findings };
    },
  },
  relationTable: {
    key: "relationTable",
    name: "Relation table",
    description: "One row per relationship, from a linked diagram's connectors or the subject's own.",
    counts: true,
    project: (ctx, section, scope, title) => projectTable(ctx, section, scope, title),
  },
  repeater: {
    key: "repeater",
    name: "Repeater",
    description: "For each row of a table, a block of sections about that row.",
    counts: true,
    project: (ctx, section, scope, title) => projectRepeater(ctx, section, scope, title),
  },
  register: {
    key: "register",
    name: "Register",
    description:
      "Elements of chosen types (RAID items, decisions) that the document mentions or that concern what it shows.",
    counts: true,
    project: (ctx, section, _scope, title) => projectRegister(ctx, section, title),
  },
  sequenceLink: {
    key: "sequenceLink",
    name: "Sequence",
    description: "The row's interaction as a sequence diagram, created on demand.",
    counts: false,
    project: (ctx, section, scope) => {
      const rel = scope.row?.relationship;
      const interaction = rel && ctx.metamodel.relationshipType(rel.type)?.semantic === "interaction" ? rel : null;
      // A table with its own per-row sequence shares it, so a row never gets two.
      const id = diagramIdOf(scope.state) ?? (scope.row?.sequence ? scope.row.sequence.id : undefined);
      const diagram = id ? ctx.state.diagrams.get(id) : undefined;
      return {
        component: "sequenceLink",
        diagramType: section.config.diagramType,
        interaction,
        diagram,
        deleted: id !== undefined && !diagram,
        findings: [],
      };
    },
  },
};

function projectFacts(ctx: Context, section: Section<"facts">, scope: Scope, title: string): Projection {
  const { metamodel } = ctx;
  let target: FactsModel["target"];
  let own: ReadonlySet<string> | undefined;
  let values: Record<string, PropertyValue> = {};
  if (scope.row && section.config.of === "relationship") {
    target = { kind: "relationship", row: scope.row.relationship };
    own = metamodel.relationshipTypeProperties(scope.row.relationship.type);
    values = scope.row.relationship.properties;
  } else {
    const object = scope.row ? scope.row.counterpart : ctx.subject;
    if (object) {
      target = { kind: "object", row: object };
      own = metamodel.objectType(object.type)?.properties;
      values = object.properties;
    }
  }
  const may = sectionMay(section, "addProperties");
  const listed = [...new Set([...section.config.properties, ...(may ? (scope.layout.properties ?? []) : [])])];
  const facts = listed.filter((key) => own?.has(key)).map((key) => ({ key, value: values[key] }));
  const shown = new Set(listed);
  const addable = may && own ? [...own].filter((k) => !shown.has(k) && metamodel.propertyType(k)) : [];
  const unset = facts.filter((f) => isEmpty(f.value));
  const name = (key: string) => metamodel.propertyType(key)?.name ?? key;
  return {
    component: "facts",
    target,
    facts,
    addable,
    findings: section.required ? unset.map((f) => `${title}: ${name(f.key)} is not set`) : [],
  };
}

function columnsOf(metamodel: Metamodel, config: RelationTableConfig): TableColumnModel[] {
  return config.columns.map((c) => {
    if (typeof c !== "string") return c;
    if (c === "direction") return { key: c, label: "Direction", properties: [] };
    if (c === "payload") return { key: c, label: "Carries", properties: [] };
    return { key: c, label: metamodel.propertyType(c)?.name ?? c, properties: [c] };
  });
}

function projectTable(ctx: Context, section: Section<"relationTable">, scope: Scope, title: string): Projection {
  const { state, metamodel, subject } = ctx;
  const config = section.config;
  const filter = { type: config.source.relationships.types, kind: config.source.relationships.kinds };
  const required = new Set(config.required ?? []);
  const mayColumns = sectionMay(section, "columns");
  const hidden = new Set(mayColumns ? (scope.layout.hiddenColumns ?? []) : []);
  const all = columnsOf(metamodel, config);
  const shownKeys = new Set(all.map((c) => c.key));
  const added = (mayColumns ? (scope.layout.columns ?? []) : [])
    .filter((p) => metamodel.propertyType(p) && !shownKeys.has(p))
    .map((p) => ({ key: p, label: metamodel.propertyType(p)!.name, properties: [p], added: true }));
  const columns = [...all.filter((c) => required.has(c.key) || !hidden.has(c.key)), ...added];
  const hiddenColumns = all.filter((c) => !required.has(c.key) && hidden.has(c.key));
  const linkedSection = config.source.section ? ctx.sections.find((s) => s.key === config.source.section) : undefined;
  let relationships: RelationshipRow[] = [];
  let linked: RelationTableModel["linked"];
  if (linkedSection) {
    const id = linkedDiagramId(ctx.definition, linkedSection.key);
    const diagram = id ? state.diagrams.get(id) : undefined;
    linked = { section: linkedSection.key, title: linkedSection.title, diagram };
    if (diagram) {
      const ids = new Set(state.relationshipOccurrences.find("byDiagram", diagram.id).map((o) => o.relationshipId));
      relationships = [...ids].flatMap((rid) => state.relationships.get(rid) ?? []);
    }
  } else if (subject) {
    relationships = subjectRelationships(state, subject.id);
  }
  relationships = relationships.filter((r) => matchesRelationship(metamodel, r, filter));

  const own = (scope.state ?? {}) as { sequences?: Record<Id, Id>; ignored?: Id[] };
  const sequences = own.sequences ?? {};
  // A flow's sequence is a sequence diagram about it (DOC-1 subjects), not kept in the section's state.
  const expand = config.expand;
  const sequenceAbout = new Map<Id, DiagramRow>();
  if (expand?.sequence)
    for (const d of state.diagrams.live()) {
      const about = d.definition?.[SUBJECT_KEY];
      if (d.diagramType === expand.sequence && typeof about === "string" && !sequenceAbout.has(about))
        sequenceAbout.set(about, d);
    }
  const expandLabel = expand ? (metamodel.propertyType(expand.property)?.name ?? expand.property) : "";
  const rows: TableRow[] = relationships.map((relationship) => {
    const direction =
      subject?.id === relationship.sourceId ? "out" : subject?.id === relationship.targetId ? "in" : null;
    const counterpart = state.objects.get(direction === "in" ? relationship.sourceId : relationship.targetId);
    const props = metamodel.relationshipTypeProperties(relationship.type);
    const cells: Record<string, TableCell> = {};
    for (const column of columns) {
      if (column.key === "direction")
        cells[column.key] = { field: "direction", value: direction ?? undefined, applicable: true };
      else if (column.key === "payload")
        cells[column.key] = {
          field: "payload",
          value: relationship.payload,
          applicable: metamodel.relationshipType(relationship.type)?.payload !== "none",
        };
      else {
        const property = column.properties.find((p) => props.has(p));
        cells[column.key] = property
          ? { field: property, value: relationship.properties[property], applicable: true }
          : { field: column.properties[0] ?? column.key, value: undefined, applicable: false };
      }
    }
    const toDescribe = columns
      .filter((c) => required.has(c.key) && cells[c.key]!.applicable && isEmpty(cells[c.key]!.value))
      .map((c) => c.label);
    const interaction = metamodel.relationshipType(relationship.type)?.semantic === "interaction";
    const sequenceId = sequences[relationship.id];
    const sequence = !config.perRow || !interaction ? null : sequenceId ? state.diagrams.get(sequenceId) : undefined;
    if (!expand) return { relationship, counterpart, direction, cells, toDescribe, sequence };
    const sub = subFlows(state, metamodel, relationship.id, { property: expand.property, exclude: expand.exclude });
    const flowSequence = (o: ObjectRow) => (expand.sequence ? sequenceAbout.get(o.id) : null);
    const flows: FlowRow[] = [
      ...sub.explicit.map((object) => ({ object, implied: false, sequence: flowSequence(object) })),
      ...sub.impliedElements.map(({ object, through }) => ({
        object,
        implied: true,
        through,
        sequence: flowSequence(object),
      })),
    ];
    if (expand.required && flows.length === 0 && sub.implied.length === 0) toDescribe.push(expandLabel);
    return { relationship, counterpart, direction, cells, toDescribe, sequence, flows, implied: sub.implied };
  });
  rows.sort(
    (a, b) =>
      (a.counterpart?.name ?? "").localeCompare(b.counterpart?.name ?? "") ||
      a.relationship.id.localeCompare(b.relationship.id),
  );
  const shownNow = new Set(columns.flatMap((c) => c.properties));
  const addableColumns = mayColumns
    ? [...new Set(rows.flatMap((r) => [...metamodel.relationshipTypeProperties(r.relationship.type)]))]
        .filter((p) => !shownNow.has(p) && metamodel.propertyType(p))
        .sort()
    : [];

  let missing: RelationshipRow[] = [];
  if (config.missing && linkedSection && subject) {
    // What a drawn connection implies is shown under its row, so it is not missing (DOC-2).
    const shown = new Set([
      ...relationships.map((r) => r.id),
      ...rows.flatMap((r) => (r.implied ?? []).map((i) => i.relationship.id)),
    ]);
    const ignored = new Set(own.ignored ?? []);
    missing = subjectRelationships(state, subject.id).filter(
      (r) => matchesRelationship(metamodel, r, filter) && !shown.has(r.id) && !ignored.has(r.id),
    );
  }

  const findings: string[] = [];
  const name = (o: ObjectRow | undefined) => o?.name ?? "(deleted)";
  for (const row of rows)
    if (row.toDescribe.length > 0)
      findings.push(`${title}: ${name(row.counterpart)} has no ${row.toDescribe.join(" or ").toLowerCase()}`);
  if (section.required && rows.length === 0) findings.push(`${title}: none yet`);
  if (missing.length > 0)
    findings.push(
      `${title}: ${missing.length === 1 ? "1 relationship is" : `${missing.length} relationships are`} not on the ${linked?.title.toLowerCase() ?? "diagram"}`,
    );
  return {
    component: "relationTable",
    config,
    columns,
    rows,
    linked,
    missing,
    hiddenColumns,
    addableColumns,
    findings,
  };
}

function projectRepeater(ctx: Context, section: Section<"repeater">, scope: Scope, title: string): Projection {
  const table = ctx.tables.get(section.config.source.section);
  const state = (scope.state ?? {}) as RepeaterState;
  const rows: RepeaterRowModel[] = (table?.rows ?? []).map((row) => {
    const rowState = state.rows?.[row.relationship.id] ?? {};
    const sections = section.config.sections.map((child) =>
      projectSection(ctx, child as ResolvedSection, { state: rowState[child.key], layout: {}, row }, [
        section.key,
        "rows",
        row.relationship.id,
        child.key,
      ]),
    );
    return { relationship: row.relationship, counterpart: row.counterpart, direction: row.direction, sections };
  });
  const findings = rows.flatMap((r) =>
    r.sections.flatMap((s) => s.findings.map((f) => `${title}, ${r.counterpart?.name ?? "(deleted)"}: ${f}`)),
  );
  return { component: "repeater", source: section.config.source.section, rows, findings };
}

/**
 * The document scope (slice DOC-3): the elements a document's prose mentions, and those it shows other than its
 * subject (on its linked diagrams, as table rows and as the flows under them). Hidden sections are left out.
 */
export interface DocumentScope {
  mentioned: Set<Id>;
  /** By id, in the order the document shows them. */
  members: Map<Id, ObjectRow>;
}

export function documentScope(state: ModelState, sections: readonly SectionModel[], subjectId?: Id): DocumentScope {
  const mentioned = new Set<Id>();
  const members = new Map<Id, ObjectRow>();
  const show = (o: ObjectRow | undefined) => {
    if (o && o.id !== subjectId && !members.has(o.id)) members.set(o.id, o);
  };
  const visit = (s: SectionModel) => {
    if (s.hidden) return;
    if (s.component === "prose")
      for (const p of s.prose.paragraphs) for (const x of p) if (typeof x !== "string") mentioned.add(x.mention);
    if (s.component === "diagramLink" && s.diagram)
      for (const o of state.objectOccurrences.find("byDiagram", s.diagram.id)) show(state.objects.get(o.objectId));
    if (s.component === "relationTable")
      for (const row of s.rows) {
        show(row.counterpart);
        for (const f of row.flows ?? []) show(f.object);
      }
    if (s.component === "repeater") for (const row of s.rows) row.sections.forEach(visit);
  };
  sections.forEach(visit);
  return { mentioned, members };
}

function projectRegister(ctx: Context, section: Section<"register">, title: string): Projection {
  const { state, metamodel, subject } = ctx;
  const config = section.config;
  const scope = ctx.scope ?? { mentioned: new Set<Id>(), members: new Map<Id, ObjectRow>() };
  const isItem = (o: ObjectRow | undefined): o is ObjectRow =>
    !!o && !o.deleted && config.types.some((t) => metamodel.isA(o.type, t));
  const reasons = new Map<Id, { object: ObjectRow; reasons: string[] }>();
  const add = (o: ObjectRow, reason: string) => {
    const entry = reasons.get(o.id) ?? { object: o, reasons: [] };
    if (!entry.reasons.includes(reason)) entry.reasons.push(reason);
    reasons.set(o.id, entry);
  };
  const via = { type: config.via.types, kind: config.via.kinds };
  const concerning = (target: ObjectRow) => {
    for (const r of state.relationships.find("byTarget", target.id)) {
      const item = state.objects.get(r.sourceId);
      if (!r.deleted && isItem(item) && matchesRelationship(metamodel, r, via)) add(item, `about ${target.name}`);
    }
  };
  if (config.from.includes("mentions"))
    for (const id of scope.mentioned) {
      const o = state.objects.get(id);
      if (isItem(o)) add(o, "mentioned");
    }
  if (config.from.includes("subject") && subject) concerning(subject);
  if (config.from.includes("members")) for (const m of scope.members.values()) concerning(m);

  const columns = config.columns.map((key) => ({
    key,
    label: metamodel.propertyType(key)?.name ?? key,
    properties: [key],
  }));
  const label = (key: string) => metamodel.propertyType(key)?.name ?? key;
  const rows: RegisterRow[] = [...reasons.values()].map(({ object, reasons }) => {
    const own = metamodel.objectType(object.type)?.properties;
    const cells: Record<string, TableCell> = {};
    for (const c of columns)
      cells[c.key] = { field: c.key, value: object.properties[c.key], applicable: own?.has(c.key) ?? false };
    const toFill = (config.checks ?? [])
      .filter(
        (check) =>
          own?.has(check.column) &&
          Object.entries(check.where ?? {}).every(([k, v]) => object.properties[k] === v) &&
          isEmpty(object.properties[check.column]),
      )
      .map((check) => label(check.column));
    return { object, reasons, cells, toFill };
  });
  rows.sort((a, b) => a.object.name.localeCompare(b.object.name) || a.object.id.localeCompare(b.object.id));

  let groups: RegisterGroup[];
  if (config.groupBy === "type") {
    const order = config.add?.types ?? [];
    const byType = new Map<TypeKey, RegisterRow[]>();
    for (const row of rows) byType.set(row.object.type, [...(byType.get(row.object.type) ?? []), row]);
    const rank = (t: TypeKey) => (order.includes(t) ? order.indexOf(t) : order.length);
    const typeName = (t: TypeKey) => {
      const d = metamodel.objectType(t)?.definition;
      return d?.plural ?? d?.name ?? t;
    };
    groups = [...byType.entries()]
      .map(([type, rows]) => ({ type, name: typeName(type), rows }))
      .sort((a, b) => rank(a.type) - rank(b.type) || a.name.localeCompare(b.name));
  } else groups = rows.length > 0 ? [{ type: null, name: title, rows }] : [];

  const findings = rows.flatMap((r) => r.toFill.map((l) => `${title}: ${r.object.name} has no ${l.toLowerCase()}`));
  if (section.required && rows.length === 0) findings.push(`${title}: none yet`);
  return { component: "register", config, columns, groups, count: rows.length, findings };
}

function projectSection(ctx: Context, section: ResolvedSection, scope: Scope, path: string[], region?: string) {
  const may: SectionFreedoms = {
    hide: path.length === 1 && sectionMay(section, "hide"),
    rename: path.length === 1 && sectionMay(section, "rename"),
    addProperties: sectionMay(section, "addProperties"),
    columns: sectionMay(section, "columns"),
  };
  const title = (may.rename && scope.layout.title) || section.title;
  const hidden = may.hide && scope.layout.hidden === true;
  const component = COMPONENTS[section.component] as Component;
  const projected = component.project(ctx, section as never, scope, title);
  return {
    definition: section,
    title,
    path,
    hidden,
    may,
    ...(region ? { region } : {}),
    ...projected,
    findings: hidden ? [] : projected.findings,
  } as SectionModel;
}

/** The subject's live relationships at either end, interaction messages left out (they belong to their interaction). */
function subjectRelationships(state: ModelState, subjectId: Id): RelationshipRow[] {
  const all = [...state.relationships.find("bySource", subjectId), ...state.relationships.find("byTarget", subjectId)];
  return [...new Map(all.filter((r) => !r.parentId).map((r) => [r.id, r])).values()];
}

export interface RegionModel {
  definition: RegionDefinition;
  /** Sections added there, in order. */
  sections: SectionModel[];
  /** Whether another section may be added. */
  full: boolean;
}

export type DocumentBlock = { kind: "section"; section: SectionModel } | { kind: "region"; region: RegionModel };

export interface DocumentModel {
  template: ResolvedTemplate | undefined;
  subjectId: Id | undefined;
  subject: ObjectRow | undefined;
  /** Every section, template and added, in order (repeater rows' sections are inside their repeater). */
  sections: SectionModel[];
  /** The page in order: sections, and regions with the sections added in them. */
  blocks: DocumentBlock[];
  /** Sections that count towards completeness (not hidden), and how many of them have no findings. */
  total: number;
  complete: number;
  findings: string[];
}

/** The document's layout: what authors changed in sections, and the sections they added in regions. */
export function layoutOf(definition: Record<string, unknown> | undefined): DocumentLayout {
  const layout = definition?.[LAYOUT_KEY];
  return layout && typeof layout === "object" ? (layout as DocumentLayout) : {};
}

/** Projects a document from its type's template and its own definition (the subject and each section's state). */
export function projectDocument(
  state: ModelState,
  metamodel: Metamodel,
  type: DiagramType | undefined,
  definition: Record<string, unknown> = {},
): DocumentModel {
  const template = type ? metamodel.diagramType(type.key)?.template : undefined;
  const subjectId = typeof definition[SUBJECT_KEY] === "string" ? (definition[SUBJECT_KEY] as Id) : undefined;
  const subject = subjectId ? state.objects.get(subjectId) : undefined;
  const layout = layoutOf(definition);
  const entries = template?.entries ?? [];

  // The template's sections, and in place of each region the sections added there (each `free`).
  const templateSections = entries.filter((e): e is ResolvedSection => !isRegion(e));
  const taken = new Set<string>([SUBJECT_KEY, LAYOUT_KEY, ...entries.map((e) => (isRegion(e) ? e.region : e.key))]);
  const problems: string[] = [];
  const placed: { section: ResolvedSection; region?: string }[] = [];
  for (const entry of entries) {
    if (!isRegion(entry)) {
      placed.push({ section: entry });
      continue;
    }
    for (const added of (layout.regions?.[entry.region] ?? []).slice(0, entry.max ?? Infinity)) {
      const section = { ...added, lock: "free", allow: {} } as ResolvedSection;
      const at = `${entry.title}, section "${added.title}"`;
      const issues =
        !entry.palette.includes(added.component) || taken.has(added.key)
          ? [`${at} cannot be added here`]
          : checkSection(metamodel, added, [...templateSections, ...placed.map((p) => p.section)], at);
      if (issues.length > 0) {
        problems.push(...issues);
        continue;
      }
      taken.add(added.key);
      placed.push({ section, region: entry.region });
    }
  }

  const ctx: Context = {
    state,
    metamodel,
    definition,
    subject,
    sections: placed.map((p) => p.section),
    tables: new Map(),
  };
  const project = (p: (typeof placed)[number]) =>
    projectSection(
      ctx,
      p.section,
      { state: definition[p.section.key], layout: layout.sections?.[p.section.key] ?? {} },
      [p.section.key],
      p.region,
    );
  // Tables first, so the repeaters that read them see their rows; registers last, over what the rest shows.
  const models = new Map<string, SectionModel>();
  const last = (p: (typeof placed)[number]) => p.section.component === "repeater" || p.section.component === "register";
  for (const p of placed)
    if (!last(p)) {
      const m = project(p);
      models.set(p.section.key, m);
      if (m.component === "relationTable" && !m.hidden) ctx.tables.set(p.section.key, m);
    }
  for (const p of placed) if (p.section.component === "repeater") models.set(p.section.key, project(p));
  ctx.scope = documentScope(state, [...models.values()], subject?.id);
  for (const p of placed) if (p.section.component === "register") models.set(p.section.key, project(p));
  const sections = placed.map((p) => models.get(p.section.key)!);

  const blocks: DocumentBlock[] = [];
  for (const entry of entries) {
    if (!isRegion(entry)) blocks.push({ kind: "section", section: models.get(entry.key)! });
    else {
      const added = sections.filter((s) => s.region === entry.region);
      blocks.push({
        kind: "region",
        region: { definition: entry, sections: added, full: added.length >= (entry.max ?? Infinity) },
      });
    }
  }
  const counted = sections.filter((s) => !s.hidden && COMPONENTS[s.definition.component].counts);
  return {
    template,
    subjectId,
    subject,
    sections,
    blocks,
    total: counted.length,
    complete: counted.filter((s) => s.findings.length === 0).length,
    findings: [...sections.flatMap((s) => s.findings), ...problems],
  };
}

/** Whether an object may be the subject of documents of a template. */
export function canBeSubject(
  metamodel: Metamodel,
  template: Pick<ResolvedTemplate, "subject">,
  object: ObjectRow,
): boolean {
  return matchesFilter(metamodel, object, template.subject);
}

/** The state at a section's path in a document's definition. */
export function stateAt(definition: Record<string, unknown> | undefined, path: readonly string[]): unknown {
  let at: unknown = definition;
  for (const key of path) at = at && typeof at === "object" ? (at as Record<string, unknown>)[key] : undefined;
  return at;
}

/**
 * The top-level definition key and its new value that set the state at `path` (null removes it), for one
 * `setViewDefinition`: a repeater row's section rewrites its repeater's key.
 */
export function withStateAt(
  definition: Record<string, unknown> | undefined,
  path: readonly string[],
  value: unknown,
): { key: string; value: unknown } {
  const [first, ...rest] = path;
  if (rest.length === 0) return { key: first!, value: value ?? null };
  const put = (at: unknown, keys: string[]): unknown => {
    const object = at && typeof at === "object" ? { ...(at as Record<string, unknown>) } : {};
    const [k, ...more] = keys;
    if (more.length === 0) {
      if (value === null || value === undefined) delete object[k!];
      else object[k!] = value;
    } else object[k!] = put(object[k!], more);
    return object;
  };
  return { key: first!, value: put(definition?.[first!], rest) };
}

/** Sets one section's layout within `definition.layout`; null fields are removed. */
export function withSectionLayout(
  definition: Record<string, unknown> | undefined,
  key: string,
  change: Partial<Record<keyof SectionLayout, unknown>>,
): DocumentLayout {
  const layout = layoutOf(definition);
  const next: Record<string, unknown> = { ...(layout.sections?.[key] ?? {}) };
  for (const [k, v] of Object.entries(change))
    if (v === null || v === undefined || (Array.isArray(v) && v.length === 0)) delete next[k];
    else next[k] = v;
  const sections = { ...layout.sections, [key]: next as SectionLayout };
  if (Object.keys(next).length === 0) delete sections[key];
  return { ...layout, sections };
}

/** A key for a section added in a region, not used by the template or another added section. */
export function newSectionKey(doc: DocumentModel, region: string): string {
  const taken = new Set([
    SUBJECT_KEY,
    LAYOUT_KEY,
    ...doc.sections.map((s) => s.definition.key),
    ...doc.blocks.flatMap((b) => (b.kind === "region" ? [b.region.definition.region] : [])),
  ]);
  let n = 1;
  while (taken.has(`${region}${n}`)) n++;
  return `${region}${n}`;
}

/** The relationship types a table may add between the subject and a counterpart, either way round. */
export function tableAddOptions(
  metamodel: Metamodel,
  config: RelationTableConfig,
  subject: ObjectRow,
  counterpart: ObjectRow,
): CellOption[] {
  const add = config.add ?? { types: config.source.relationships.types, kinds: config.source.relationships.kinds };
  const by = { type: add.types, kind: add.kinds };
  const options: CellOption[] = [];
  for (const [source, target] of [
    [subject, counterpart],
    [counterpart, subject],
  ] as const) {
    for (const t of metamodel.allowedRelationshipTypes(source.type, target.type)) {
      const kind = t.semantic;
      const matches =
        (!by.type?.length && !by.kind?.length) ||
        (by.type?.includes(t.key) ?? false) ||
        (kind !== undefined && (by.kind?.includes(kind) ?? false));
      if (matches) options.push({ type: t.key, name: t.verb, sourceId: source.id, targetId: target.id });
    }
  }
  return options;
}

export type { SectionDefinition };

// ------------------------------------------------------------------ prose as editable text

/** A mention while editing: `@[name](id)`. The name is only for reading; the id is what is stored. */
const MENTION = /@\[([^\]\n]*)\]\(([^)\s]+)\)/g;

/** Prose as the text an author edits: paragraphs separated by blank lines, mentions as `@[name](id)`. */
export function proseToMarkup(prose: ProseState, nameOf: (id: Id) => string): string {
  return prose.paragraphs
    .map((p) => p.map((x) => (typeof x === "string" ? x : `@[${nameOf(x.mention)}](${x.mention})`)).join(""))
    .join("\n\n");
}

/** The inverse of proseToMarkup; empty paragraphs are dropped. */
export function proseFromMarkup(text: string): ProseState {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p !== "")
    .map((p) => {
      const runs: ProseInline[] = [];
      let at = 0;
      for (const m of p.matchAll(MENTION)) {
        if (m.index > at) runs.push(p.slice(at, m.index));
        runs.push({ mention: m[2]! });
        at = m.index + m[0].length;
      }
      if (at < p.length) runs.push(p.slice(at));
      return runs;
    });
  return { paragraphs };
}
