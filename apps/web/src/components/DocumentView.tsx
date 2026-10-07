// A document view (design/02-model/views-and-design-artifacts.md §7–§8): a design artifact about one subject, built
// from its type's template. Each section is a component; what an author does in it is an ordinary model edit.
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { DiagramRow, Metamodel, ModelState, ObjectRow } from "@connectome/engine";
import { SUBJECT_KEY, ulid, type Edit, type Id, type PropertyValue, type SectionDefinition } from "@connectome/model";
import {
  COMPONENTS,
  proseFromMarkup,
  proseToMarkup,
  projectDocument,
  tableAddOptions,
  type DiagramLinkModel,
  type FactsModel,
  type ProseModel,
  type RelationTableModel,
  type SectionModel,
  type TableRow,
} from "@connectome/views";
import { useModel, useWorkbench } from "../state/workbench";
import { notationFor } from "../notation";
import { createLinkedDiagramPlan, placeRelationshipEdits } from "../document";
import { sequenceForInteractionEdits } from "../sequence";
import { edgePoint, layoutBoxes } from "../diagram";
import { displayValue, fieldGroups } from "../inspector";
import { byName } from "../text";
import { Glyph } from "./Glyph";
import { PropertyGroups, type GridContext } from "./Inspector";

interface SectionProps<M> {
  document: DiagramRow;
  section: SectionDefinition;
  model: M & { findings: string[] };
  subject: ObjectRow | undefined;
}

