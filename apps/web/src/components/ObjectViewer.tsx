// The object viewer (design/04-ux/workbench.md "Object viewer"): right-click a folder › Object viewer lists its
// subfolders, objects and their contents as a tree, the way the explorer shows them. Names and the property columns the
// user picked are edited in the cells; quick add creates objects one after another in the folder or object selected
// in the list (inside an object: a content, held by a containment rule); selected rows are deleted together. Every
// edit is an ordinary change.
import { useRef, useState, type FormEvent, type RefObject } from "react";
import type { Edit, Id, PropertyType, PropertyValue } from "@connectome/model";
import type { ObjectRow } from "@connectome/engine";
import { useModel, useWorkbench } from "../state/workbench";
import { folderPath } from "../text";
import { displayValue } from "../inspector";
import { notationFor } from "../notation";
import {
  MAX_PROPERTY_COLUMNS,
  addChoices,
  addEdits,
  columnChoices,
  defaultChildType,
  editableInList,
  objectsUnder,
  parseCell,
  targetChain,
  viewerColumns,
  viewerTree,
  type AddTarget,
  type ViewerRow,
} from "../object-viewer";
import { usePanelPrefs } from "./Inspector";
import { FolderIcon } from "./ExplorerIcon";
import { Glyph } from "./Glyph";

