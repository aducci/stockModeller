// The Properties window (design/04-ux/workbench.md "Properties panel"): the generic inspector (Inspector.tsx) filled
// for each kind of selection: header, property sets and groups, tags. Every edit is one change, shown at once.
import { useMemo, useState } from "react";
import {
  possibleDuplicates,
  type ModelState,
  type Metamodel,
  type ObjectRow,
  type RelationshipRow,
} from "@connectome/engine";
import { LEVEL_PROPERTY, SUBJECT_KEY, type Id, type PropertyValue } from "@connectome/model";
import { useModel, useWorkbench } from "../state/workbench";
import { confirmationOf, fieldGroups, mySet, strandedValues, toggleInSet } from "../inspector";
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
import { KIND_GLYPH, KIND_NAME, documentsLinking, kindOfType, sequenceType } from "../views";
import { sequenceForInteractionEdits } from "../sequence";
import { notDuplicatesEdits, parseNames, percent } from "../duplicates";

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
          ...["tags", "aliases", "duplicates", ...(withRelations ? ["relationships", "trace", "occurs"] : [])].map(
            (s) => `object:${s}`,
          ),
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
        <StrandedSection
          id={`${prefix}:stranded`}
          values={object.properties}
          carried={type?.properties ?? new Set()}
          onClear={(key, name) =>
            edit(`Clear ${name} of ${object.name}`, [
              { edit: "setProperties", id, baseVersion: object.version, set: { [key]: null } },
            ])
          }
        />
      )}

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
          <Section id="object:aliases" title="Also known as" count={object.aliases?.length || undefined}>
            <TextField
              label="Also known as"
              className="value"
              placeholder="Abbreviations, former names, separated by commas"
              value={(object.aliases ?? []).join(", ")}
              onCommit={(text) =>
                edit(`Set other names of ${object.name}`, [
                  { edit: "setAliases", id, baseVersion: object.version, aliases: parseNames(text) },
                ])
              }
            />
          </Section>
          <DuplicatesSection object={object} />
          {withRelations && <RelationsSections object={object} />}
        </>
      )}
    </div>
  );
}

