// The explorer's Folders tab (design/04-ux/workbench.md): everything as stored, with a filter. The Types,
// Hierarchies and Queries tabs arrive in M1.
import { useState, type FormEvent, type KeyboardEvent } from "react";
import { ulid, type Id } from "@connectome/model";
import { useAuth } from "../state/auth";
import { useModel, useWorkbench, type Selection } from "../state/workbench";
import { byName } from "../text";
import { DRAG_OBJECT } from "./DiagramEditor";

export function Explorer() {
  const { state } = useModel();
  const selection = useWorkbench((s) => s.selection);
  const [filter, setFilter] = useState("");
  const [creating, setCreating] = useState<"folder" | "object" | null>(null);
  const roots = state.folders.find("byParent", "").sort(byName);
  // New items go into the selected folder, or the folder of the selected item.
  const targetFolder = (() => {
    if (!selection) return null;
    if (selection.kind === "folder") return selection.id;
    if (selection.kind === "object") return state.objects.get(selection.id)?.folderId ?? null;
    return state.diagrams.get(selection.id)?.folderId ?? null;
  })();

  const query = filter.trim().toLocaleLowerCase();
  return (
    <nav className="explorer" aria-label="Explorer">
      <div className="pane-title">
        <span>Explorer</span>
        <span className="tools">
          <button title="New folder" onClick={() => setCreating("folder")}>
            + Folder
          </button>
          <button title="New object" disabled={!targetFolder} onClick={() => setCreating("object")}>
            + Object
          </button>
        </span>
      </div>
      <input
        className="filter"
        placeholder="Filter"
        aria-label="Filter the explorer"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      {creating && (
        <CreateForm
          kind={creating}
          folderId={creating === "folder" ? (selection?.kind === "folder" ? selection.id : null) : targetFolder}
          onDone={() => setCreating(null)}
        />
      )}
      <ul className="tree" role="tree">
        {query ? <FilterResults query={query} /> : roots.map((f) => <FolderNode key={f.id} id={f.id} depth={0} />)}
      </ul>
    </nav>
  );
}

function FolderNode({ id, depth }: { id: Id; depth: number }) {
  const { state } = useModel();
  const [open, setOpen] = useState(depth < 2);
  const folder = state.folders.get(id);
  if (!folder) return null;
  const folders = state.folders.find("byParent", id).sort(byName);
  const objects = state.objects.find("byFolder", id).sort(byName);
  const diagrams = state.diagrams.find("byFolder", id).sort(byName);
  const empty = folders.length + objects.length + diagrams.length === 0;
  return (
    <li role="treeitem" aria-expanded={open}>
      <Row
        item={{ kind: "folder", id }}
        depth={depth}
        icon={empty ? "📁" : open ? "▾ 📁" : "▸ 📁"}
        label={folder.name}
        onToggle={() => setOpen(!open)}
      />
      {open && !empty && (
        <ul role="group">
          {folders.map((f) => (
            <FolderNode key={f.id} id={f.id} depth={depth + 1} />
          ))}
          {diagrams.map((d) => (
            <li key={d.id} role="treeitem">
              <Row item={{ kind: "diagram", id: d.id }} depth={depth + 1} icon="⧉" label={d.name} />
            </li>
          ))}
          {objects.map((o) => (
            <li key={o.id} role="treeitem">
              <Row item={{ kind: "object", id: o.id }} depth={depth + 1} icon="▭" label={o.name} />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function FilterResults({ query }: { query: string }) {
  const { state } = useModel();
  const match = (name: string) => name.toLocaleLowerCase().includes(query);
  const rows = [
    ...[...state.folders.live()].filter((f) => match(f.name)).map((f) => ({ kind: "folder" as const, ...f })),
    ...[...state.diagrams.live()].filter((d) => match(d.name)).map((d) => ({ kind: "diagram" as const, ...d })),
    ...[...state.objects.live()].filter((o) => match(o.name)).map((o) => ({ kind: "object" as const, ...o })),
  ].sort(byName);
  if (rows.length === 0) return <li className="muted empty">Nothing matches.</li>;
  const icon = { folder: "📁", diagram: "⧉", object: "▭" };
  return (
    <>
      {rows.map((r) => (
        <li key={r.id} role="treeitem">
          <Row item={{ kind: r.kind, id: r.id }} depth={0} icon={icon[r.kind]} label={r.name} />
        </li>
      ))}
    </>
  );
}

function Row(props: { item: Selection; depth: number; icon: string; label: string; onToggle?: () => void }) {
  const { item, depth, icon, label, onToggle } = props;
  const selected = useWorkbench((s) => s.selection?.id === item.id);
  const select = useWorkbench((s) => s.select);
  const openTab = useWorkbench((s) => s.openTab);
  const presence = useWorkbench((s) => s.presence);
  const myId = useAuth((s) => s.signIn?.userId);
  const others = presence.filter((u) => u.id !== myId && u.selection.includes(item.id));
  const openIt = () => {
    if (item.kind === "folder") onToggle?.();
    else openTab({ kind: item.kind, id: item.id });
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") openIt();
  };
  return (
    <div
      className={`row${selected ? " selected" : ""}`}
      style={{ paddingLeft: 8 + depth * 14 }}
      tabIndex={0}
      aria-selected={selected}
      data-kind={item.kind}
      // Objects can be dragged onto a diagram as another occurrence of the same object.
      draggable={item.kind === "object"}
      onDragStart={(e) => {
        if (item.kind !== "object") return;
        e.dataTransfer.setData(DRAG_OBJECT, item.id);
        e.dataTransfer.effectAllowed = "copy";
      }}
      onClick={() => {
        select(item);
        if (item.kind === "folder") onToggle?.();
      }}
      onDoubleClick={openIt}
      onKeyDown={onKeyDown}
    >
      <span className="icon" aria-hidden>
        {icon}
      </span>
      <span className="label">{label}</span>
      {others.length > 0 && (
        <span className="dots" aria-hidden>
          {others.map((u) => (
            <span key={u.id} className="dot" style={{ background: u.color }} title={u.name} />
          ))}
        </span>
      )}
    </div>
  );
}

function CreateForm({ kind, folderId, onDone }: { kind: "folder" | "object"; folderId: Id | null; onDone(): void }) {
  const { metamodel } = useModel();
  const edit = useWorkbench((s) => s.edit);
  const select = useWorkbench((s) => s.select);
  const types = metamodel.allObjectTypes().filter((t) => !t.definition.abstract);
  const [name, setName] = useState("");
  const [type, setType] = useState(types[0]?.definition.key ?? "");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return onDone();
    const id = ulid();
    const ok =
      kind === "folder"
        ? edit(`Create folder ${trimmed}`, [{ edit: "createFolder", id, parentId: folderId, name: trimmed }])
        : edit(`Create ${trimmed}`, [{ edit: "createObject", id, type, name: trimmed, folderId: folderId! }]);
    if (ok) {
      select({ kind, id });
      onDone();
    }
  };
  return (
    <form className="create" onSubmit={submit} onKeyDown={(e) => e.key === "Escape" && onDone()}>
      {kind === "object" && (
        <select aria-label="Object type" value={type} onChange={(e) => setType(e.target.value)}>
          {types.map((t) => (
            <option key={t.definition.key} value={t.definition.key}>
              {t.definition.name}
            </option>
          ))}
        </select>
      )}
      <input
        autoFocus
        aria-label={kind === "folder" ? "New folder name" : "New object name"}
        placeholder={kind === "folder" ? "Folder name" : "Name"}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button type="submit" className="primary">
        Create
      </button>
    </form>
  );
}
