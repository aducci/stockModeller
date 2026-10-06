// The properties panel (design/04-ux/workbench.md): header, property groups with typed editors, relationships,
// "occurs on" diagrams and tags for the selection. Every edit is one change, shown at once.
import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import type { ModelState, ObjectRow, Metamodel } from "@connectome/engine";
import type { Id, PropertyType, PropertyValue } from "@connectome/model";
import { useModel, useWorkbench } from "../state/workbench";
import { byName, folderPath } from "../text";

export function Properties() {
  useModel();
  const selection = useWorkbench((s) => s.selection);
  return (
    <aside className="properties" aria-label="Properties">
      <div className="pane-title">
        <span>Properties</span>
      </div>
      {!selection && <p className="muted pad">Select something in the explorer to see its properties.</p>}
      {selection?.kind === "object" && <ObjectProperties id={selection.id} />}
      {selection?.kind === "folder" && <FolderProperties id={selection.id} />}
      {selection?.kind === "diagram" && <DiagramProperties id={selection.id} />}
    </aside>
  );
}

export function ObjectProperties({ id }: { id: Id }) {
  const { state, metamodel } = useModel();
  const edit = useWorkbench((s) => s.edit);
  const object = state.objects.get(id);
  if (!object) return <p className="muted pad">This object was deleted.</p>;
  const type = metamodel.objectType(object.type);
  const set = (key: string, value: PropertyValue | null, label: string) =>
    edit(label, [{ edit: "setProperties", id, baseVersion: object.version, set: { [key]: value } }]);

  const groups = new Map<string, PropertyType[]>();
  for (const key of type?.properties ?? []) {
    const pt = metamodel.propertyType(key);
    if (!pt) continue;
    groups.set(pt.group, [...(groups.get(pt.group) ?? []), pt]);
  }

  return (
    <div className="props">
      <header className="props-header">
        <TextField
          label="Name"
          className="name"
          value={object.name}
          onCommit={(name) =>
            name.trim() !== "" &&
            edit(`Rename ${object.name} to ${name.trim()}`, [
              { edit: "renameObject", id, baseVersion: object.version, name: name.trim() },
            ])
          }
        />
        <div className="meta">
          <span className="chip">{type?.definition.name ?? object.type}</span>
          {object.key && <span className="mono">{object.key}</span>}
        </div>
        <div className="muted breadcrumb">📁 {folderPath(state, object.folderId).join(" / ")}</div>
      </header>

      {[...groups].map(([group, types]) => (
        <section key={group} className="group">
          <h3>{groupName(group)}</h3>
          {types.map((pt) => (
            <PropertyRow
              key={pt.key}
              pt={pt}
              object={object}
              state={state}
              metamodel={metamodel}
              onCommit={(value) => set(pt.key, value, `Set ${pt.name} of ${object.name}`)}
            />
          ))}
        </section>
      ))}

      <section className="group">
        <h3>Tags</h3>
        <TextField
          label="Tags"
          value={object.tags.join(", ")}
          onCommit={(text) =>
            edit(`Tag ${object.name}`, [
              {
                edit: "setTags",
                id,
                baseVersion: object.version,
                tags: [
                  ...new Set(
                    text
                      .split(",")
                      .map((t) => t.trim())
                      .filter(Boolean),
                  ),
                ],
              },
            ])
          }
        />
      </section>

      <Relationships object={object} state={state} metamodel={metamodel} />
      <OccursOn id={id} state={state} />
    </div>
  );
}

