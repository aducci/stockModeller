// Design artifacts (views-and-design-artifacts.md §7–§8): a document about one subject, built from a template's
// sections. Each component projects its section from the model rows; the findings make the completeness.
import {
  SUBJECT_KEY,
  type ComponentKey,
  type DiagramType,
  type DocumentTemplate,
  type Id,
  type PropertyKey,
  type PropertyValue,
  type ProseInline,
  type ProseState,
  type RelationTableConfig,
  type SectionDefinition,
} from "@connectome/model";
import type { DiagramRow, Metamodel, ModelState, ObjectRow, RelationshipRow } from "@connectome/engine";
import { matchesFilter, matchesRelationship } from "./scope";
import type { CellOption } from "./matrix";

type Section<C extends ComponentKey> = Extract<SectionDefinition, { component: C }>;

interface Context {
  state: ModelState;
  metamodel: Metamodel;
  definition: Record<string, unknown>;
  subject: ObjectRow | undefined;
  sections: readonly SectionDefinition[];
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
  /** The subject's properties the template lists, in its order; ones the subject's type lacks are left out. */
  facts: FactModel[];
}
export interface DiagramLinkModel {
  component: "diagramLink";
  diagramType: string;
  /** The linked diagram, when it exists. */
  diagram: DiagramRow | undefined;
  /** A diagram was linked and has been deleted since. */
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
}
export interface TableColumnModel {
  key: string;
  label: string;
  properties: PropertyKey[];
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
}

export type SectionModel = { definition: SectionDefinition; findings: string[] } & (
  HeadingModel | ProseModel | FactsModel | DiagramLinkModel | RelationTableModel
);

/** A component (§8.1): its name for the palette, and a pure projection of one section with its findings. */
export interface Component<C extends ComponentKey = ComponentKey> {
  key: C;
  name: string;
  description: string;
  /** Whether the section counts towards completeness. */
  counts: boolean;
  project(ctx: Context, section: Section<C>): Omit<SectionModel, "definition">;
}

const isEmpty = (value: unknown) =>
  value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);

const proseOf = (value: unknown): ProseState =>
  value && typeof value === "object" && Array.isArray((value as ProseState).paragraphs)
    ? (value as ProseState)
    : { paragraphs: [] };

const linkedDiagramId = (definition: Record<string, unknown>, key: string): Id | undefined => {
  const state = definition[key] as { diagramId?: unknown } | undefined;
  return typeof state?.diagramId === "string" ? state.diagramId : undefined;
};

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
    project: (ctx, section) => {
      const prose = proseOf(ctx.definition[section.key]);
      const empty = !prose.paragraphs.some((p) => p.some((x) => typeof x !== "string" || x.trim() !== ""));
      return {
        component: "prose",
        prose,
        empty,
        findings: empty && section.required ? [`${section.title} is empty`] : [],
      };
    },
  },
  facts: {
    key: "facts",
    name: "Key facts",
    description: "Chosen properties of the subject, edited in place.",
    counts: true,
    project: (ctx, section) => {
      const own = ctx.subject ? ctx.metamodel.objectType(ctx.subject.type)?.properties : undefined;
      const facts = section.config.properties
        .filter((key) => own?.has(key))
        .map((key) => ({ key, value: ctx.subject?.properties[key] }));
      const unset = facts.filter((f) => isEmpty(f.value));
      const name = (key: string) => ctx.metamodel.propertyType(key)?.name ?? key;
      return {
        component: "facts",
        facts,
        findings: section.required ? unset.map((f) => `${section.title}: ${name(f.key)} is not set`) : [],
      };
    },
  },
  diagramLink: {
    key: "diagramLink",
    name: "Linked diagram",
    description: "A diagram the author draws, shown as a live preview.",
    counts: true,
    project: (ctx, section) => {
      const id = linkedDiagramId(ctx.definition, section.key);
      const diagram = id ? ctx.state.diagrams.get(id) : undefined;
      const deleted = id !== undefined && !diagram;
      const findings = deleted
        ? [`${section.title}: the linked diagram was deleted`]
        : !diagram && section.required
          ? [`${section.title}: no diagram yet`]
          : [];
      return { component: "diagramLink", diagramType: section.config.diagramType, diagram, deleted, findings };
    },
  },
  relationTable: {
    key: "relationTable",
    name: "Relation table",
    description: "One row per relationship, from a linked diagram's connectors or the subject's own.",
    counts: true,
    project: (ctx, section) => projectTable(ctx, section),
  },
};

function columnsOf(metamodel: Metamodel, config: RelationTableConfig): TableColumnModel[] {
  return config.columns.map((c) => {
    if (typeof c !== "string") return c;
    if (c === "direction") return { key: c, label: "Direction", properties: [] };
    if (c === "payload") return { key: c, label: "Carries", properties: [] };
    return { key: c, label: metamodel.propertyType(c)?.name ?? c, properties: [c] };
  });
}

