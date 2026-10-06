// The properties panel (design/04-ux/workbench.md): the generic inspector (Inspector.tsx) filled for each kind of
// selection: header, property groups, tags, relationships, trace and "occurs on". Every edit is one change, shown at once.
import { useState } from "react";
import type { ModelState, ObjectRow, Metamodel, RelationshipRow } from "@connectome/engine";
import { LEVEL_PROPERTY, type Id } from "@connectome/model";
import { useModel, useWorkbench } from "../state/workbench";
import { fieldGroups } from "../inspector";
import {
  InspectorHeader,
  InspectorToolbar,
  PropertyGroups,
  Section,
  TextField,
  usePanelPrefs,
  type GridContext,
} from "./Inspector";
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
  const hideEmpty = usePanelPrefs((s) => s.hideEmpty);
  const [filter, setFilter] = useState("");
  const object = state.objects.get(id);
  if (!object) return <p className="muted pad">This object was deleted.</p>;
  const type = metamodel.objectType(object.type);
  const { groups, hidden } = fieldGroups(metamodel, type?.properties ?? [], object.properties, { filter, hideEmpty });
  const levelList = metamodel.valueList("semanticLevel");
  const typeLevel = type?.level && levelList?.values.find((v) => v.key === type.level)?.label;
  const ctx: GridContext = {
    state,
    metamodel,
    itemId: id,
    // The level falls back to the type's default, and a type can fix it (semantics.md §4.2).
    placeholder: (f) => (f.pt.key === LEVEL_PROPERTY && typeLevel ? `${typeLevel} (type default)` : undefined),
    readOnly: (f) => f.pt.key === LEVEL_PROPERTY && (type?.levelFixed ?? false),
    commit: (f, value) =>
      edit(`Set ${f.pt.name} of ${object.name}`, [
        { edit: "setProperties", id, baseVersion: object.version, set: { [f.pt.key]: value } },
      ]),
  };
  const prefix = `object:${object.type}`;
  const filtering = filter.trim() !== "";

  return (
    <div className="props">
      <InspectorHeader
        name={object.name}
        onRename={(name) =>
          edit(`Rename ${object.name} to ${name}`, [{ edit: "renameObject", id, baseVersion: object.version, name }])
        }
        type={type?.definition.name ?? object.type}
        itemKey={object.key}
        path={folderPath(state, object.folderId).join(" / ")}
        description={object.description}
        onDescribe={(description) =>
          edit(description ? `Describe ${object.name}` : `Clear the description of ${object.name}`, [
            { edit: "setDescription", id, baseVersion: object.version, description },
          ])
        }
      />
      <InspectorToolbar
        filter={filter}
        onFilter={setFilter}
        hidden={hidden}
        sectionIds={[
          ...groups.map((g) => `${prefix}:${g.key}`),
          ...["tags", "relationships", "trace", "occurs"].map((s) => `object:${s}`),
        ]}
      />
      <PropertyGroups groups={groups} ctx={ctx} prefix={prefix} />
      {filtering && groups.length === 0 && <p className="muted pad">No properties match “{filter.trim()}”.</p>}

      {!filtering && (
        <>
          <Section id="object:tags" title="Tags" count={object.tags.length || undefined}>
            <TextField
              label="Tags"
              className="value"
              placeholder="Add tags, separated by commas"
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
          </Section>
          <Relationships object={object} state={state} metamodel={metamodel} />
          <Trace key={object.id} object={object} state={state} metamodel={metamodel} />
          <OccursOn id={id} state={state} />
        </>
      )}
    </div>
  );
}