/** Objects this one may duplicate (duplicates-and-identity.md §6); shown only when there are some. */
function DuplicatesSection({ object }: { object: ObjectRow }) {
  const { state, metamodel } = useModel();
  const edit = useWorkbench((s) => s.edit);
  const select = useWorkbench((s) => s.select);
  const revision = useWorkbench((s) => s.revision);
  const pairs = useMemo(
    () => possibleDuplicates(state, metamodel, { objectId: object.id }),
    [state, metamodel, object.id, revision],
  );
  if (pairs.length === 0) return null;
  return (
    <Section id="object:duplicates" title="Possible duplicates" count={pairs.length} className="duplicates">
      <ul className="dup-list" aria-label="Possible duplicates">
        {pairs.map((p) => {
          const other = p.a.id === object.id ? p.b : p.a;
          return (
            <li key={other.id}>
              <button className="link" onClick={() => select({ kind: "object", id: other.id })}>
                {other.name}
              </button>{" "}
              <span className="muted">
                {metamodel.objectType(other.type)?.definition.name ?? other.type} · {percent(p.score)}
              </span>
              <div className="muted small">{p.reasons.join(". ")}</div>
              <button
                className="small"
                onClick={() =>
                  edit(`${object.name} and ${other.name} are not duplicates`, notDuplicatesEdits(object, other))
                }
              >
                Not duplicates
              </button>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

/** A relationship: its two ends, what it carries, an interaction's messages (semantics.md §5–§6). */
function RelationshipProperties({ id }: { id: Id }) {
  const { state, metamodel } = useModel();
  const edit = useWorkbench((s) => s.edit);
  const select = useWorkbench((s) => s.select);
  const notify = useWorkbench((s) => s.notify);
  const openTab = useWorkbench((s) => s.openTab);
  const relationship = state.relationships.get(id);
  if (!relationship) return <p className="muted pad">This relationship was deleted.</p>;
  const type = metamodel.relationshipType(relationship.type);
  const name = (objectId: Id) => state.objects.get(objectId)?.name ?? "(deleted)";
  const parent = relationship.parentId ? state.relationships.get(relationship.parentId) : undefined;
  const messages = type?.semantic === "interaction" ? messagesOf(state, relationship) : [];
  const sequence = type?.semantic === "interaction" ? sequenceType(metamodel) : undefined;
  const carried = metamodel.relationshipTypeProperties(relationship.type);
  const { groups } = fieldGroups(metamodel, carried, relationship.properties);
  const title = `${name(relationship.sourceId)} ${type?.verb ?? relationship.type} ${name(relationship.targetId)}`;
  const setValue = (key: string, label: string, value: PropertyValue | null) =>
    edit(label, [{ edit: "setRelationshipProperties", id, baseVersion: relationship.version, set: { [key]: value } }]);
  const ctx: GridContext = {
    state,
    metamodel,
    itemId: id,
    commit: (f, value) => setValue(f.pt.key, `Set ${f.pt.name} of ${title}`, value),
  };
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
        name={title}
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

      <PropertyGroups groups={groups} ctx={ctx} prefix={`relationship:${relationship.type}`} />
      <StrandedSection
        id={`relationship:${relationship.type}:stranded`}
        values={relationship.properties}
        carried={carried}
        onClear={(key, label) => setValue(key, `Clear ${label} of ${title}`, null)}
      />

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
            {sequence && (
              <button
                onClick={() => {
                  const source = state.objects.get(relationship.sourceId);
                  const plan = sequenceForInteractionEdits(
                    state,
                    metamodel,
                    id,
                    sequence.definition.key,
                    source?.folderId ?? "",
                  );
                  if ("error" in plan) return notify(plan.error, "error");
                  const diagramId = (plan.edits[0] as { id: Id }).id;
                  if (edit(`Create ${plan.name}`, plan.edits)) {
                    select({ kind: "diagram", id: diagramId });
                    openTab({ kind: "diagram", id: diagramId });
                  }
                }}
              >
                New sequence
              </button>
            )}
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
  const carried = metamodel.diagramType(diagram.diagramType)?.properties ?? new Set<string>();
  const values = diagram.properties ?? {};
  const { groups } = fieldGroups(metamodel, carried, values);
  const setValue = (key: string, label: string, value: PropertyValue | null) =>
    edit(label, [{ edit: "setDiagramProperties", id, baseVersion: diagram.version, set: { [key]: value } }]);
  const ctx: GridContext = {
    state,
    metamodel,
    itemId: id,
    commit: (f, value) => setValue(f.pt.key, `Set ${f.pt.name} of ${diagram.name}`, value),
  };
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
      <ViewSection id={id} />
      <PropertyGroups groups={groups} ctx={ctx} prefix={`diagram:${diagram.diagramType}`} />
      <StrandedSection
        id={`diagram:${diagram.diagramType}:stranded`}
        values={values}
        carried={carried}
        onClear={(key, label) => setValue(key, `Clear ${label} of ${diagram.name}`, null)}
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

/** What kind of view a diagram is, what it is about and which documents it is part of (views in the app, U-1). */
function ViewSection({ id }: { id: Id }) {
  const { state, metamodel } = useModel();
  const edit = useWorkbench((s) => s.edit);
  const select = useWorkbench((s) => s.select);
  const openTab = useWorkbench((s) => s.openTab);
  const diagram = state.diagrams.get(id)!;
  const type = metamodel.diagramType(diagram.diagramType);
  const kind = kindOfType(type);
  const own = diagram.definition ?? {};
  const subjectId = own[SUBJECT_KEY];
  const subject = typeof subjectId === "string" ? state.objects.getAny(subjectId) : undefined;
  const partOf = documentsLinking(state, metamodel, id);
  const open = (target: Id) => {
    select({ kind: "diagram", id: target });
    openTab({ kind: "diagram", id: target });
  };
  const customised = kind === "matrix" ? Object.keys(own).length : 0;
  return (
    <Section id="diagram:view" title="View">
      <dl className="view-facts">
        <dt>Kind</dt>
        <dd>
          <span aria-hidden>{KIND_GLYPH[kind]}</span> {KIND_NAME[kind]}
        </dd>
        <dt>Type</dt>
        <dd>{type?.definition.name ?? diagram.diagramType}</dd>
        {kind === "document" && (
          <>
            <dt>About</dt>
            <dd>
              {subject ? (
                <button className="link" onClick={() => select({ kind: "object", id: subject.id })}>
                  {subject.name}
                  {subject.deleted ? " (deleted)" : ""}
                </button>
              ) : (
                <span className="muted">Nothing yet</span>
              )}
            </dd>
          </>
        )}
        {partOf.length > 0 && (
          <>
            <dt>Part of</dt>
            <dd>
              {partOf.map((d) => (
                <button key={d.id} className="link" onClick={() => open(d.id)}>
                  {KIND_GLYPH.document} {d.name}
                </button>
              ))}
            </dd>
          </>
        )}
      </dl>
      {kind === "matrix" && (
        <p className="muted small">
          {customised ? "Rows, columns or relationships differ from the type. " : "Shows what its type defines. "}
          {customised > 0 && (
            <button
              className="link"
              onClick={() =>
                edit(`Reset ${diagram.name} to its type`, [
                  {
                    edit: "setViewDefinition",
                    diagramId: id,
                    baseVersion: diagram.version,
                    set: Object.fromEntries(Object.keys(own).map((k) => [k, null])),
                  },
                ])
              }
            >
              Reset to the type
            </button>
          )}
        </p>
      )}
    </Section>
  );
}

/** Values the item's type no longer carries (a metamodel publish keeps them): listed so they can be cleared. */
function StrandedSection(props: {
  id: string;
  values: Readonly<Record<string, PropertyValue>>;
  carried: ReadonlySet<string>;
  onClear(key: string, name: string): void;
}) {
  const { metamodel } = useModel();
  const stranded = strandedValues(metamodel, props.carried, props.values);
  if (stranded.length === 0) return null;
  return (
    <Section id={props.id} title="Not on this type" count={stranded.length} className="stranded">
      <p className="muted small">The metamodel no longer gives this type these properties. Their values are kept.</p>
      <ul className="plain stranded-values">
        {stranded.map((v) => (
          <li key={v.key}>
            <span className="name">{v.name}</span>
            <span className="value">{v.display}</span>
            <button className="link" aria-label={`Clear ${v.name}`} onClick={() => props.onClear(v.key, v.name)}>
              Clear
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}