function projectTable(
  ctx: Context,
  section: Section<"relationTable">,
): Omit<RelationTableModel & { findings: string[] }, never> {
  const { state, metamodel, subject } = ctx;
  const config = section.config;
  const filter = { type: config.source.relationships.types, kind: config.source.relationships.kinds };
  const columns = columnsOf(metamodel, config);
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

  const required = new Set(config.required ?? []);
  const rows: TableRow[] = relationships.map((relationship) => {
    const direction =
      subject?.id === relationship.sourceId ? "out" : subject?.id === relationship.targetId ? "in" : null;
    const counterpart = state.objects.get(direction === "in" ? relationship.sourceId : relationship.targetId);
    const own = metamodel.relationshipTypeProperties(relationship.type);
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
        const property = column.properties.find((p) => own.has(p));
        cells[column.key] = property
          ? { field: property, value: relationship.properties[property], applicable: true }
          : { field: column.properties[0] ?? column.key, value: undefined, applicable: false };
      }
    }
    const toDescribe = columns
      .filter((c) => required.has(c.key) && cells[c.key]!.applicable && isEmpty(cells[c.key]!.value))
      .map((c) => c.label);
    return { relationship, counterpart, direction, cells, toDescribe };
  });
  rows.sort(
    (a, b) =>
      (a.counterpart?.name ?? "").localeCompare(b.counterpart?.name ?? "") ||
      a.relationship.id.localeCompare(b.relationship.id),
  );

  let missing: RelationshipRow[] = [];
  if (config.missing && linkedSection && subject) {
    const shown = new Set(relationships.map((r) => r.id));
    const ignored = new Set(((ctx.definition[section.key] as { ignored?: Id[] } | undefined)?.ignored ?? []) as Id[]);
    missing = subjectRelationships(state, subject.id).filter(
      (r) => matchesRelationship(metamodel, r, filter) && !shown.has(r.id) && !ignored.has(r.id),
    );
  }

  const findings: string[] = [];
  const name = (o: ObjectRow | undefined) => o?.name ?? "(deleted)";
  for (const row of rows)
    if (row.toDescribe.length > 0)
      findings.push(`${section.title}: ${name(row.counterpart)} has no ${row.toDescribe.join(" or ").toLowerCase()}`);
  if (section.required && rows.length === 0) findings.push(`${section.title}: none yet`);
  if (missing.length > 0)
    findings.push(
      `${section.title}: ${missing.length === 1 ? "1 relationship is" : `${missing.length} relationships are`} not on the ${linked?.title.toLowerCase() ?? "diagram"}`,
    );
  return { component: "relationTable", config, columns, rows, linked, missing, findings };
}

/** The subject's live relationships at either end, interaction messages left out (they belong to their interaction). */
function subjectRelationships(state: ModelState, subjectId: Id): RelationshipRow[] {
  const all = [...state.relationships.find("bySource", subjectId), ...state.relationships.find("byTarget", subjectId)];
  return [...new Map(all.filter((r) => !r.parentId).map((r) => [r.id, r])).values()];
}

export interface DocumentModel {
  template: DocumentTemplate | undefined;
  subjectId: Id | undefined;
  subject: ObjectRow | undefined;
  sections: SectionModel[];
  /** Sections that count towards completeness, and how many of them have no findings. */
  total: number;
  complete: number;
  findings: string[];
}

/** Projects a document from its type's template and its own definition (the subject and each section's state). */
export function projectDocument(
  state: ModelState,
  metamodel: Metamodel,
  type: DiagramType | undefined,
  definition: Record<string, unknown> = {},
): DocumentModel {
  const template = type?.document;
  const subjectId = typeof definition[SUBJECT_KEY] === "string" ? (definition[SUBJECT_KEY] as Id) : undefined;
  const subject = subjectId ? state.objects.get(subjectId) : undefined;
  const ctx: Context = { state, metamodel, definition, subject, sections: template?.sections ?? [] };
  const sections = (template?.sections ?? []).map((section) => {
    const component = COMPONENTS[section.component] as Component;
    return { definition: section, ...component.project(ctx, section as never) } as SectionModel;
  });
  const counted = sections.filter((s) => COMPONENTS[s.definition.component].counts);
  return {
    template,
    subjectId,
    subject,
    sections,
    total: counted.length,
    complete: counted.filter((s) => s.findings.length === 0).length,
    findings: sections.flatMap((s) => s.findings),
  };
}

/** Whether an object may be the subject of documents of a template. */
export function canBeSubject(metamodel: Metamodel, template: DocumentTemplate, object: ObjectRow): boolean {
  return matchesFilter(metamodel, object, template.subject);
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