/** Relationships grouped by what they mean (design/02-model/semantics.md §9.1), each row in the type's own words. */
function Relationships({ object, state, metamodel }: { object: ObjectRow; state: ModelState; metamodel: Metamodel }) {
  const select = useWorkbench((s) => s.select);
  const groups = relationshipGroups(state, metamodel, object.id);
  return (
    <Section
      id="object:relationships"
      title="Relationships"
      count={groups.reduce((n, g) => n + g.rows.length, 0) || undefined}
    >
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
    </Section>
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
  const { groups } = fieldGroups(metamodel, type?.properties ?? [], relationship.properties);
  const ctx: GridContext = { state, metamodel, itemId: id, readOnly: () => true, commit: () => false };
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
      <InspectorHeader
        name={`${name(relationship.sourceId)} ${type?.verb ?? relationship.type} ${name(relationship.targetId)}`}
        title={
          <h2 className="name">
            <button className="link" onClick={() => select({ kind: "object", id: relationship.sourceId })}>
              {name(relationship.sourceId)}
            </button>{" "}
            <span className="muted">{type?.verb ?? relationship.type}</span>{" "}
            <button className="link" onClick={() => select({ kind: "object", id: relationship.targetId })}>
              {name(relationship.targetId)}
            </button>
          </h2>
        }
        type={type?.name ?? relationship.type}
      >
        {parent && (
          <button className="link" onClick={() => select({ kind: "relationship", id: parent.id })}>
            {relationship.sourceId === parent.sourceId ? "Request" : "Response"} of{" "}
            {metamodel.relationshipType(parent.type)?.name ?? parent.type}
          </button>
        )}
      </InspectorHeader>

      {/* Relationship properties are shown read-only until setProperties covers relationships (Sem-3 "Not yet"). */}
      <PropertyGroups groups={groups} ctx={ctx} prefix={`relationship:${relationship.type}`} />

      {type && type.payload !== "none" && (
        <Section id="relationship:payload" title="Payload" count={relationship.payload.length || undefined}>
          <PayloadEditor relationship={relationship} state={state} metamodel={metamodel} />
        </Section>
      )}

      {type?.semantic === "interaction" && (
        <Section id="relationship:messages" title="Messages" count={messages.length}>
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
        </Section>
      )}

      <div className="group actions-row">
        <button className="danger" onClick={remove}>
          Delete relationship
        </button>
      </div>
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
    <Section id="object:trace" title="Trace" className="trace">
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
    </Section>
  );
}

function OccursOn({ id, state }: { id: Id; state: ModelState }) {
  const openTab = useWorkbench((s) => s.openTab);
  const diagrams = [...new Set(state.objectOccurrences.find("byObject", id).map((o) => o.diagramId))]
    .map((d) => state.diagrams.get(d))
    .filter((d) => d !== undefined)
    .sort(byName);
  return (
    <Section id="object:occurs" title="Occurs on" count={diagrams.length}>
      <ul className="plain">
        {diagrams.map((d) => (
          <li key={d.id}>
            <button className="link" onClick={() => openTab({ kind: "diagram", id: d.id })}>
              ⧉ {d.name}
            </button>
          </li>
        ))}
      </ul>
      {diagrams.length === 0 && <p className="muted">Not on any diagram yet.</p>}
    </Section>
  );
}

function FolderProperties({ id }: { id: Id }) {
  const { state } = useModel();
  const edit = useWorkbench((s) => s.edit);
  const folder = state.folders.get(id);
  if (!folder) return <p className="muted pad">This folder was deleted.</p>;
  return (
    <div className="props">
      <InspectorHeader
        name={folder.name}
        onRename={(name) => edit(`Rename folder ${folder.name} to ${name}`, [{ edit: "renameFolder", id, name }])}
        type="Folder"
        path={folderPath(state, folder.parentId).join(" / ") || "Top level"}
      />
      <Section id="folder:contents" title="Contents">
        <p className="muted">
          {state.folders.count("byParent", id)} folders · {state.objects.count("byFolder", id)} objects ·{" "}
          {state.diagrams.count("byFolder", id)} diagrams
        </p>
      </Section>
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
      <InspectorHeader
        name={diagram.name}
        onRename={(name) =>
          edit(`Rename diagram ${diagram.name} to ${name}`, [
            { edit: "updateDiagram", id, baseVersion: diagram.version, set: { name } },
          ])
        }
        type={metamodel.diagramType(diagram.diagramType)?.definition.name ?? diagram.diagramType}
        path={folderPath(state, diagram.folderId).join(" / ")}
        description={diagram.description}
        onDescribe={(description) =>
          edit(description ? `Describe ${diagram.name}` : `Clear the description of ${diagram.name}`, [
            { edit: "updateDiagram", id, baseVersion: diagram.version, set: { description } },
          ])
        }
      />
      <Section id="diagram:contents" title="Contents">
        <p className="muted">
          {state.objectOccurrences.count("byDiagram", id)} shapes ·{" "}
          {state.relationshipOccurrences.count("byDiagram", id)} lines
        </p>
      </Section>
    </div>
  );
}
