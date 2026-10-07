// The Properties window (design/04-ux/workbench.md "Properties panel"): the generic inspector (Inspector.tsx) filled
// for each kind of selection: header, property sets and groups, tags. Every edit is one change, shown at once.
import { useState } from "react";
import type { ModelState, Metamodel, RelationshipRow } from "@connectome/engine";
import { LEVEL_PROPERTY, type Id } from "@connectome/model";
import { useModel, useWorkbench } from "../state/workbench";
import { confirmationOf, fieldGroups, mySet, toggleInSet } from "../inspector";
import {
  InspectorHeader,
  InspectorToolbar,
  PropertyGroups,
  Section,
  TextField,
  usePanelPrefs,
  type GridContext,
  type SetPicker,
} from "./Inspector";
import { RelationsSections } from "./Relations";
import { addPayloadPlan, messagePlan, messagesOf, payloadChoices } from "../semantics";
import { folderPath } from "../text";

/** The Properties tab of the Properties window: the selection's inspector. */
export function PropertiesTabContent() {
  useModel();
  const selection = useWorkbench((s) => s.selection);
  return (
    <>
      {!selection && <p className="muted pad">Select something in the explorer to see its properties.</p>}
      {selection?.kind === "object" && <ObjectProperties id={selection.id} />}
      {selection?.kind === "folder" && <FolderProperties id={selection.id} />}
      {selection?.kind === "diagram" && <DiagramProperties id={selection.id} />}
      {selection?.kind === "relationship" && <RelationshipProperties id={selection.id} />}
    </>
  );
}

/** An object's inspector; `withRelations` adds the Relations window's views as sections (the object page). */
export function ObjectProperties({ id, withRelations = false }: { id: Id; withRelations?: boolean }) {
  const { state, metamodel } = useModel();
  const edit = useWorkbench((s) => s.edit);
  const prefs = usePanelPrefs();
  const [filter, setFilter] = useState("");
  const [editingSet, setEditingSet] = useState<string | null>(null);
  const object = state.objects.get(id);
  if (!object) return <p className="muted pad">This object was deleted.</p>;
  const type = metamodel.objectType(object.type);
  const shared = type?.propertySets ?? [];
  const mine = prefs.mySets[object.type] ?? [];
  const chosenKey = prefs.chosenSets[object.type] ?? "";
  const chosen = [...shared, ...mine].find((x) => x.key === chosenKey);
  const editing = editingSet ? mine.find((x) => x.key === editingSet) : undefined;
  const { groups, hidden } = fieldGroups(metamodel, type?.properties ?? [], object.properties, {
    filter,
    hideEmpty: prefs.hideEmpty && !editing,
    set: editing ? undefined : chosen,
  });
  const sets: SetPicker = {
    shared,
    mine,
    chosen: chosen?.key ?? "",
    editing: editing?.key ?? null,
    onChoose: (key) => prefs.chooseSet(object.type, key),
    onSaveAs: (name) => {
      // The new set holds what is shown now: the chosen set's properties, or every property.
      const shown = chosen ? chosen.properties : [...(type?.properties ?? [])];
      const created = mySet(name, shown);
      prefs.saveMySet(object.type, created);
      prefs.chooseSet(object.type, created.key);
    },
    onEdit: setEditingSet,
    onDelete: (key) => prefs.deleteMySet(object.type, key),
  };
  const levelList = metamodel.valueList("semanticLevel");
  const typeLevel = type?.level && levelList?.values.find((v) => v.key === type.level)?.label;
  const ctx: GridContext = {
    state,
    metamodel,
    itemId: id,
    // The level falls back to the type's default, and a type can fix it (semantics.md §4.2).
    placeholder: (f) => (f.pt.key === LEVEL_PROPERTY && typeLevel ? `${typeLevel} (type default)` : undefined),
    readOnly: (f) => f.pt.key === LEVEL_PROPERTY && (type?.levelFixed ?? false),
    // While reviewing, a value set is a value confirmed: one change, one undo.
    commit: (f, value) =>
      edit(`Set ${f.pt.name} of ${object.name}`, [
        { edit: "setProperties", id, baseVersion: object.version, set: { [f.pt.key]: value } },
        ...(prefs.review
          ? [{ edit: "confirmProperties" as const, id, baseVersion: object.version, keys: [f.pt.key] }]
          : []),
      ]),
  };
  const now = new Date().toISOString();
  const confirm = (keys: string[]) =>
    keys.length > 0 &&
    edit(
      keys.length === 1
        ? `Confirm ${metamodel.propertyType(keys[0]!)?.name ?? keys[0]} of ${object.name}`
        : `Confirm ${keys.length} values of ${object.name}`,
      [{ edit: "confirmProperties", id, baseVersion: object.version, keys }],
    );
  const shownFields = groups.flatMap((g) => g.fields).filter((f) => f.editor !== "calculated" && !ctx.readOnly?.(f));
  const due = shownFields.filter((f) => confirmationOf(object, f.pt.key, now).state !== "current");
  if (prefs.review && !editing)
    ctx.review = {
      now,
      info: (f) => confirmationOf(object, f.pt.key, now),
      confirm: (f) => confirm([f.pt.key]),
    };
  if (editing)
    ctx.picking = {
      has: (key) => editing.properties.includes(key),
      toggle: (key) => prefs.saveMySet(object.type, toggleInSet(editing, key)),
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
          ...["tags", ...(withRelations ? ["relationships", "trace", "occurs"] : [])].map((s) => `object:${s}`),
        ]}
        sets={sets}
        review={{
          on: prefs.review && !editing,
          due: due.length,
          toggle: () => prefs.setReview(!prefs.review),
          confirmAll: () => confirm(due.map((f) => f.pt.key)),
        }}
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
          {withRelations && <RelationsSections object={object} />}
        </>
      )}
    </div>
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