export function DocumentView({ id }: { id: Id }) {
  const { state, metamodel } = useModel();
  const edit = useWorkbench((s) => s.edit);
  const [showFindings, setShowFindings] = useState(false);
  const document = state.diagrams.get(id);
  if (!document) return <div className="empty-state muted">This document was deleted.</div>;
  const type = metamodel.diagramType(document.diagramType)?.definition;
  const doc = projectDocument(state, metamodel, type, document.definition);
  if (!doc.template) return <div className="empty-state muted">{type?.name ?? "This type"} has no template.</div>;
  const chooseSubject = (subjectId: Id) =>
    edit(`About ${state.objects.get(subjectId)?.name ?? "?"}`, [
      { edit: "setViewDefinition", diagramId: id, baseVersion: document.version, set: { [SUBJECT_KEY]: subjectId } },
    ]);
  const candidates = [...state.objects.live()]
    .filter((o) =>
      doc.template!.subject.type?.length ? doc.template!.subject.type.some((t) => metamodel.isA(o.type, t)) : true,
    )
    .sort(byName);

  return (
    <div className="document-view">
      <article className="document">
        <header className="doc-header">
          <div className="doc-kind muted">{type?.name}</div>
          <h1>{document.name}</h1>
          <div className="doc-subject">
            <span className="muted">About</span>
            {doc.subject ? (
              <ObjectChip object={doc.subject} metamodel={metamodel} />
            ) : (
              <>
                {doc.subjectId && <span className="doc-warning">The subject was deleted.</span>}
                <select aria-label="Subject" value="" onChange={(e) => e.target.value && chooseSubject(e.target.value)}>
                  <option value="">Choose a subject…</option>
                  {candidates.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </>
            )}
            <button
              className={`doc-complete${doc.complete === doc.total ? " done" : ""}`}
              aria-expanded={showFindings}
              onClick={() => setShowFindings(!showFindings)}
            >
              {doc.complete} of {doc.total} sections complete
            </button>
          </div>
          {showFindings && (
            <ul className="doc-findings" aria-label="What is missing">
              {doc.findings.length === 0 && <li>Nothing is missing.</li>}
              {doc.findings.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          )}
        </header>
        {doc.sections.map((s) => (
          <DocumentSection key={s.definition.key} document={document} model={s} subject={doc.subject} />
        ))}
      </article>
    </div>
  );
}

function DocumentSection(props: { document: DiagramRow; model: SectionModel; subject: ObjectRow | undefined }) {
  const { document, model, subject } = props;
  const section = model.definition;
  if (model.component === "heading")
    return (
      <h2 className="doc-heading" data-section={section.key}>
        {section.title}
      </h2>
    );
  const done = model.findings.length === 0;
  const counts = COMPONENTS[section.component].counts;
  const common = { document, section, subject };
  let body: ReactNode = null;
  if (model.component === "prose") body = <ProseSection {...common} model={model} />;
  if (model.component === "facts") body = <FactsSection {...common} model={model} />;
  if (model.component === "diagramLink") body = <DiagramLinkSection {...common} model={model} />;
  if (model.component === "relationTable") body = <RelationTableSection {...common} model={model} />;
  return (
    <section className="doc-section" data-section={section.key} aria-label={section.title}>
      <h2>
        {counts && (
          <span
            className={`doc-state${done ? " done" : ""}`}
            title={done ? "Complete" : model.findings.join("\n")}
            aria-label={done ? "Complete" : "Incomplete"}
          />
        )}
        {section.title}
        {section.required && <span className="muted doc-required">required</span>}
      </h2>
      {section.guidance && <p className="doc-guidance muted">{section.guidance}</p>}
      {body}
    </section>
  );
}

// ---------------------------------------------------------------- shared bits

function ObjectChip({ object, metamodel }: { object: ObjectRow; metamodel: Metamodel }) {
  const select = useWorkbench((s) => s.select);
  const openTab = useWorkbench((s) => s.openTab);
  const n = notationFor(metamodel.objectType(object.type));
  return (
    <button
      className="doc-chip"
      title={`${object.name}: ${metamodel.objectType(object.type)?.definition.name ?? object.type}. Double-click to open`}
      onClick={() => select({ kind: "object", id: object.id })}
      onDoubleClick={() => openTab({ kind: "object", id: object.id })}
    >
      <Glyph glyph={n.glyph} colour={n.ink} />
      {object.name}
    </button>
  );
}

const setSection = (document: DiagramRow, key: string, value: unknown): Edit => ({
  edit: "setViewDefinition",
  diagramId: document.id,
  baseVersion: document.version,
  set: { [key]: value ?? null },
});

// ---------------------------------------------------------------- prose

function ProseSection({ document, section, model, subject }: SectionProps<ProseModel>) {
  const { state, metamodel } = useModel();
  const edit = useWorkbench((s) => s.edit);
  const [text, setText] = useState<string | null>(null);
  const [query, setQuery] = useState<{ at: number; text: string } | null>(null);
  const [active, setActive] = useState(0);
  const [createType, setCreateType] = useState("");
  const area = useRef<HTMLTextAreaElement>(null);
  const nameOf = (oid: Id) => state.objects.get(oid)?.name ?? "deleted";
  const creatable =
    section.component === "prose" && section.config?.mentions?.create
      ? metamodel.allObjectTypes().filter((t) => !t.definition.abstract)
      : [];

  const start = () => {
    setText(proseToMarkup(model.prose, nameOf));
    setTimeout(() => area.current?.focus());
  };
  const save = () => {
    if (text === null) return;
    const prose = proseFromMarkup(text);
    setText(null);
    setQuery(null);
    if (JSON.stringify(prose) === JSON.stringify(model.prose)) return;
    edit(`Write ${section.title}`, [setSection(document, section.key, prose.paragraphs.length ? prose : null)]);
  };
  const track = (value: string, caret: number) => {
    const before = value.slice(0, caret);
    // Names may have spaces; punctuation, a line break or two spaces end the mention.
    const m = /(^|[\s(])@((?:[^\s@[\]().,;:!?](?: (?! ))?){0,40})$/.exec(before);
    setQuery(m ? { at: caret - m[2]!.length - 1, text: m[2]! } : null);
    setActive(0);
  };
  const matches = query
    ? [...state.objects.live()]
        .filter((o) => o.name.toLowerCase().includes(query.text.toLowerCase()))
        .sort(byName)
        .slice(0, 8)
    : [];
  const insert = (object: { id: Id; name: string }) => {
    if (text === null || !query) return;
    const token = `@[${object.name}](${object.id}) `;
    const end = query.at + 1 + query.text.length;
    const next = text.slice(0, query.at) + token + text.slice(end);
    setText(next);
    setQuery(null);
    const caret = query.at + token.length;
    setTimeout(() => {
      area.current?.focus();
      area.current?.setSelectionRange(caret, caret);
    });
  };
  const create = () => {
    const typeKey = createType || creatable[0]?.definition.key;
    const name = query?.text.trim();
    if (!typeKey || !name) return;
    const folderId = subject?.folderId ?? document.folderId;
    const id = ulid();
    if (edit(`Create ${name}`, [{ edit: "createObject", id, type: typeKey, name, folderId }])) insert({ id, name });
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      if (query) setQuery(null);
      else save();
      e.preventDefault();
      return;
    }
    if (!query || matches.length === 0) return;
    if (e.key === "ArrowDown") setActive((active + 1) % matches.length);
    else if (e.key === "ArrowUp") setActive((active - 1 + matches.length) % matches.length);
    else if (e.key === "Enter" || e.key === "Tab") insert(matches[active]!);
    else return;
    e.preventDefault();
  };

  if (text !== null)
    return (
      <div className="doc-prose editing">
        <textarea
          ref={area}
          aria-label={section.title}
          value={text}
          rows={Math.max(4, text.split("\n").length + 1)}
          onChange={(e) => {
            setText(e.target.value);
            track(e.target.value, e.target.selectionStart);
          }}
          onKeyDown={onKeyDown}
          onBlur={save}
        />
        {query && (
          <div className="doc-mentions" role="listbox" aria-label="Mention" onMouseDown={(e) => e.preventDefault()}>
            {matches.map((o, i) => {
              const n = notationFor(metamodel.objectType(o.type));
              return (
                <div
                  key={o.id}
                  role="option"
                  aria-selected={i === active}
                  className={i === active ? "active" : undefined}
                  onClick={() => insert(o)}
                >
                  <Glyph glyph={n.glyph} colour={n.ink} />
                  {o.name}
                  <span className="muted">{metamodel.objectType(o.type)?.definition.name}</span>
                </div>
              );
            })}
            {matches.length === 0 && <div className="muted pad">No element is called “{query.text}”.</div>}
            {creatable.length > 0 && query.text.trim() && (
              <div className="doc-mention-create">
                <span>Create “{query.text.trim()}” as</span>
                <select
                  aria-label="Type of the new element"
                  value={createType || creatable[0]!.definition.key}
                  onChange={(e) => setCreateType(e.target.value)}
                >
                  {creatable.map((t) => (
                    <option key={t.definition.key} value={t.definition.key}>
                      {t.definition.name}
                    </option>
                  ))}
                </select>
                <button onClick={create}>Create</button>
              </div>
            )}
          </div>
        )}
        <p className="muted doc-hint">
          Type @ to mention an element. A blank line starts a paragraph. Esc or click away to save.
        </p>
      </div>
    );

  return (
    <div className="doc-prose">
      {model.empty ? (
        <button className="doc-placeholder" onClick={start}>
          Write {section.title.toLowerCase()}…
        </button>
      ) : (
        <>
          {model.prose.paragraphs.map((p, i) => (
            <p key={i}>
              {p.map((x, j) =>
                typeof x === "string" ? (
                  x
                ) : (
                  <Mention key={j} id={x.mention} state={state} metamodel={metamodel} subject={subject} />
                ),
              )}
            </p>
          ))}
          <button className="link doc-edit" onClick={start}>
            Edit
          </button>
        </>
      )}
    </div>
  );
}

/** A mention in prose: the element's live name; a click offers to open it or link it to the subject (§7.3). */
function Mention(props: { id: Id; state: ModelState; metamodel: Metamodel; subject: ObjectRow | undefined }) {
  const { id, state, metamodel, subject } = props;
  const edit = useWorkbench((s) => s.edit);
  const openTab = useWorkbench((s) => s.openTab);
  const select = useWorkbench((s) => s.select);
  const [open, setOpen] = useState(false);
  const object = state.objects.get(id);
  if (!object) return <span className="doc-chip deleted">deleted element</span>;
  const n = notationFor(metamodel.objectType(object.type));
  const linked =
    subject &&
    [...state.relationships.find("bySource", subject.id), ...state.relationships.find("byTarget", subject.id)].filter(
      (r) => r.sourceId === object.id || r.targetId === object.id,
    );
  const options =
    subject && subject.id !== object.id
      ? [
          ...metamodel
            .allowedRelationshipTypes(subject.type, object.type)
            .map((t) => ({ type: t.key, verb: t.verb, sourceId: subject.id, targetId: object.id })),
          ...metamodel
            .allowedRelationshipTypes(object.type, subject.type)
            .map((t) => ({ type: t.key, verb: t.verb, sourceId: object.id, targetId: subject.id })),
        ]
      : [];
  const name = (oid: Id) => state.objects.get(oid)?.name ?? "?";
  return (
    <span className="doc-mention">
      <button
        className="doc-chip"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          select({ kind: "object", id });
          setOpen(!open);
        }}
      >
        <Glyph glyph={n.glyph} colour={n.ink} />
        {object.name}
      </button>
      {open && (
        <span className="doc-chip-menu" role="menu" onMouseLeave={() => setOpen(false)}>
          <button role="menuitem" onClick={() => openTab({ kind: "object", id })}>
            Open {object.name}
          </button>
          {linked?.map((r) => (
            <span key={r.id} className="muted">
              {name(r.sourceId)} {metamodel.relationshipType(r.type)?.verb} {name(r.targetId)}
            </span>
          ))}
          {options.length > 0 && <span className="muted">Link to subject</span>}
          {options.map((o) => (
            <button
              key={`${o.type}:${o.sourceId}`}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                edit(`${name(o.sourceId)} ${o.verb} ${name(o.targetId)}`, [
                  { edit: "createRelationship", id: ulid(), type: o.type, sourceId: o.sourceId, targetId: o.targetId },
                ]);
              }}
            >
              {name(o.sourceId)} {o.verb} {name(o.targetId)}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------- facts

function FactsSection({ section, model, subject }: SectionProps<FactsModel>) {
  const { state, metamodel } = useModel();
  const edit = useWorkbench((s) => s.edit);
  if (!subject) return <p className="muted">Choose a subject first.</p>;
  if (model.facts.length === 0) return <p className="muted">{subject.name}’s type has none of these properties.</p>;
  const keys = model.facts.map((f) => f.key);
  const { groups } = fieldGroups(metamodel, keys, subject.properties, {
    set: { key: section.key, name: section.title, properties: keys },
  });
  const ctx: GridContext = {
    state,
    metamodel,
    itemId: subject.id,
    commit: (f, value) =>
      edit(`Set ${f.pt.name} of ${subject.name}`, [
        { edit: "setProperties", id: subject.id, baseVersion: subject.version, set: { [f.pt.key]: value } },
      ]),
  };
  return (
    <div className="doc-facts props">
      <PropertyGroups groups={groups} ctx={ctx} prefix={`document:${section.key}`} />
    </div>
  );
}

// ---------------------------------------------------------------- linked diagram

function DiagramLinkSection({ document, section, model, subject }: SectionProps<DiagramLinkModel>) {
  const { state, metamodel } = useModel();
  const edit = useWorkbench((s) => s.edit);
  const openTab = useWorkbench((s) => s.openTab);
  if (section.component !== "diagramLink") return null;
  const typeName = metamodel.diagramType(model.diagramType)?.definition.name ?? model.diagramType;
  const create = () => {
    const plan = createLinkedDiagramPlan(metamodel, document, section, subject);
    edit(plan.label, plan.edits);
  };
  const existing = [...state.diagrams.live()].filter((d) => d.diagramType === model.diagramType).sort(byName);
  if (model.diagram)
    return (
      <div className="doc-diagram">
        <div className="doc-diagram-bar">
          <span>
            ⧉ <strong>{model.diagram.name}</strong> <span className="muted">{typeName}</span>
          </span>
          <button onClick={() => openTab({ kind: "diagram", id: model.diagram!.id })}>Open</button>
          <button
            className="link"
            onClick={() => edit(`Unlink ${model.diagram!.name}`, [setSection(document, section.key, null)])}
          >
            Unlink
          </button>
        </div>
        <DiagramPreview
          state={state}
          diagramId={model.diagram.id}
          subjectId={subject?.id}
          onOpen={() => openTab({ kind: "diagram", id: model.diagram!.id })}
        />
      </div>
    );
  return (
    <div className="doc-diagram empty">
      {model.deleted && (
        <p className="doc-warning">The linked diagram was deleted. Undo brings it back, or create a new one.</p>
      )}
      <button className="primary" onClick={create}>
        Create {section.title.toLowerCase()} diagram
      </button>
      {existing.length > 0 && (
        <select
          aria-label={`Link an existing ${typeName}`}
          value=""
          onChange={(e) =>
            e.target.value &&
            edit(`Link ${section.title}`, [setSection(document, section.key, { diagramId: e.target.value })])
          }
        >
          <option value="">or link an existing {typeName.toLowerCase()}…</option>
          {existing.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

/** A live, read-only drawing of a diagram: boxes and straight lines, the subject emphasised. */
function DiagramPreview(props: { state: ModelState; diagramId: Id; subjectId: Id | undefined; onOpen(): void }) {
  const { state, diagramId, subjectId, onOpen } = props;
  const boxes = layoutBoxes(state, diagramId);
  const occurrences = state.objectOccurrences.find("byDiagram", diagramId);
  if (occurrences.length === 0) return <p className="muted">Nothing is drawn yet. Open the diagram to draw.</p>;
  const all = [...boxes.values()];
  const pad = 24;
  const minX = Math.min(...all.map((b) => b.x)) - pad;
  const minY = Math.min(...all.map((b) => b.y)) - pad;
  const maxX = Math.max(...all.map((b) => b.x + b.w)) + pad;
  const maxY = Math.max(...all.map((b) => b.y + b.h)) + pad;
  const lines = state.relationshipOccurrences.find("byDiagram", diagramId).filter((r) => r.shownAs === "line");
  return (
    <svg
      className="doc-preview"
      role="img"
      aria-label="Diagram preview"
      viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
      style={{ maxHeight: Math.min(360, maxY - minY) }}
      onDoubleClick={onOpen}
    >
      <defs>
        <marker
          id={`doc-arrow-${diagramId}`}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto"
        >
          <path d="M0,0 L10,5 L0,10 z" className="doc-preview-arrow" />
        </marker>
      </defs>
      {lines.map((l) => {
        const a = boxes.get(l.sourceOccurrenceId);
        const b = boxes.get(l.targetOccurrenceId);
        if (!a || !b) return null;
        const p = edgePoint(a, { x: b.x + b.w / 2, y: b.y + b.h / 2 });
        const q = edgePoint(b, { x: a.x + a.w / 2, y: a.y + a.h / 2 });
        return (
          <line
            key={l.id}
            x1={p.x}
            y1={p.y}
            x2={q.x}
            y2={q.y}
            className="doc-preview-line"
            markerEnd={`url(#doc-arrow-${diagramId})`}
          />
        );
      })}
      {occurrences.map((o) => {
        const box = boxes.get(o.id)!;
        const object = state.objects.get(o.objectId);
        return (
          <g key={o.id} className={o.objectId === subjectId ? "subject" : undefined}>
            <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={6} className="doc-preview-box" />
            <text x={box.x + box.w / 2} y={box.y + box.h / 2} textAnchor="middle" dominantBaseline="central">
              {object?.name ?? "?"}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------- relation table

function RelationTableSection({ document, section, model, subject }: SectionProps<RelationTableModel>) {
  const { state, metamodel } = useModel();
  const edit = useWorkbench((s) => s.edit);
  const select = useWorkbench((s) => s.select);
  const [adding, setAdding] = useState<Id | "" | null>(null);
  const openTab = useWorkbench((s) => s.openTab);
  const { config } = model;
  const linkedDiagram = model.linked?.diagram;
  const name = (oid: Id) => state.objects.get(oid)?.name ?? "?";
  if (model.linked && !linkedDiagram)
    return (
      <p className="muted">
        Create the {model.linked.title.toLowerCase()} diagram first: its connectors are this table’s rows.
      </p>
    );

  const counterparts =
    subject && adding !== null
      ? [...state.objects.live()]
          .filter((o) => o.id !== subject.id)
          .filter((o) => {
            const dt = linkedDiagram && metamodel.diagramType(linkedDiagram.diagramType);
            return !dt || metamodel.diagramAllowsObjectType(dt, o.type);
          })
          .filter((o) => tableAddOptions(metamodel, config, subject, o).length > 0)
          .sort(byName)
      : [];
  const counterpart = adding ? state.objects.get(adding) : undefined;
  const options = subject && counterpart ? tableAddOptions(metamodel, config, subject, counterpart) : [];
  const add = (o: (typeof options)[number]) => {
    const id = ulid();
    const edits: Edit[] = [
      { edit: "createRelationship", id, type: o.type, sourceId: o.sourceId, targetId: o.targetId },
    ];
    if (linkedDiagram)
      edits.push(...placeRelationshipEdits(state, metamodel, linkedDiagram, { id, ...o }, subject?.id));
    if (edit(`${name(o.sourceId)} ${o.name} ${name(o.targetId)}`, edits)) setAdding(null);
  };
  const placeMissing = () => {
    if (!linkedDiagram) return;
    // One relationship at a time against a growing picture: later ones reuse the ends placed by earlier ones.
    const edits: Edit[] = [];
    const placed = new Map<Id, Id>();
    for (const r of model.missing) {
      const more = placeRelationshipEdits(state, metamodel, linkedDiagram, r, subject?.id).filter((e) => {
        if (e.edit !== "addObjectOccurrence") return true;
        if (placed.has(e.occurrence.objectId)) return false;
        placed.set(e.occurrence.objectId, e.occurrence.id);
        return true;
      });
      for (const e of more)
        if (e.edit === "addRelationshipOccurrence") {
          const s = state.relationships.get(e.occurrence.relationshipId);
          if (s && placed.has(s.sourceId) && !state.objectOccurrences.get(e.occurrence.sourceOccurrenceId))
            e.occurrence.sourceOccurrenceId = placed.get(s.sourceId)!;
          if (s && placed.has(s.targetId) && !state.objectOccurrences.get(e.occurrence.targetOccurrenceId))
            e.occurrence.targetOccurrenceId = placed.get(s.targetId)!;
        }
      edits.push(...more);
    }
    edit(`Add ${model.missing.length} to ${linkedDiagram.name}`, edits);
  };
  const ignore = () => {
    const previous = (document.definition?.[section.key] as { ignored?: Id[] } | undefined) ?? {};
    edit(`Ignore ${model.missing.length} in ${section.title}`, [
      setSection(document, section.key, {
        ...previous,
        ignored: [...(previous.ignored ?? []), ...model.missing.map((r) => r.id)],
      }),
    ]);
  };
  const required = new Set(config.required ?? []);
  // A row's sequence (decision V4): created on demand with the interaction's two ends and messages, and linked in
  // the section's state, in one change.
  const openSequence = (row: TableRow) => {
    if (row.sequence) return openTab({ kind: "diagram", id: row.sequence.id });
    if (!config.perRow) return;
    const plan = sequenceForInteractionEdits(
      state,
      metamodel,
      row.relationship.id,
      config.perRow.sequence,
      document.folderId,
    );
    if ("error" in plan) return;
    const previous = (document.definition?.[section.key] as { sequences?: Record<Id, Id> } | undefined) ?? {};
    const diagramId = (plan.edits[0] as { id: Id }).id;
    const link = setSection(document, section.key, {
      ...previous,
      sequences: { ...previous.sequences, [row.relationship.id]: diagramId },
    });
    if (edit(`Create ${plan.name}`, [...plan.edits, link])) openTab({ kind: "diagram", id: diagramId });
  };

  return (
    <div className="doc-table">
      {model.missing.length > 0 && (
        <div className="doc-banner" role="status">
          <span>
            {model.missing.length === 1 ? "1 relationship" : `${model.missing.length} relationships`} in the model{" "}
            {model.missing.length === 1 ? "is" : "are"} missing from the {model.linked?.title.toLowerCase()}:{" "}
            {model.missing.map((r) => name(r.sourceId === subject?.id ? r.targetId : r.sourceId)).join(", ")}
          </span>
          <button onClick={placeMissing}>Add to {model.linked?.title.toLowerCase()}</button>
          <button className="link" onClick={ignore}>
            Ignore
          </button>
        </div>
      )}
      <table aria-label={section.title}>
        <thead>
          <tr>
            <th scope="col">With</th>
            {model.columns.map((c) => (
              <th key={c.key} scope="col">
                {c.label}
                {required.has(c.key) && (
                  <span className="required" title="Required">
                    *
                  </span>
                )}
              </th>
            ))}
            {config.perRow && <th scope="col">Sequence</th>}
            <th scope="col" className="doc-row-state">
              <span className="visually-hidden">State</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {model.rows.length === 0 && (
            <tr>
              <td colSpan={model.columns.length + (config.perRow ? 3 : 2)} className="muted">
                {model.linked ? `No ${kindsText(config)} on the ${model.linked.title.toLowerCase()} yet.` : "None yet."}
              </td>
            </tr>
          )}
          {model.rows.map((row) => (
            <TableRowView
              key={row.relationship.id}
              row={row}
              model={model}
              state={state}
              metamodel={metamodel}
              onSelect={() => select({ kind: "relationship", id: row.relationship.id })}
              onSequence={config.perRow ? () => openSequence(row) : undefined}
            />
          ))}
        </tbody>
      </table>
      {subject && config.add && adding === null && (
        <button className="doc-add" onClick={() => setAdding("")}>
          + {config.add.label ?? "Add"}
        </button>
      )}
      {subject && adding !== null && (
        <div className="doc-add-form">
          <select aria-label="Counterpart" value={adding} onChange={(e) => setAdding(e.target.value)}>
            <option value="">With which element?</option>
            {counterparts.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          {options.map((o) => (
            <button key={`${o.type}:${o.sourceId}`} onClick={() => add(o)}>
              {name(o.sourceId)} {o.name} {name(o.targetId)}
            </button>
          ))}
          <button className="link" onClick={() => setAdding(null)}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

const kindsText = (config: RelationTableModel["config"]) =>
  config.source.relationships.kinds?.length ? `${config.source.relationships.kinds.join(" or ")}s` : "relationships";

function TableRowView(props: {
  row: TableRow;
  model: RelationTableModel;
  state: ModelState;
  metamodel: Metamodel;
  onSelect(): void;
  onSequence?(): void;
}) {
  const { row, model, state, metamodel, onSelect, onSequence } = props;
  const edit = useWorkbench((s) => s.edit);
  const rel = row.relationship;
  const type = metamodel.relationshipType(rel.type);
  const n = row.counterpart ? notationFor(metamodel.objectType(row.counterpart.type)) : undefined;
  const set = (key: string, value: PropertyValue | null) =>
    edit(`Set ${metamodel.propertyType(key)?.name ?? key} of ${row.counterpart?.name ?? "row"}`, [
      { edit: "setRelationshipProperties", id: rel.id, baseVersion: rel.version, set: { [key]: value } },
    ]);
  return (
    <tr data-relationship={rel.id} className={row.toDescribe.length ? "to-describe" : undefined}>
      <th scope="row">
        <button
          className="doc-chip"
          onClick={onSelect}
          title={`${type?.name ?? rel.type}: select to see it in the properties panel`}
        >
          {n && <Glyph glyph={n.glyph} colour={n.ink} />}
          {row.counterpart?.name ?? "(deleted)"}
        </button>
      </th>
      {model.columns.map((c) => {
        const cell = row.cells[c.key]!;
        if (!cell.applicable)
          return (
            <td key={c.key} className="muted na" title={`${type?.name ?? rel.type} has no ${c.label.toLowerCase()}`}>
              –
            </td>
          );
        if (cell.field === "direction")
          return (
            <td key={c.key} title={type?.name}>
              {row.direction === "out"
                ? `→ ${type?.verb}`
                : row.direction === "in"
                  ? `← ${type?.inverseVerb ?? type?.verb}`
                  : type?.verb}
            </td>
          );
        if (cell.field === "payload") {
          const ids = (cell.value as Id[] | undefined) ?? [];
          return (
            <td key={c.key}>
              {ids.length ? (
                ids.map((x) => state.objects.get(x)?.name ?? "?").join(", ")
              ) : (
                <span className="muted">–</span>
              )}
            </td>
          );
        }
        return (
          <td key={c.key}>
            <CellEditor
              label={`${c.label} of ${row.counterpart?.name ?? "row"}`}
              propertyKey={cell.field}
              value={cell.value}
              metamodel={metamodel}
              onCommit={(v) => set(cell.field, v)}
            />
          </td>
        );
      })}
      {onSequence && (
        <td>
          {row.sequence === null ? (
            <span className="muted" title="Only interactions have messages">
              –
            </span>
          ) : (
            <button
              className="link"
              aria-label={`${row.sequence ? "Open" : "Create"} the sequence with ${row.counterpart?.name ?? "row"}`}
              title={row.sequence?.name}
              onClick={onSequence}
            >
              {row.sequence ? "⇅ Open" : "+ Create"}
            </button>
          )}
        </td>
      )}
      <td className="doc-row-state">
        {row.toDescribe.length > 0 && (
          <span className="doc-badge" title={`Missing: ${row.toDescribe.join(", ")}`}>
            to describe
          </span>
        )}
      </td>
    </tr>
  );
}

/** A property edited in a table cell: a list as a dropdown, anything else as text committed on Enter or blur. */
function CellEditor(props: {
  label: string;
  propertyKey: string;
  value: PropertyValue | undefined;
  metamodel: Metamodel;
  onCommit(value: PropertyValue | null): void;
}) {
  const { label, propertyKey, value, metamodel, onCommit } = props;
  const pt = metamodel.propertyType(propertyKey);
  const list = pt?.valueList ? metamodel.valueList(pt.valueList) : undefined;
  const shown = displayValue(value ?? null, list);
  const [draft, setDraft] = useState<string | null>(null);
  if (list)
    return (
      <select
        aria-label={label}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onCommit(e.target.value || null)}
      >
        <option value="">–</option>
        {list.values.map((v) => (
          <option key={v.key} value={v.key}>
            {v.label}
          </option>
        ))}
      </select>
    );
  const commit = () => {
    if (draft === null) return;
    const text = draft.trim();
    setDraft(null);
    if (text === shown) return;
    if (!text) return onCommit(null);
    if (pt?.dataType === "number") {
      const number = Number(text);
      if (!Number.isNaN(number)) onCommit(number);
      return;
    }
    onCommit(text);
  };
  return (
    <input
      aria-label={label}
      className="doc-cell-input"
      value={draft ?? shown}
      placeholder="–"
      onFocus={() => setDraft(shown)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setDraft(null);
          e.currentTarget.blur();
        }
      }}
    />
  );
}