export function ObjectViewer({ folderId }: { folderId: Id }) {
  const { state, metamodel } = useModel();
  const edit = useWorkbench((s) => s.edit);
  const select = useWorkbench((s) => s.select);
  const askDeleteObject = useWorkbench((s) => s.askDeleteObject);
  const chosenColumns = usePanelPrefs((s) => s.viewerColumns);
  const setChosenColumns = usePanelPrefs((s) => s.setViewerColumns);
  const [type, setType] = useState("");
  const [filter, setFilter] = useState("");
  const [picked, setPicked] = useState<ReadonlySet<Id>>(new Set());
  const [collapsed, setCollapsed] = useState<ReadonlySet<Id>>(new Set());
  const [target, setTarget] = useState<AddTarget>({ kind: "folder", id: folderId });
  const nameBox = useRef<HTMLInputElement>(null);
  const folder = state.folders.get(folderId);
  if (!folder) return <p className="muted pad">This folder no longer exists.</p>;

  // A deleted target falls back to the viewed folder.
  const liveTarget: AddTarget =
    target.id !== folderId && !(target.kind === "folder" ? state.folders.get(target.id) : state.objects.get(target.id))
      ? { kind: "folder", id: folderId }
      : target;
  const all = objectsUnder(state, metamodel, folderId);
  const query = filter.trim().toLocaleLowerCase();
  const filtering = !!query || !!type;
  // Filtering shows the matching objects as a flat list with their folder; otherwise the tree.
  const rows: ViewerRow[] = filtering
    ? all.filter(
        (r) =>
          r.kind === "object" &&
          (!type || r.object.type === type) &&
          (!query || r.name.toLocaleLowerCase().includes(query)),
      )
    : viewerTree(state, metamodel, folderId, collapsed);
  const objectRows = rows.filter((r): r is Extract<ViewerRow, { kind: "object" }> => r.kind === "object");
  const allTypes = all.flatMap((r) => (r.kind === "object" ? [r.object.type] : []));
  const columns = viewerColumns(metamodel, chosenColumns);
  const presentTypes = [...new Set(allTypes)]
    .map((t) => metamodel.objectType(t))
    .filter((t) => !!t)
    .sort((a, b) => a.definition.name.localeCompare(b.definition.name));
  const shownPicked = objectRows.filter((r) => picked.has(r.id)).map((r) => r.object);
  const togglePick = (id: Id) =>
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleOpen = (id: Id) =>
    setCollapsed((c) => {
      const next = new Set(c);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const choose = (row: ViewerRow) => {
    setTarget({ kind: row.kind, id: row.id });
    select({ kind: row.kind, id: row.id });
  };
  const addInside = (row: ViewerRow) => {
    choose(row);
    nameBox.current?.focus();
  };
  const added = (at: AddTarget) =>
    setCollapsed((c) => {
      const open = new Set(targetChain(state, metamodel, at, folderId));
      return new Set([...c].filter((id) => !open.has(id)));
    });

  const deletePicked = () => {
    const edits: Edit[] = shownPicked.map((o) => ({ edit: "deleteObject", id: o.id, baseVersion: o.version }));
    const label = shownPicked.length === 1 ? `Delete ${shownPicked[0]!.name}` : `Delete ${shownPicked.length} objects`;
    if (edits.length && edit(label, edits)) setPicked(new Set());
  };

  return (
    <div className="object-viewer">
      <header className="ov-header">
        <h2>
          Objects in <span className="muted">{folderPath(state, folderId).join(" / ")}</span>
        </h2>
        <div className="ov-tools">
          <input
            className="filter"
            placeholder="Filter by name"
            aria-label="Filter objects"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <select aria-label="Object type filter" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All types</option>
            {presentTypes.map((t) => (
              <option key={t.definition.key} value={t.definition.key}>
                {t.definition.name}
              </option>
            ))}
          </select>
          <ColumnPicker
            choices={columnChoices(metamodel, allTypes)}
            chosen={chosenColumns}
            onChange={setChosenColumns}
          />
          <span className="spacer" />
          <span className="muted">
            {objectRows.length} of {all.length}
          </span>
          <button className="danger" disabled={shownPicked.length === 0} onClick={deletePicked}>
            Delete selected{shownPicked.length ? ` (${shownPicked.length})` : ""}
          </button>
        </div>
      </header>
      <AddRow
        viewed={folderId}
        target={liveTarget}
        nameBox={nameBox}
        defaultType={type}
        onReset={() => setTarget({ kind: "folder", id: folderId })}
        onAdded={added}
      />
      <table className="ov-table" aria-label="Objects">
        <thead>
          <tr>
            <th className="pick">
              <input
                type="checkbox"
                aria-label="Select all shown"
                checked={objectRows.length > 0 && shownPicked.length === objectRows.length}
                onChange={(e) => setPicked(new Set(e.target.checked ? objectRows.map((r) => r.id) : []))}
              />
            </th>
            <th>Name</th>
            <th>Type</th>
            {filtering && <th>Folder</th>}
            {columns.map((pt) => (
              <th key={pt.key} title={pt.help}>
                {pt.name}
              </th>
            ))}
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              data-kind={row.kind}
              data-name={row.name}
              className={liveTarget.id === row.id ? "target" : undefined}
              onClick={() => choose(row)}
            >
              <td className="pick">
                {row.kind === "object" && (
                  <input
                    type="checkbox"
                    aria-label={`Select ${row.name}`}
                    checked={picked.has(row.id)}
                    onChange={() => togglePick(row.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
              </td>
              <td>
                <span className="ov-name" style={{ paddingLeft: row.depth * 16 }}>
                  <button
                    className="twisty link"
                    tabIndex={-1}
                    aria-label={row.hasChildren ? `${collapsed.has(row.id) ? "Open" : "Close"} ${row.name}` : undefined}
                    disabled={!row.hasChildren}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleOpen(row.id);
                    }}
                  >
                    {row.hasChildren ? (collapsed.has(row.id) ? "▸" : "▾") : ""}
                  </button>
                  {row.kind === "folder" ? (
                    <FolderIcon />
                  ) : (
                    <Glyph
                      glyph={notationFor(metamodel.objectType(row.object.type)).glyph}
                      colour={notationFor(metamodel.objectType(row.object.type)).ink}
                    />
                  )}
                  <CellInput
                    label={`Name of ${row.name}`}
                    value={row.name}
                    onCommit={(name) =>
                      !!name &&
                      edit(
                        `Rename ${row.name} to ${name}`,
                        row.kind === "folder"
                          ? [{ edit: "renameFolder", id: row.id, name }]
                          : [{ edit: "renameObject", id: row.id, baseVersion: row.object.version, name }],
                      )
                    }
                  />
                </span>
              </td>
              <td className="ov-type">
                {row.kind === "folder" ? "Folder" : (metamodel.objectType(row.object.type)?.definition.name ?? "")}
              </td>
              {filtering && <td className="muted">{row.path}</td>}
              {columns.map((pt) => (
                <td key={pt.key}>
                  {row.kind === "object" && metamodel.objectType(row.object.type)?.properties.has(pt.key) && (
                    <PropertyCell object={row.object} pt={pt} />
                  )}
                </td>
              ))}
              <td className="ov-actions">
                <button
                  className="link"
                  aria-label={`Add inside ${row.name}`}
                  title={`Add inside ${row.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    addInside(row);
                  }}
                >
                  +
                </button>
                {row.kind === "object" && (
                  <button
                    className="link"
                    aria-label={`Delete ${row.name}`}
                    title="Delete…"
                    onClick={(e) => {
                      e.stopPropagation();
                      askDeleteObject(row.id);
                    }}
                  >
                    ×
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <p className="muted pad">{filtering ? "Nothing matches the filter." : "Nothing here yet: add one above."}</p>
      )}
    </div>
  );
}

/**
 * The quick-add row: where new objects go (the folder or object selected in the list), a type and a name. Enter adds
 * the object and keeps the box open for the next one. Inside an object only the types its containment rules allow
 * are offered.
 */
function AddRow(props: {
  viewed: Id;
  target: AddTarget;
  nameBox: RefObject<HTMLInputElement | null>;
  defaultType: string;
  onReset(): void;
  onAdded(target: AddTarget): void;
}) {
  const { state, metamodel } = useModel();
  const edit = useWorkbench((s) => s.edit);
  const notify = useWorkbench((s) => s.notify);
  const { target } = props;
  const choices = addChoices(state, metamodel, target);
  // The type picked last for each target, so moving between targets keeps each one's choice.
  const [picked, setPicked] = useState<Record<string, string>>({});
  const preferred =
    target.kind === "object"
      ? defaultChildType(state, metamodel, target.id, choices)
      : props.defaultType || choices[0]?.type.definition.key;
  const wanted = picked[target.id] ?? preferred ?? "";
  const choice = choices.find((c) => c.type.definition.key === wanted) ?? choices[0];
  const [name, setName] = useState("");
  const into =
    target.kind === "folder" ? state.folders.get(target.id) : (state.objects.get(target.id) as ObjectRow | undefined);
  const parentType = target.kind === "object" ? metamodel.objectType((into as ObjectRow).type) : undefined;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || !choice) return;
    const plan = addEdits(state, target, choice, trimmed);
    if ("error" in plan) return notify(plan.error, "error");
    if (edit(plan.label, plan.edits)) {
      setName("");
      props.onAdded(target);
    }
  };
  return (
    <form className="ov-add" onSubmit={submit}>
      <span className="ov-into" aria-label="Add to">
        {target.kind === "object" ? "Add inside" : "Add to"} <strong>{into?.name}</strong>
        {target.id !== props.viewed && (
          <button
            type="button"
            className="link"
            aria-label={`Add to ${state.folders.get(props.viewed)?.name ?? "the folder"} instead`}
            title="Add to the viewed folder instead"
            onClick={props.onReset}
          >
            ×
          </button>
        )}
      </span>
      {choices.length === 0 ? (
        <span className="muted">
          No containment rule lets anything sit inside a {parentType?.definition.name ?? "this type"}.
        </span>
      ) : (
        <>
          <select
            aria-label="New object type"
            value={choice?.type.definition.key ?? ""}
            onChange={(e) => setPicked((p) => ({ ...p, [target.id]: e.target.value }))}
          >
            {choices.map((c) => (
              <option key={c.type.definition.key} value={c.type.definition.key}>
                {c.type.definition.name}
              </option>
            ))}
          </select>
          <input
            ref={props.nameBox}
            aria-label="New object name"
            placeholder="Name, then Enter to add another"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" className="primary" disabled={!name.trim()}>
            Add
          </button>
        </>
      )}
    </form>
  );
}

/** The property columns, picked from what the listed types carry; remembered in this browser. */
function ColumnPicker(props: { choices: PropertyType[]; chosen: string[]; onChange(keys: string[]): void }) {
  const chosen = new Set(props.chosen);
  const full = props.chosen.length >= MAX_PROPERTY_COLUMNS;
  return (
    <details className="ov-columns">
      <summary>Columns{props.chosen.length ? ` (${props.chosen.length})` : ""}</summary>
      <fieldset aria-label="Property columns">
        <p className="muted">Up to {MAX_PROPERTY_COLUMNS} properties to edit in the list.</p>
        {props.choices.length === 0 && <p className="muted">The listed objects carry no properties.</p>}
        {props.choices.map((pt) => (
          <label key={pt.key} className="check">
            <input
              type="checkbox"
              checked={chosen.has(pt.key)}
              disabled={full && !chosen.has(pt.key)}
              onChange={(e) =>
                props.onChange(e.target.checked ? [...props.chosen, pt.key] : props.chosen.filter((k) => k !== pt.key))
              }
            />
            {pt.name}
          </label>
        ))}
      </fieldset>
    </details>
  );
}

/** A text box that commits on Enter or when it loses focus, and puts the value back on Escape or refusal. */
function CellInput(props: { label: string; value: string; type?: string; onCommit(value: string): boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const value = draft.trim();
    setDraft(null);
    if (value !== props.value) props.onCommit(value);
  };
  return (
    <input
      className="ov-cell"
      type={props.type ?? "text"}
      aria-label={props.label}
      value={draft ?? props.value}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        else if (e.key === "Escape") {
          setDraft(null);
          e.currentTarget.blur();
        }
      }}
    />
  );
}

/** One property value: edited in place for simple data types, shown as text otherwise. */
function PropertyCell({ object, pt }: { object: ObjectRow; pt: PropertyType }) {
  const { metamodel } = useModel();
  const edit = useWorkbench((s) => s.edit);
  const notify = useWorkbench((s) => s.notify);
  const value = object.properties[pt.key] as PropertyValue | undefined;
  const list = pt.valueList ? metamodel.valueList(pt.valueList) : undefined;
  const label = `${pt.name} of ${object.name}`;
  const set = (next: PropertyValue | null) =>
    edit(`Set ${pt.name} of ${object.name}`, [
      { edit: "setProperties", id: object.id, baseVersion: object.version, set: { [pt.key]: next } },
    ]);
  if (!editableInList(pt)) return <span className="muted">{displayValue(value, list)}</span>;
  if (pt.dataType === "boolean")
    return (
      <input type="checkbox" aria-label={label} checked={value === true} onChange={(e) => set(e.target.checked)} />
    );
  if (pt.dataType === "list")
    return (
      <select
        aria-label={label}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => set(e.target.value || null)}
      >
        <option value="" />
        {(list?.values ?? []).map((v) => (
          <option key={v.key} value={v.key}>
            {v.label}
          </option>
        ))}
      </select>
    );
  return (
    <CellInput
      label={label}
      type={pt.dataType === "date" ? "date" : pt.dataType === "number" ? "number" : "text"}
      value={value === undefined || value === null ? "" : String(value)}
      onCommit={(text) => {
        const parsed = parseCell(pt, text);
        if (parsed === undefined) {
          notify(`${pt.name} must be a number`, "error");
          return false;
        }
        return set(parsed);
      }}
    />
  );
}
