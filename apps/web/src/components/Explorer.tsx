// The explorer's Folders tab (design/04-ux/workbench.md): everything as stored, with a filter, a right-click
// menu on every row (and on the empty space) and inline create and rename. The Types, Hierarchies and Queries
// tabs arrive in M1.
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { ulid, type Id } from "@connectome/model";
import { useAuth } from "../state/auth";
import { useModel, useWorkbench, type Selection } from "../state/workbench";
import { byName } from "../text";
import { folderChain, targetFolder } from "../explorer";
import { DRAG_OBJECT } from "./DiagramEditor";
import { ContextMenu, type MenuEntry } from "./Menu";
import { backgroundMenu, deleteItem, itemMenu, openItem, renameItem } from "./commands";

interface OpenMenu {
  x: number;
  y: number;
  label: string;
  entries: MenuEntry[];
}
const MenuContext = createContext<(menu: OpenMenu) => void>(() => {});

export function Explorer() {
  const { state } = useModel();
  const selection = useWorkbench((s) => s.selection);
  const task = useWorkbench((s) => s.explorerTask);
  const setTask = useWorkbench((s) => s.setExplorerTask);
  const [filter, setFilter] = useState("");
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const roots = state.folders.find("byParent", "").sort(byName);
  const folderId = targetFolder(state, selection);

  const onBackgroundMenu = (e: MouseEvent) => {
    // Rows open their own menu; this is the empty space below and between them.
    if ((e.target as HTMLElement).closest(".row, .create, input, button")) return;
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, label: "Explorer", entries: backgroundMenu() });
  };

  const query = filter.trim().toLocaleLowerCase();
  return (
    <nav className="explorer" aria-label="Explorer" onContextMenu={onBackgroundMenu}>
      <div className="pane-title">
        <span>Explorer</span>
        <span className="tools">
          <button
            title="New folder"
            onClick={() =>
              setTask({ kind: "create", what: "folder", folderId: selection?.kind === "folder" ? selection.id : null })
            }
          >
            + Folder
          </button>
          <button
            title="New object"
            disabled={!folderId}
            onClick={() => setTask({ kind: "create", what: "object", folderId })}
          >
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
      {task?.kind === "create" && (
        <CreateForm
          key={`${task.what}:${task.folderId}`}
          kind={task.what}
          folderId={task.folderId}
          onDone={() => setTask(null)}
        />
      )}
      <MenuContext.Provider value={setMenu}>
        <ul className="tree" role="tree">
          {query ? <FilterResults query={query} /> : roots.map((f) => <FolderNode key={f.id} id={f.id} depth={0} />)}
        </ul>
      </MenuContext.Provider>
      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
    </nav>
  );
}

function FolderNode({ id, depth }: { id: Id; depth: number }) {
  const { state } = useModel();
  const [open, setOpen] = useState(depth < 2);
  const folder = state.folders.get(id);
  // The explorer reveals the selection (design/04-ux/workbench.md, "Selection"): a folder opens when something
  // inside it is selected, e.g. a new item or one the File menu is renaming.
  const selection = useWorkbench((s) => s.selection);
  const holdsSelection =
    selection !== null && selection.id !== id && folderChain(state, targetFolder(state, selection)).includes(id);
  useEffect(() => {
    if (holdsSelection) setOpen(true);
  }, [holdsSelection, selection?.id]);
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
  const { state } = useModel();
  const selected = useWorkbench((s) => s.selection?.id === item.id);
  const renaming = useWorkbench((s) => s.explorerTask?.kind === "rename" && s.explorerTask.item.id === item.id);
  const select = useWorkbench((s) => s.select);
  const presence = useWorkbench((s) => s.presence);
  const openMenu = useContext(MenuContext);
  const myId = useAuth((s) => s.signIn?.userId);
  const others = presence.filter((u) => u.id !== myId && u.selection.includes(item.id));
  const openIt = () => {
    if (item.kind === "folder") onToggle?.();
    else openItem(item);
  };
  const showMenu = (x: number, y: number) => {
    select(item);
    openMenu({ x, y, label: label, entries: itemMenu(state, item) });
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter") openIt();
    else if (e.key === "F2") renameItem(item);
    else if (e.key === "Delete") deleteItem(state, item);
    else if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
      const rect = e.currentTarget.getBoundingClientRect();
      showMenu(rect.left + 24, rect.bottom);
    } else return;
    e.preventDefault();
  };
  if (renaming) return <RenameBox item={item} depth={depth} icon={icon} name={label} />;
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
      onContextMenu={(e) => {
        e.preventDefault();
        showMenu(e.clientX, e.clientY);
      }}
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

