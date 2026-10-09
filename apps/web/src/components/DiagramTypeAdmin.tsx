// The Diagram types view of the metamodel tab (views in the app, slice U-3): the types grouped by kind with how many
// diagrams use each, and an editor with a tab per concern (General, then Notation, Matrix, Sequence or Template for
// the type's kind), all on the metamodel draft that "Review and publish" sends.
import { useMemo, useState } from "react";
import type { Metamodel } from "@connectome/engine";
import {
  RENDITIONS,
  VIEW_KINDS,
  type DiagramType,
  type MatrixDefinition,
  type SymbolStyle,
  type TypeKey,
  type ViewKind,
} from "@connectome/model";
import { matrixDefinition, projectMatrix } from "@connectome/views";
import { isRegion } from "@connectome/model";
import { useModel } from "../state/workbench";
import { typeTree } from "../metamodel-admin";
import type { Draft } from "../property-admin";
import { KINDS, KIND_GLYPH, KIND_NAME } from "../views";
import {
  diagramTypeChanges,
  diagramsByType,
  duplicateDiagramType,
  kindOf,
  removeDiagramType,
  setDescribes,
  setKind,
  setSymbol,
  updateDiagramType,
  withSubject,
} from "../diagram-type-admin";
import { TypePropertiesPanel } from "./PropertyAdmin";
import { newDiagramType, rootObjectTypes } from "../type-admin";
import { NewTypeButton } from "./TypeAdmin";

type Tab = "general" | "notation" | "matrix" | "sequence" | "template";
const KIND_TAB: Record<ViewKind, { tab: Tab; label: string }> = {
  canvas: { tab: "notation", label: "Notation" },
  matrix: { tab: "matrix", label: "Matrix" },
  sequence: { tab: "sequence", label: "Sequence" },
  document: { tab: "template", label: "Template" },
};
const SHAPES: SymbolStyle["shape"][] = ["rect", "roundRect", "ellipse", "hexagon", "cylinder", "person"];

interface Props {
  draft: Draft;
  published: Draft;
  metamodel: Metamodel;
  onChange(draft: Draft): void;
}

