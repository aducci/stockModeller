// The properties panel (design/04-ux/workbench.md): header, property groups with typed editors, relationships,
// "occurs on" diagrams and tags for the selection. Every edit is one change, shown at once.
import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import type { ModelState, ObjectRow, Metamodel, RelationshipRow } from "@connectome/engine";
import { LEVEL_PROPERTY, type Id, type PropertyType, type PropertyValue } from "@connectome/model";
import { useModel, useWorkbench } from "../state/workbench";
import { trace, traceByLevel, type TraceDirection, type TraceKind } from "@connectome/semantics";
import { addPayloadPlan, messagePlan, messagesOf, payloadChoices, payloadText, relationshipGroups } from "../semantics";
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
      {selection?.kind === "relationship" && <RelationshipProperties id={selection.id} />}
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
      <Trace key={object.id} object={object} state={state} metamodel={metamodel} />
      <OccursOn id={id} state={state} />
    </div>
  );
}

function groupName(key: string): string {
  if (key === "semantic") return "Semantics";
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
      // The level falls back to the type's default, and a type can fix it (semantics.md §4.2).
      const type = pt.key === LEVEL_PROPERTY ? metamodel.objectType(object.type) : undefined;
      const fallback = type?.level && list?.values.find((v) => v.key === type.level)?.label;
      editor = (
        <select
          id={id}
          value={typeof value === "string" ? value : ""}
          disabled={type?.levelFixed}
          onChange={(e) => onCommit(e.target.value || null)}
        >
          <option value="">{fallback ? `${fallback} (type default)` : "—"}</option>
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

/** Relationships grouped by what they mean (design/02-model/semantics.md §9.1), each row in the type's own words. */
function Relationships({ object, state, metamodel }: { object: ObjectRow; state: ModelState; metamodel: Metamodel }) {
  const select = useWorkbench((s) => s.select);
  const groups = relationshipGroups(state, metamodel, object.id);
  return (
    <section className="group">
      <h3>Relationships</h3>
      {groups.length === 0 && <p className="muted">None yet.</p>}
      {groups.map((g) => (
        <div key={`${g.kind}:${g.direction}`} className="rel-group" data-kind={g.kind}>
          <h4>{g.label}</h4>
          <ul className="plain">
            {g.rows.map(({ relationship, verb, other, arrow }) => (
              <li key={relationship.id} data-relationship={relationship.id}>
                <button
                  className="link muted"
                  title="Show this relationship"
                  onClick={() => select({ kind: "relationship", id: relationship.id })}
                >
                  {verb} {arrow}
                </button>{" "}
                <button className="link" onClick={() => select({ kind: "object", id: other })}>
                  {state.objects.get(other)?.name ?? other}
                </button>
                {relationship.payload.length > 0 && (
                  <span className="payload-text"> · {payloadText(state, relationship)}</span>
                )}
                {g.kind === "interaction" && <MessageList interaction={relationship} state={state} />}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

/** An interaction's messages, each with its direction and payload (semantics.md §6). */
function MessageList({ interaction, state }: { interaction: RelationshipRow; state: ModelState }) {
  const select = useWorkbench((s) => s.select);
  const messages = messagesOf(state, interaction);
  if (messages.length === 0) return null;
  return (
    <ul className="plain messages">
      {messages.map(({ message, role }) => (
        <li key={message.id} data-role={role}>
          <button className="link muted" onClick={() => select({ kind: "relationship", id: message.id })}>
            {role === "request" ? "Request →" : "Response ←"}
          </button>
          {message.payload.length > 0 && <span className="payload-text"> {payloadText(state, message)}</span>}
        </li>
      ))}
    </ul>
  );
}

/** A relationship: its two ends, what it carries, an interaction's messages (semantics.md §5–§6). */
function RelationshipProperties({ id }: { id: Id }) {
  const { state, metamodel } = useModel();
  const edit = useWorkbench((s) => s.edit);
  const select = useWorkbench((s) => s.select);
  const notify = useWorkbench((s) => s.notify);
  const relationship = state.relationships.get(id);
  if (!relationship) return <p className="muted pad">This relationship was deleted.</p>;
  const type = metamodel.relationshipType(relationship.type);
  const name = (objectId: Id) => state.objects.get(objectId)?.name ?? "(deleted)";
  const parent = relationship.parentId ? state.relationships.get(relationship.parentId) : undefined;
  const messages = type?.semantic === "interaction" ? messagesOf(state, relationship) : [];
  const run = (plan: ReturnType<typeof messagePlan>) =>
    "error" in plan ? notify(plan.error, "error") : edit(plan.label, plan.edits);
  const remove = () => {
    const label = `Delete ${name(relationship.sourceId)} ${type?.verb ?? relationship.type} ${name(relationship.targetId)}`;
    if (
      edit(messages.length > 0 ? `${label} and its ${messages.length} messages` : label, [
        { edit: "deleteRelationship", id, baseVersion: relationship.version },
      ])
    )
      select(parent ? { kind: "relationship", id: parent.id } : { kind: "object", id: relationship.sourceId });
  };

  return (
    <div className="props">
      <header className="props-header">
        <h2 className="name">
          <button className="link" onClick={() => select({ kind: "object", id: relationship.sourceId })}>
            {name(relationship.sourceId)}
          </button>{" "}
          <span className="muted">{type?.verb ?? relationship.type}</span>{" "}
          <button className="link" onClick={() => select({ kind: "object", id: relationship.targetId })}>
            {name(relationship.targetId)}
          </button>
        </h2>
        <div className="meta">
          <span className="chip">{type?.name ?? relationship.type}</span>
          {parent && (
            <button className="link" onClick={() => select({ kind: "relationship", id: parent.id })}>
              {relationship.sourceId === parent.sourceId ? "Request" : "Response"} of{" "}
              {metamodel.relationshipType(parent.type)?.name ?? parent.type}
            </button>
          )}
        </div>
      </header>

      {type && type.payload !== "none" && (
        <section className="group">
          <h3>Payload</h3>
          <PayloadEditor relationship={relationship} state={state} metamodel={metamodel} />
        </section>
      )}

      {type?.semantic === "interaction" && (
        <section className="group">
          <h3>Messages</h3>
          {messages.length === 0 && <p className="muted">No messages yet.</p>}
          <ul className="plain messages">
            {messages.map(({ message, role }) => (
              <li key={message.id} data-role={role}>
                <button className="link" onClick={() => select({ kind: "relationship", id: message.id })}>
                  {role === "request" ? "Request →" : "Response ←"}
                </button>
                <PayloadEditor relationship={message} state={state} metamodel={metamodel} />
              </li>
            ))}
          </ul>
          <div className="actions">
            <button onClick={() => run(messagePlan(state, metamodel, id, "request"))}>Add request</button>
            <button onClick={() => run(messagePlan(state, metamodel, id, "response"))}>Add response</button>
          </div>
        </section>
      )}

      <section className="group">
        <button className="danger" onClick={remove}>
          Delete relationship
        </button>
      </section>
    </div>
  );
}

/** What a relationship carries: one chip per object (× takes it out) and a picker to add one. */
function PayloadEditor(props: { relationship: RelationshipRow; state: ModelState; metamodel: Metamodel }) {
  const { relationship, state, metamodel } = props;
  const edit = useWorkbench((s) => s.edit);
  const notify = useWorkbench((s) => s.notify);
  const setPayload = (label: string, payload: Id[]) =>
    edit(label, [{ edit: "setPayload", id: relationship.id, baseVersion: relationship.version, payload }]);
  return (
    <div className="payload" aria-label="Payload">
      {relationship.payload.map((objectId) => {
        const name = state.objects.get(objectId)?.name ?? "(deleted)";
        return (
          <span key={objectId} className="chip">
            {name}
            <button
              className="link"
              aria-label={`Remove ${name} from the payload`}
              onClick={() =>
                setPayload(
                  `Stop carrying ${name}`,
                  relationship.payload.filter((p) => p !== objectId),
                )
              }
            >
              ×
            </button>
          </span>
        );
      })}
      <select
        aria-label="Add to payload"
        value=""
        onChange={(e) => {
          const plan = addPayloadPlan(state, metamodel, relationship.id, e.target.value);
          if ("error" in plan) notify(plan.error, "error");
          else edit(plan.label, plan.edits);
        }}
      >
        <option value="">Add…</option>
        {payloadChoices(state, metamodel, relationship).map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </div>
  );
}

/** The traces offered for an object (semantics.md §9.3), in the words of the framework's questions. */
const TRACES: { key: string; label: string; kind: TraceKind; direction: TraceDirection; contents?: boolean }[] = [
  { key: "down", label: "Implementations (down the levels)", kind: "levels", direction: "forward" },
  { key: "up", label: "What this implements (up the levels)", kind: "levels", direction: "backward" },
  { key: "downstream", label: "Downstream", kind: "flow", direction: "forward", contents: true },
  { key: "upstream", label: "Upstream", kind: "flow", direction: "backward", contents: true },
  { key: "receivers", label: "Who receives this information", kind: "payload", direction: "forward" },
  { key: "senders", label: "Who sends this information", kind: "payload", direction: "backward" },
  { key: "dependsOn", label: "What this depends on", kind: "dependency", direction: "forward" },
  { key: "usedBy", label: "What depends on this", kind: "dependency", direction: "backward" },
];

/** Trace ▸: follows relationships by meaning, lays the result out by level and highlights it on diagrams. */
function Trace({ object, state, metamodel }: { object: ObjectRow; state: ModelState; metamodel: Metamodel }) {
  const select = useWorkbench((s) => s.select);
  const current = useWorkbench((s) => s.trace);
  const showTrace = useWorkbench((s) => s.showTrace);
  // Keyed by object, so selecting another object starts afresh; coming back keeps the trace shown.
  const [chosen, setChosen] = useState(() =>
    current?.startId === object.id ? (TRACES.find((t) => t.label === current.label)?.key ?? "") : "",
  );
  const option = TRACES.find((t) => t.key === chosen);
  const result = option
    ? trace(state, metamodel, object.id, option.kind, option.direction, { contents: option.contents ?? false })
    : undefined;
  const levels = metamodel.valueList("semanticLevel");
  const levelName = (level: string | null) =>
    level ? (levels?.values.find((v) => v.key === level)?.label ?? level) : "No level";
  const choose = (key: string) => {
    setChosen(key);
    const next = TRACES.find((t) => t.key === key);
    if (!next) return showTrace(null);
    const ids = trace(state, metamodel, object.id, next.kind, next.direction, {
      contents: next.contents ?? false,
    }).steps.map((s) => s.objectId);
    showTrace({ startId: object.id, label: next.label, objectIds: new Set([object.id, ...ids]) });
  };
  return (
    <section className="group trace">
      <h3>Trace</h3>
      <select aria-label="Trace" value={chosen} onChange={(e) => choose(e.target.value)}>
        <option value="">Choose a trace…</option>
        {TRACES.map((t) => (
          <option key={t.key} value={t.key}>
            {t.label}
          </option>
        ))}
      </select>
      {result && result.steps.length === 0 && <p className="muted">Nothing found.</p>}
      {result &&
        traceByLevel(state, metamodel, result).map((column) => (
          <div key={column.level ?? "none"} className="trace-level" data-level={column.level ?? "none"}>
            <h4>{levelName(column.level)}</h4>
            <ul className="plain">
              {column.objectIds.map((id) => (
                <li key={id}>
                  <button className="link" onClick={() => select({ kind: "object", id })}>
                    {state.objects.get(id)?.name ?? id}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      {result?.truncated && <p className="muted">Showing the first {result.steps.length}.</p>}
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