/** Inline rename (F2 or the menus): Enter saves, Esc or an unchanged name cancels. */
function RenameBox({ item, depth, icon, name }: { item: Selection; depth: number; icon: string; name: string }) {
  const { state } = useModel();
  const edit = useWorkbench((s) => s.edit);
  const setTask = useWorkbench((s) => s.setExplorerTask);
  const [value, setValue] = useState(name);
  // Enter saves and unmounts the box; the blur that may follow must not save a second time.
  const finished = useRef(false);
  const done = () => {
    finished.current = true;
    setTask(null);
  };
  const save = () => {
    if (finished.current) return;
    const to = value.trim();
    if (!to || to === name) return done();
    const label = `Rename ${name} to ${to}`;
    if (item.kind === "folder") edit(label, [{ edit: "renameFolder", id: item.id, name: to }]);
    else if (item.kind === "object") {
      const object = state.objects.get(item.id);
      if (object) edit(label, [{ edit: "renameObject", id: object.id, baseVersion: object.version, name: to }]);
    } else {
      const diagram = state.diagrams.get(item.id);
      if (diagram)
        edit(label, [{ edit: "updateDiagram", id: diagram.id, baseVersion: diagram.version, set: { name: to } }]);
    }
    done();
  };
  return (
    <div className="row renaming" style={{ paddingLeft: 8 + depth * 14 }} data-kind={item.kind}>
      <span className="icon" aria-hidden>
        {icon}
      </span>
      <input
        autoFocus
        aria-label={`Rename ${name}`}
        value={value}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          else if (e.key === "Escape") done();
          e.stopPropagation();
        }}
      />
    </div>
  );
}

function CreateForm(props: { kind: "folder" | "object" | "diagram"; folderId: Id | null; onDone(): void }) {
  const { kind, folderId, onDone } = props;
  const { metamodel } = useModel();
  const edit = useWorkbench((s) => s.edit);
  const select = useWorkbench((s) => s.select);
  const openTab = useWorkbench((s) => s.openTab);
  const types =
    kind === "diagram"
      ? metamodel.allDiagramTypes().map((t) => ({ key: t.definition.key, name: t.definition.name }))
      : metamodel
          .allObjectTypes()
          .filter((t) => !t.definition.abstract)
          .map((t) => ({ key: t.definition.key, name: t.definition.name }));
  const [name, setName] = useState("");
  const [type, setType] = useState(types[0]?.key ?? "");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return onDone();
    const id = ulid();
    const ok =
      kind === "folder"
        ? edit(`Create folder ${trimmed}`, [{ edit: "createFolder", id, parentId: folderId, name: trimmed }])
        : kind === "object"
          ? edit(`Create ${trimmed}`, [{ edit: "createObject", id, type, name: trimmed, folderId: folderId! }])
          : edit(`Create diagram ${trimmed}`, [
              { edit: "createDiagram", id, name: trimmed, diagramType: type, folderId: folderId! },
            ]);
    if (ok) {
      select({ kind, id });
      if (kind === "diagram") openTab({ kind, id });
      onDone();
    }
  };
  const words = { folder: "folder", object: "object", diagram: "diagram" }[kind];
  return (
    <form className="create" onSubmit={submit} onKeyDown={(e) => e.key === "Escape" && onDone()}>
      {kind !== "folder" && (
        <select
          aria-label={kind === "object" ? "Object type" : "Diagram type"}
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          {types.map((t) => (
            <option key={t.key} value={t.key}>
              {t.name}
            </option>
          ))}
        </select>
      )}
      <input
        autoFocus
        aria-label={`New ${words} name`}
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
