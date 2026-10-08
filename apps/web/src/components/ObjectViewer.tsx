// The object viewer (design/04-ux/workbench.md "Object viewer"): right-click a folder › Object viewer lists the
// objects stored in it and its subfolders. Names and simple properties are edited in the cells, new objects are added
// from the top row one after another, and selected rows are deleted together; every edit is an ordinary change.
import { useState, type FormEvent } from "react";
import { ulid, type Edit, type Id, type PropertyType, type PropertyValue } from "@connectome/model";
import type { ObjectRow } from "@connectome/engine";
import { useModel, useWorkbench } from "../state/workbench";
import { folderPath } from "../text";
import { displayValue } from "../inspector";
import { notationFor } from "../notation";
import { editableInList, objectsUnder, parseCell, viewerColumns } from "../object-viewer";
import { Glyph } from "./Glyph";

export function ObjectViewer({ folderId }: { folderId: Id }) {
  const { state, metamodel } = useModel();
  const edit = useWorkbench((s) => s.edit);
  const select = useWorkbench((s) => s.select);
  const askDeleteObject = useWorkbench((s) => s.askDeleteObject);
  const [deep, setDeep] = useState(true);
  const [type, setType] = useState("");
  const [filter, setFilter] = useState("");
  const [picked, setPicked] = useState<ReadonlySet<Id>>(new Set());
  const folder = state.folders.get(folderId);
  if (!folder) return <p className="muted pad">This folder no longer exists.</p>;

  const all = objectsUnder(state, folderId, deep);
  const query = filter.trim().toLocaleLowerCase();
  const rows = all.filter(
    (r) => (!type || r.object.type === type) && (!query || r.object.name.toLocaleLowerCase().includes(query)),
  );
  const columns = viewerColumns(
    metamodel,
    rows.map((r) => r.object.type),
  );
  const presentTypes = [...new Set(all.map((r) => r.object.type))]
    .map((t) => metamodel.objectType(t))
    .filter((t) => !!t)
    .sort((a, b) => a.definition.name.localeCompare(b.definition.name));
  const shownPicked = rows.filter((r) => picked.has(r.object.id)).map((r) => r.object);
  const togglePick = (id: Id) =>
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
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
          <label className="check">
            <input type="checkbox" checked={deep} onChange={(e) => setDeep(e.target.checked)} />
            Include subfolders
          </label>
          <span className="spacer" />
          <span className="muted">
            {rows.length} of {all.length}
          </span>
          <button className="danger" disabled={shownPicked.length === 0} onClick={deletePicked}>
            Delete selected{shownPicked.length ? ` (${shownPicked.length})` : ""}
          </button>
        </div>
      </header>
      <AddRow folderId={folderId} defaultType={type} />
      <table className="ov-table" aria-label="Objects">
        <thead>
          <tr>
            <th className="pick">
              <input
                type="checkbox"
                aria-label="Select all shown"
                checked={rows.length > 0 && shownPicked.length === rows.length}
                onChange={(e) => setPicked(new Set(e.target.checked ? rows.map((r) => r.object.id) : []))}
              />
            </th>
            <th>Name</th>
            <th>Type</th>
            {deep && <th>Folder</th>}
            {columns.map((pt) => (
              <th key={pt.key} title={pt.help}>
                {pt.name}
              </th>
            ))}
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {rows.map(({ object, path }) => {
            const notation = notationFor(metamodel.objectType(object.type));
            return (
              <tr key={object.id} data-object={object.name} onClick={() => select({ kind: "object", id: object.id })}>
                <td className="pick">
                  <input
                    type="checkbox"
                    aria-label={`Select ${object.name}`}
                    checked={picked.has(object.id)}
                    onChange={() => togglePick(object.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </td>
                <td>
                  <CellInput
                    label={`Name of ${object.name}`}
                    value={object.name}
                    onCommit={(name) =>
                      !!name &&
                      edit(`Rename ${object.name} to ${name}`, [
                        { edit: "renameObject", id: object.id, baseVersion: object.version, name },
                      ])
                    }
                  />
                </td>
                <td className="ov-type">
                  <Glyph glyph={notation.glyph} colour={notation.ink} />{" "}
                  {metamodel.objectType(object.type)?.definition.name ?? object.type}
                </td>
                {deep && <td className="muted">{path}</td>}
                {columns.map((pt) => (
                  <td key={pt.key}>
                    <PropertyCell object={object} pt={pt} />
                  </td>
                ))}
                <td>
                  <button
                    className="link"
                    aria-label={`Delete ${object.name}`}
                    title="Delete…"
                    onClick={(e) => {
                      e.stopPropagation();
                      askDeleteObject(object.id);
                    }}
                  >
                    ×
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && <p className="muted pad">No objects here yet: add one above.</p>}
    </div>
  );
}

/** The top row: a type and a name; Enter adds the object and keeps the box open for the next one. */
function AddRow({ folderId, defaultType }: { folderId: Id; defaultType: string }) {
  const { metamodel } = useModel();
  const edit = useWorkbench((s) => s.edit);
  const types = metamodel
    .allObjectTypes()
    .filter((t) => !t.definition.abstract)
    .sort((a, b) => a.definition.name.localeCompare(b.definition.name));
  const [chosen, setChosen] = useState("");
  const type = chosen || defaultType || types[0]?.definition.key || "";
  const [name, setName] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || !type) return;
    if (edit(`Create ${trimmed}`, [{ edit: "createObject", id: ulid(), type, name: trimmed, folderId }])) setName("");
  };
  return (
    <form className="ov-add" onSubmit={submit}>
      <select aria-label="New object type" value={type} onChange={(e) => setChosen(e.target.value)}>
        {types.map((t) => (
          <option key={t.definition.key} value={t.definition.key}>
            {t.definition.name}
          </option>
        ))}
      </select>
      <input
        aria-label="New object name"
        placeholder="Name, then Enter to add another"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button type="submit" className="primary" disabled={!name.trim()}>
        Add
      </button>
    </form>
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