function groupName(key: string): string {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function PropertyRow(props: {
  pt: PropertyType;
  object: ObjectRow;
  state: ModelState;
  metamodel: Metamodel;
  onCommit(value: PropertyValue | null): boolean;
}) {
  const { pt, object, state, metamodel, onCommit } = props;
  const value = object.properties[pt.key] ?? null;
  const id = `prop-${pt.key}`;
  let editor: ReactNode;
  switch (pt.dataType) {
    case "calculated":
      editor = <span className="readonly">ƒ {value === null ? "—" : formatValue(value)}</span>;
      break;
    case "list": {
      const list = metamodel.valueList(pt.valueList ?? "");
      editor = (
        <select
          id={id}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onCommit(e.target.value || null)}
        >
          <option value="">—</option>
          {list?.values.map((v) => (
            <option key={v.key} value={v.key}>
              {v.label}
            </option>
          ))}
        </select>
      );
      break;
    }
    case "multiList": {
      const list = metamodel.valueList(pt.valueList ?? "");
      const chosen = new Set(Array.isArray(value) ? (value as string[]) : []);
      editor = (
        <span className="checks" id={id}>
          {list?.values.map((v) => (
            <label key={v.key}>
              <input
                type="checkbox"
                checked={chosen.has(v.key)}
                onChange={(e) => {
                  const next = list.values
                    .map((x) => x.key)
                    .filter((k) => (k === v.key ? e.target.checked : chosen.has(k)));
                  onCommit(next.length ? next : null);
                }}
              />
              {v.label}
            </label>
          ))}
        </span>
      );
      break;
    }
    case "boolean":
      editor = <input id={id} type="checkbox" checked={value === true} onChange={(e) => onCommit(e.target.checked)} />;
      break;
    case "number":
      editor = (
        <TextField
          id={id}
          label={pt.name}
          type="number"
          value={typeof value === "number" ? String(value) : ""}
          onCommit={(t) => onCommit(t.trim() === "" ? null : Number(t))}
        />
      );
      break;
    case "money": {
      const money = value && typeof value === "object" && !Array.isArray(value) ? value : null;
      editor = (
        <TextField
          id={id}
          label={pt.name}
          type="number"
          value={money ? String(money.amount) : ""}
          suffix={money?.currency ?? "EUR"}
          onCommit={(t) => onCommit(t.trim() === "" ? null : { amount: Number(t), currency: money?.currency ?? "EUR" })}
        />
      );
      break;
    }
    case "date":
      editor = (
        <TextField
          id={id}
          label={pt.name}
          type="date"
          value={typeof value === "string" ? value : ""}
          onCommit={(t) => onCommit(t || null)}
        />
      );
      break;
    case "objectRef": {
      const allowed = pt.objectTypes ?? [];
      const choices = [...state.objects.live()]
        .filter((o) => o.id !== object.id && (allowed.length === 0 || allowed.some((t) => metamodel.isA(o.type, t))))
        .sort(byName);
      editor = (
        <select
          id={id}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onCommit(e.target.value || null)}
        >
          <option value="">—</option>
          {choices.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      );
      break;
    }
    default:
      editor = (
        <TextField
          id={id}
          label={pt.name}
          value={typeof value === "string" ? value : ""}
          multiline={pt.dataType === "richText"}
          onCommit={(t) => onCommit(t.trim() === "" ? null : t)}
        />
      );
  }
  return (
    <div className="prop-row">
      <label htmlFor={id} title={pt.help}>
        {pt.name}
      </label>
      <div className="editor">
        {editor}
        {pt.unit && <span className="unit">{pt.unit}</span>}
      </div>
    </div>
  );
}

function formatValue(value: PropertyValue): string {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) return `${value.amount} ${value.currency}`;
  return Array.isArray(value) ? value.join(", ") : String(value);
}