export function DiagramTypesView({ draft, published, metamodel, onChange }: Props) {
  const { state } = useModel();
  const used = useMemo(() => diagramsByType(state), [state]);
  const changes = useMemo(() => diagramTypeChanges(published, draft), [published, draft]);
  const [picked, setPicked] = useState<TypeKey | null>(draft.diagramTypes[0]?.key ?? null);
  const [tab, setTab] = useState<Tab>("general");
  const type = draft.diagramTypes.find((t) => t.key === picked) ?? draft.diagramTypes[0];
  const roots = rootObjectTypes(draft);
  const status = (key: TypeKey) =>
    changes.added.some((t) => t.key === key) ? "new" : changes.changed.some((t) => t.key === key) ? "changed" : null;

  const pick = (key: TypeKey) => {
    setPicked(key);
    setTab("general");
  };
  const duplicate = (key: TypeKey) => {
    const result = duplicateDiagramType(draft, key);
    onChange(result.draft);
    pick(result.key);
  };

  return (
    <div className="mm-diagram-types">
      <nav className="dt-list" aria-label="Diagram types">
        <NewTypeButton
          label="New diagram type"
          placeholder="Data flow map"
          disabled={
            roots.length === 0 ? "Create an object type first: a diagram type says which ones it shows" : undefined
          }
          onCreate={(name) => {
            const made = newDiagramType(draft, name, roots);
            onChange(made.draft);
            pick(made.key);
          }}
        />
        <p className="muted small">
          A new type is a blank diagram showing every object type; choose what it shows below. Duplicate copies a type
          that works, its template and matrix included.
        </p>
        {KINDS.map((k) => {
          const ofKind = draft.diagramTypes.filter((t) => kindOf(t) === k.kind);
          if (ofKind.length === 0) return null;
          return (
            <section key={k.kind}>
              <h3>
                <span aria-hidden>{KIND_GLYPH[k.kind]}</span> {k.name}
              </h3>
              <ul className="plain">
                {ofKind.map((t) => (
                  <li key={t.key}>
                    <button
                      className={t.key === type?.key ? "picked" : undefined}
                      aria-pressed={t.key === type?.key}
                      onClick={() => pick(t.key)}
                    >
                      <span className="name">{t.name}</span>
                      {status(t.key) && <span className="chip">{status(t.key)}</span>}
                      <span className="muted small">
                        {used.get(t.key) ?? 0} diagram{used.get(t.key) === 1 ? "" : "s"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </nav>
      {type && (
        <TypeEditor
          key={type.key}
          type={type}
          tab={tab}
          onTab={setTab}
          inUse={used.get(type.key) ?? 0}
          published={published.diagramTypes.some((t) => t.key === type.key)}
          draft={draft}
          metamodel={metamodel}
          onChange={onChange}
          onDuplicate={() => duplicate(type.key)}
          onRemove={() => {
            onChange(removeDiagramType(draft, type.key));
            setPicked(null);
          }}
        />
      )}
    </div>
  );
}

function TypeEditor(props: {
  type: DiagramType;
  tab: Tab;
  onTab(tab: Tab): void;
  inUse: number;
  published: boolean;
  draft: Draft;
  metamodel: Metamodel;
  onChange(draft: Draft): void;
  onDuplicate(): void;
  onRemove(): void;
}) {
  const { type, tab, onTab, inUse, draft, metamodel, onChange } = props;
  const kind = kindOf(type);
  const tabs = [{ tab: "general" as Tab, label: "General" }, KIND_TAB[kind]];
  const shown = tabs.some((t) => t.tab === tab) ? tab : "general";
  const update = (patch: Partial<DiagramType>) => onChange(updateDiagramType(draft, type.key, patch));
  const ctx = { type, draft, metamodel, update, onChange };

  return (
    <section className="dt-editor" aria-label={`Diagram type ${type.name}`}>
      <header>
        <h3>
          <span aria-hidden>{KIND_GLYPH[kind]}</span> {type.name}
        </h3>
        <span className="muted mono small">{type.key}</span>
        <span className="spacer" />
        <button onClick={props.onDuplicate}>Duplicate</button>
        <button
          className="danger"
          disabled={inUse > 0}
          title={inUse > 0 ? `${inUse} diagrams use this type` : "Remove this type from the draft"}
          onClick={props.onRemove}
        >
          Delete
        </button>
      </header>
      <div className="mm-views dt-tabs" role="tablist" aria-label="Settings of the type">
        {tabs.map((t) => (
          <button
            key={t.tab}
            role="tab"
            aria-selected={shown === t.tab}
            className={shown === t.tab ? "active" : ""}
            onClick={() => onTab(t.tab)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="dt-tab" role="tabpanel" aria-label={tabs.find((t) => t.tab === shown)!.label}>
        {shown === "general" && <GeneralTab {...ctx} inUse={inUse} />}
        {shown === "notation" && <NotationTab {...ctx} />}
        {shown === "matrix" && <MatrixTab {...ctx} />}
        {shown === "sequence" && <SequenceTab {...ctx} />}
        {shown === "template" && <TemplateTab {...ctx} />}
      </div>
    </section>
  );
}

interface TabProps {
  type: DiagramType;
  draft: Draft;
  metamodel: Metamodel;
  update(patch: Partial<DiagramType>): void;
  onChange(draft: Draft): void;
}

const toggled = (list: readonly string[] | undefined, key: string, on: boolean) =>
  on ? [...(list ?? []).filter((k) => k !== key), key] : (list ?? []).filter((k) => k !== key);

function GeneralTab({ type, draft, metamodel, update, onChange, inUse }: TabProps & { inUse: number }) {
  const kind = kindOf(type);
  return (
    <div className="dt-form">
      <label className="field">
        <span>Name</span>
        <input aria-label="Name" value={type.name} onChange={(e) => update({ name: e.target.value })} />
      </label>
      <label className="field">
        <span>Description</span>
        <textarea
          aria-label="Description"
          rows={2}
          value={type.description ?? ""}
          onChange={(e) => update({ description: e.target.value || undefined })}
        />
      </label>
      <label className="field">
        <span>Kind</span>
        <select
          aria-label="Kind"
          value={kind}
          disabled={inUse > 0}
          title={inUse > 0 ? `${inUse} diagrams use this type, so its kind is fixed` : undefined}
          onChange={(e) => onChange(setKind(draft, type.key, e.target.value as ViewKind))}
        >
          {VIEW_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_NAME[k]}
            </option>
          ))}
        </select>
      </label>
      {kind === "document" ? (
        <DescribesField
          type={type}
          metamodel={metamodel}
          onChange={(types) => onChange(setDescribes(draft, type.key, types))}
        />
      ) : (
        <>
          <ObjectTypesField
            label={kind === "sequence" ? "Lifelines can be" : "Elements it can show"}
            type={type}
            metamodel={metamodel}
            update={update}
          />
          <RelationshipTypesField
            label={kind === "sequence" ? "Messages and interactions" : "Relationships it can show"}
            type={type}
            metamodel={metamodel}
            update={update}
          />
          <SubjectField type={type} metamodel={metamodel} update={update} />
        </>
      )}
      <TypePropertiesPanel kind="diagram" type={type.key} draft={draft} metamodel={metamodel} onChange={onChange} />
    </div>
  );
}

/**
 * What a document type describes (views-and-design-artifacts.md §13): the element types, with their subtypes, that its
 * documents can be about. Each document is about one of them; what it shows is up to its sections.
 */
function DescribesField(props: { type: DiagramType; metamodel: Metamodel; onChange(types: TypeKey[]): void }) {
  const { type, metamodel, onChange } = props;
  const chosen =
    type.document?.subject?.type ?? metamodel.diagramType(type.key)?.template?.subject.type ?? type.objectTypes;
  return (
    <fieldset className="dt-choices">
      <legend>Describes</legend>
      <p className="muted small">
        A document of this type is about one element of these types (a type includes its subtypes). Its sections decide
        what it shows.
      </p>
      {typeTree(metamodel).map(({ type: t, depth }) => {
        const key = t.definition.key;
        const on = chosen.includes(key);
        return (
          <label key={key} style={{ paddingLeft: depth * 16 }}>
            <input
              type="checkbox"
              checked={on}
              disabled={on && chosen.length === 1}
              title={on && chosen.length === 1 ? "A document describes at least one type of element" : undefined}
              onChange={(e) => onChange(toggled(chosen, key, e.target.checked))}
            />
            {t.definition.name}
          </label>
        );
      })}
    </fieldset>
  );
}

/**
 * What the type's diagrams can be about (DOC-1): a diagram made from an element (a child diagram, New from an
 * element) is about it, and a link to it can go in one of the element's link properties.
 */
function SubjectField(props: { type: DiagramType; metamodel: Metamodel; update(patch: Partial<DiagramType>): void }) {
  const { type, metamodel, update } = props;
  const chosen = type.subject?.type;
  const linkProperties = metamodel.allPropertyTypes().filter((p) => p.dataType === "url" && p.many);
  return (
    <fieldset className="dt-choices">
      <legend>About an element</legend>
      <p className="muted small">
        A diagram made from an element is about it: it is listed under the element and opens from its symbols.
      </p>
      <label>
        <input
          type="checkbox"
          checked={chosen === undefined}
          onChange={(e) => update(withSubject(type, { type: e.target.checked ? undefined : [...type.objectTypes] }))}
        />
        Any element
      </label>
      {chosen !== undefined &&
        typeTree(metamodel).map(({ type: t, depth }) => (
          <label key={t.definition.key} style={{ paddingLeft: depth * 16 }}>
            <input
              type="checkbox"
              checked={chosen.includes(t.definition.key)}
              onChange={(e) =>
                update(withSubject(type, { type: toggled(chosen, t.definition.key, e.target.checked) ?? [] }))
              }
            />
            {t.definition.name}
          </label>
        ))}
      <label className="field">
        <span>Link it from</span>
        <select
          aria-label="Link it from"
          value={type.subject?.linkProperty ?? ""}
          onChange={(e) => update(withSubject(type, { linkProperty: e.target.value || undefined }))}
        >
          <option value="">Nowhere</option>
          {linkProperties.map((p) => (
            <option key={p.key} value={p.key}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
    </fieldset>
  );
}

function ObjectTypesField(props: {
  label: string;
  type: DiagramType;
  metamodel: Metamodel;
  update(patch: Partial<DiagramType>): void;
}) {
  const { label, type, metamodel, update } = props;
  return (
    <fieldset className="dt-choices">
      <legend>{label}</legend>
      <p className="muted small">A type includes its subtypes.</p>
      {typeTree(metamodel).map(({ type: t, depth }) => (
        <label key={t.definition.key} style={{ paddingLeft: depth * 16 }}>
          <input
            type="checkbox"
            checked={type.objectTypes.includes(t.definition.key)}
            onChange={(e) => update({ objectTypes: toggled(type.objectTypes, t.definition.key, e.target.checked) })}
          />
          {t.definition.name}
        </label>
      ))}
    </fieldset>
  );
}

function RelationshipTypesField(props: {
  label: string;
  type: DiagramType;
  metamodel: Metamodel;
  update(patch: Partial<DiagramType>): void;
}) {
  const { label, type, metamodel, update } = props;
  const all = type.relationshipTypes === undefined;
  return (
    <fieldset className="dt-choices">
      <legend>{label}</legend>
      <label>
        <input
          type="checkbox"
          checked={all}
          onChange={(e) =>
            update({
              relationshipTypes: e.target.checked ? undefined : metamodel.allRelationshipTypes().map((r) => r.key),
            })
          }
        />
        Every relationship type
      </label>
      {!all &&
        metamodel.allRelationshipTypes().map((r) => (
          <label key={r.key}>
            <input
              type="checkbox"
              checked={type.relationshipTypes!.includes(r.key)}
              onChange={(e) => update({ relationshipTypes: toggled(type.relationshipTypes, r.key, e.target.checked) })}
            />
            {r.name} <span className="muted small">{r.semantic}</span>
          </label>
        ))}
    </fieldset>
  );
}

function NotationTab({ type, draft, metamodel, update, onChange }: TabProps) {
  const shown = metamodel
    .allObjectTypes()
    .filter((t) => !t.definition.abstract && type.objectTypes.some((a) => metamodel.isA(t.definition.key, a)));
  const symbol = (key: TypeKey) => type.symbols?.[key] ?? {};
  const set = (key: TypeKey, field: keyof SymbolStyle, value: SymbolStyle[keyof SymbolStyle] | undefined) =>
    onChange(setSymbol(draft, type.key, key, field, value));
  const number = (v: string) => (v === "" ? undefined : Math.max(16, Math.min(2000, Number(v))));
  return (
    <div className="dt-form">
      <label className="field">
        <span>Nesting</span>
        <select
          aria-label="Nesting"
          value={type.nesting ?? "lines"}
          onChange={(e) => update({ nesting: e.target.value as DiagramType["nesting"] })}
        >
          <option value="nested">Contents drawn inside their container</option>
          <option value="lines">Containment drawn as lines</option>
        </select>
      </label>
      <label className="field check">
        <input
          type="checkbox"
          checked={type.showExistingRelationships ?? false}
          onChange={(e) => update({ showExistingRelationships: e.target.checked || undefined })}
        />
        Draw relationships that already exist when an element is added
      </label>
      <label className="field">
        <span>Shapes start as</span>
        <select
          aria-label="Default rendition"
          value={type.renditions?.default ?? ""}
          onChange={(e) =>
            update({
              renditions:
                e.target.value || type.renditions?.semanticZoom
                  ? { ...type.renditions, default: e.target.value || undefined }
                  : undefined,
            })
          }
        >
          <option value="">The element type's rendition</option>
          {Object.keys(RENDITIONS).map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      <table className="mm-table dt-symbols" aria-label="Symbols">
        <thead>
          <tr>
            <th>Element type</th>
            <th>Shape</th>
            <th>Fill</th>
            <th className="num">Width</th>
            <th className="num">Height</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((t) => {
            const s = symbol(t.definition.key);
            const name = t.definition.name;
            return (
              <tr key={t.definition.key}>
                <td>{name}</td>
                <td>
                  <select
                    aria-label={`Shape of ${name}`}
                    value={s.shape ?? ""}
                    onChange={(e) => set(t.definition.key, "shape", (e.target.value || undefined) as never)}
                  >
                    <option value="">Its type's</option>
                    {SHAPES.map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <span className="dt-fill">
                    <input
                      type="color"
                      aria-label={`Fill of ${name}`}
                      value={s.fill ?? "#ffffff"}
                      onChange={(e) => set(t.definition.key, "fill", e.target.value)}
                    />
                    {s.fill && (
                      <button
                        className="link"
                        aria-label={`Clear the fill of ${name}`}
                        onClick={() => set(t.definition.key, "fill", undefined)}
                      >
                        ×
                      </button>
                    )}
                  </span>
                </td>
                {(["width", "height"] as const).map((f) => (
                  <td key={f} className="num">
                    <input
                      type="number"
                      aria-label={`${f === "width" ? "Width" : "Height"} of ${name}`}
                      placeholder="auto"
                      value={s[f] ?? ""}
                      onChange={(e) => set(t.definition.key, f, number(e.target.value))}
                    />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MatrixTab({ type, metamodel, update }: TabProps) {
  const { state } = useModel();
  const matrix = type.matrix ?? matrixDefinition(type, {});
  const set = (patch: Partial<MatrixDefinition>) => update({ matrix: { ...matrix, ...patch } });
  const objectTypes = metamodel.allObjectTypes();
  const relationshipTypes = metamodel.allRelationshipTypes();
  const preview = useMemo(() => {
    try {
      return projectMatrix(state, metamodel, matrixDefinition(type, {}));
    } catch {
      return null;
    }
  }, [state, metamodel, type]);
  const filled = preview
    ? preview.rows.reduce(
        (n, r) => n + preview.columns.filter((c) => preview.cell(r.object.id, c.object.id).length).length,
        0,
      )
    : 0;
  const axis = (label: string, which: "rows" | "columns") => (
    <label className="field">
      <span>{label}</span>
      <select
        aria-label={label}
        value={matrix[which].from.type?.[0] ?? ""}
        onChange={(e) => set({ [which]: { ...matrix[which], from: e.target.value ? { type: [e.target.value] } : {} } })}
      >
        <option value="">Choose a type…</option>
        {objectTypes.map((t) => (
          <option key={t.definition.key} value={t.definition.key}>
            {t.definition.name}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="dt-form">
      {axis("Rows", "rows")}
      {axis("Columns", "columns")}
      <label className="field">
        <span>Relationship</span>
        <select
          aria-label="Relationship"
          value={matrix.relationships.types?.[0] ?? ""}
          onChange={(e) =>
            set({
              relationships: { ...matrix.relationships, types: e.target.value ? [e.target.value] : undefined },
              create: e.target.value || undefined,
            })
          }
        >
          <option value="">Any relationship</option>
          {relationshipTypes.map((r) => (
            <option key={r.key} value={r.key}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Direction</span>
        <select
          aria-label="Direction"
          value={matrix.relationships.dir ?? "rowToColumn"}
          onChange={(e) =>
            set({
              relationships: {
                ...matrix.relationships,
                dir: e.target.value as NonNullable<MatrixDefinition["relationships"]["dir"]>,
              },
            })
          }
        >
          <option value="rowToColumn">Row → column</option>
          <option value="columnToRow">Column → row</option>
          <option value="either">Either way</option>
        </select>
      </label>
      <label className="field check">
        <input
          type="checkbox"
          checked={matrix.groupRows ?? false}
          onChange={(e) => set({ groupRows: e.target.checked || undefined })}
        />
        Nest rows under their containers
      </label>
      <label className="field check">
        <input
          type="checkbox"
          checked={matrix.hideEmpty ?? false}
          onChange={(e) => set({ hideEmpty: e.target.checked || undefined })}
        />
        Hide empty rows and columns
      </label>
      <p className="muted dt-preview" role="status" aria-label="Preview">
        {preview
          ? `On this repository: ${preview.rows.length} rows × ${preview.columns.length} columns, ${filled} cells filled.`
          : "Choose rows and columns to see a preview."}
      </p>
    </div>
  );
}

function SequenceTab({ type, metamodel, update }: TabProps) {
  return (
    <div className="dt-form">
      <p className="muted small">
        A sequence draws elements as lifelines and real messages of their interactions as arrows, in step order.
      </p>
      <ObjectTypesField label="Lifelines can be" type={type} metamodel={metamodel} update={update} />
      <RelationshipTypesField label="Messages and interactions" type={type} metamodel={metamodel} update={update} />
    </div>
  );
}

function TemplateTab({ type, metamodel }: TabProps) {
  const resolved = metamodel.diagramType(type.key)?.template;
  return (
    <div className="dt-form">
      <p className="muted small">
        The sections of a document of this type, from its template and patterns. Editing them comes with the template
        designer.
      </p>
      <ol className="dt-outline" aria-label="Template sections">
        {(resolved?.entries ?? []).map((e) =>
          isRegion(e) ? (
            <li key={e.region}>
              <strong>{e.title}</strong> <span className="muted small">region: {e.palette.join(", ")}</span>
            </li>
          ) : (
            <li key={e.key}>
              <strong>{e.title}</strong> <span className="muted small">{e.component}</span>
              {e.required && <span className="chip">required</span>}
              <span className="chip">{e.lock}</span>
            </li>
          ),
        )}
      </ol>
    </div>
  );
}