function Relationships({ object, state, metamodel }: { object: ObjectRow; state: ModelState; metamodel: Metamodel }) {
  const select = useWorkbench((s) => s.select);
  const rows = [
    ...state.relationships.find("bySource", object.id).map((r) => ({
      r,
      verb: metamodel.relationshipType(r.type)?.verb ?? r.type,
      other: r.targetId,
      arrow: "→",
    })),
    ...state.relationships.find("byTarget", object.id).map((r) => ({
      r,
      verb: metamodel.relationshipType(r.type)?.inverseVerb ?? r.type,
      other: r.sourceId,
      arrow: "←",
    })),
  ].sort((a, b) => a.verb.localeCompare(b.verb));
  return (
    <section className="group">
      <h3>Relationships</h3>
      {rows.length === 0 && <p className="muted">None yet.</p>}
      <ul className="plain">
        {rows.map(({ r, verb, other, arrow }) => (
          <li key={r.id}>
            <span className="muted">
              {verb} {arrow}
            </span>{" "}
            <button className="link" onClick={() => select({ kind: "object", id: other })}>
              {state.objects.get(other)?.name ?? other}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function OccursOn({ id, state }: { id: Id; state: ModelState }) {
  const openTab = useWorkbench((s) => s.openTab);
  const diagrams = [...new Set(state.objectOccurrences.find("byObject", id).map((o) => o.diagramId))]
    .map((d) => state.diagrams.get(d))
    .filter((d) => d !== undefined)
    .sort(byName);
  return (
    <section className="group">
      <h3>Occurs on ({diagrams.length})</h3>
      <ul className="plain">
        {diagrams.map((d) => (
          <li key={d.id}>
            <button className="link" onClick={() => openTab({ kind: "diagram", id: d.id })}>
              ⧉ {d.name}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function FolderProperties({ id }: { id: Id }) {
  const { state } = useModel();
  const edit = useWorkbench((s) => s.edit);
  const folder = state.folders.get(id);
  if (!folder) return <p className="muted pad">This folder was deleted.</p>;
  return (
    <div className="props">
      <header className="props-header">
        <TextField
          label="Name"
          className="name"
          value={folder.name}
          onCommit={(name) =>
            name.trim() !== "" &&
            edit(`Rename folder ${folder.name} to ${name.trim()}`, [{ edit: "renameFolder", id, name: name.trim() }])
          }
        />
        <div className="meta">
          <span className="chip">Folder</span>
        </div>
        <div className="muted breadcrumb">📁 {folderPath(state, folder.parentId).join(" / ") || "Top level"}</div>
      </header>
      <section className="group">
        <p className="muted">
          {state.folders.count("byParent", id)} folders · {state.objects.count("byFolder", id)} objects ·{" "}
          {state.diagrams.count("byFolder", id)} diagrams
        </p>
      </section>
    </div>
  );
}

function DiagramProperties({ id }: { id: Id }) {
  const { state, metamodel } = useModel();
  const edit = useWorkbench((s) => s.edit);
  const diagram = state.diagrams.get(id);
  if (!diagram) return <p className="muted pad">This diagram was deleted.</p>;
  return (
    <div className="props">
      <header className="props-header">
        <TextField
          label="Name"
          className="name"
          value={diagram.name}
          onCommit={(name) =>
            name.trim() !== "" &&
            edit(`Rename diagram ${diagram.name} to ${name.trim()}`, [
              { edit: "updateDiagram", id, baseVersion: diagram.version, set: { name: name.trim() } },
            ])
          }
        />
        <div className="meta">
          <span className="chip">
            {metamodel.diagramType(diagram.diagramType)?.definition.name ?? diagram.diagramType}
          </span>
        </div>
        <div className="muted breadcrumb">📁 {folderPath(state, diagram.folderId).join(" / ")}</div>
      </header>
    </div>
  );
}

/** A text input that commits on Enter or when it loses focus, and reverts on Escape. */
export function TextField(props: {
  label: string;
  value: string;
  /** Returns whether the edit was accepted. */
  onCommit(value: string): boolean;
  id?: string;
  type?: "text" | "number" | "date";
  className?: string;
  suffix?: string;
  multiline?: boolean;
}) {
  const { label, value, onCommit, id, type = "text", className, suffix, multiline } = props;
  const [draft, setDraft] = useState(value);
  // Follow the model when it changes (someone else's edit, or a rejected one rolling back).
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    // A refused edit leaves the model as it was: show its value again.
    if (draft !== value && !onCommit(draft)) setDraft(value);
  };
  const common = {
    id,
    "aria-label": label,
    className,
    value: draft,
    onBlur: commit,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "Enter" && !(multiline && e.shiftKey)) {
        e.preventDefault();
        (e.target as HTMLElement).blur();
      } else if (e.key === "Escape") {
        setDraft(value);
        requestAnimationFrame(() => (e.target as HTMLElement).blur());
      }
    },
  };
  return (
    <span className="field">
      {multiline ? (
        <textarea {...common} rows={3} onChange={(e) => setDraft(e.target.value)} />
      ) : (
        <input {...common} type={type} onChange={(e) => setDraft(e.target.value)} />
      )}
      {suffix && <span className="unit">{suffix}</span>}
    </span>
  );
}
