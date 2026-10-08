// The explorer's Folders tab (design/04-ux/workbench.md): everything as stored, in the order people put it, with a
// filter, a right-click menu on every row (and on the empty space), inline create and rename, and drag and drop.
// Contained objects show inside their container (semantics.md §3) and groups list their members (decision B22).
// The Types, Hierarchies and Queries tabs arrive in M1.
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
  type ReactNode,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { namesOf } from "@connectome/engine";
import { ulid, type Edit, type Id } from "@connectome/model";
import { useAuth } from "../state/auth";
import { itemSelected, useModel, useWorkbench, type Selection } from "../state/workbench";
import { byName } from "../text";
import { explorerGroups, payloadText, type RelationshipGroup } from "../semantics";
import { folderChain, targetFolder } from "../explorer";
import { notationFor } from "../notation";
import { viewKind } from "../views";
import { NewDiagramDialog } from "./NewDiagramDialog";
import {
  childrenOf,
  containAsPlan,
  dropPlan,
  dropPosition,
  groupMembers,
  isGroup,
  isWithin,
  partPlan,
  removeFromGroupPlan,
  rankEdits,
  typeChoices,
  type Drag,
  type Parent,
  type Plan,
  type Position,
} from "../dragdrop";
import { DRAG_OBJECT } from "./DiagramEditor";
import { FindOrCreate } from "./FindOrCreate";
import { Glyph } from "./Glyph";
import { FolderIcon, ViewIcon } from "./ExplorerIcon";
import { ContextMenu, type MenuEntry } from "./Menu";
import {
  backgroundMenu,
  deleteItem,
  itemMenu,
  marksMenu,
  memberMenu,
  moveItem,
  openItem,
  renameItem,
  runPlan,
} from "./commands";

/** Marks a drag that started in the explorer (folders and diagrams carry nothing else). */
const DRAG_EXPLORER = "application/x-connectome-explorer";
/** What is being dragged: the browser hides drag data until the drop, but every dragover needs to know. */
let dragging: Drag | null = null;
/** Hovering this long over a closed folder or container while dragging opens it. */
const OPEN_AFTER_MS = 600;
/** Each level of the tree is indented this much; the disclosure triangle takes TWISTY of a row's width. */
const INDENT = 12;
const TWISTY = 12;
const indent = (depth: number) => 4 + depth * INDENT;

interface OpenMenu {
  x: number;
  y: number;
  label: string;
  entries: MenuEntry[];
}
interface ExplorerContext {
  openMenu(menu: OpenMenu): void;
  /** Why the current drop target refuses the drag (shown under the tree), or null. */
  setHint(hint: string | null): void;
}
const Context = createContext<ExplorerContext>({ openMenu: () => {}, setHint: () => {} });

export function Explorer() {
  const { state, metamodel } = useModel();
  const selection = useWorkbench((s) => itemSelected(s.selection));
  const task = useWorkbench((s) => s.explorerTask);
  const setTask = useWorkbench((s) => s.setExplorerTask);
  const toggleMark = useWorkbench((s) => s.toggleMark);
  const [filter, setFilter] = useState("");
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [rootDrop, setRootDrop] = useState(false);
  const roots = childrenOf(state, metamodel, { kind: "root" });
  const folderId = targetFolder(state, selection);
  const context = useRef<ExplorerContext>({ openMenu: setMenu, setHint }).current;

  const onBackgroundMenu = (e: MouseEvent) => {
    // Rows open their own menu; this is the empty space below and between them.
    if ((e.target as HTMLElement).closest(".row, .create, input, button")) return;
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, label: "Explorer", entries: backgroundMenu() });
  };

  // The empty space below the tree: folders dropped there go to the end of the top level.
  const last = roots[roots.length - 1];
  const rootPlan = (): Plan | null =>
    dragging && last ? dropPlan(state, metamodel, dragging, { kind: "folder", id: last.id }, "after") : null;
  const onTreeDragOver = (e: DragEvent) => {
    if (e.target !== e.currentTarget || !e.dataTransfer.types.includes(DRAG_EXPLORER)) return;
    const plan = rootPlan();
    if (!plan || "error" in plan) {
      setHint(plan && "error" in plan ? plan.error : null);
      setRootDrop(false);
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setHint(null);
    setRootDrop(true);
  };
  const onTreeDrop = (e: DragEvent) => {
    if (e.target !== e.currentTarget) return;
    e.preventDefault();
    setRootDrop(false);
    const plan = rootPlan();
    if (plan) runPlan(plan);
  };

  const query = filter.trim().toLocaleLowerCase();
  return (
    <nav
      className="explorer"
      aria-label="Explorer"
      onContextMenu={onBackgroundMenu}
      onKeyDown={(e) => e.key === "Escape" && toggleMark(null)}
    >
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
          <button title="New diagram" onClick={() => setTask({ kind: "create", what: "diagram", folderId })}>
            + Diagram
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
      {task?.kind === "create" && task.what === "diagram" && (
        <NewDiagramDialog key={`diagram:${task.folderId}`} folderId={task.folderId} onDone={() => setTask(null)} />
      )}
      {task?.kind === "create" && task.what !== "diagram" && (
        <CreateForm
          key={`${task.what}:${task.folderId}`}
          kind={task.what}
          folderId={task.folderId}
          members={task.members ?? []}
          onDone={() => setTask(null)}
        />
      )}
      <Context.Provider value={context}>
        <ul
          className={`tree${rootDrop ? " drop-end" : ""}`}
          role="tree"
          onDragOver={onTreeDragOver}
          onDragLeave={() => setRootDrop(false)}
          onDrop={onTreeDrop}
        >
          {query ? <FilterResults query={query} /> : roots.map((f) => <FolderNode key={f.id} id={f.id} depth={0} />)}
        </ul>
      </Context.Provider>
      {hint && (
        <div className="drop-hint" role="status">
          {hint}
        </div>
      )}
      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
    </nav>
  );
}

/** The rows under a parent, in the explorer's order. */
function Children({ parent, depth }: { parent: Parent; depth: number }) {
  const { state, metamodel } = useModel();
  return (
    <>
      {childrenOf(state, metamodel, parent).map((c) =>
        c.kind === "folder" ? (
          <FolderNode key={c.id} id={c.id} depth={depth} />
        ) : c.kind === "object" ? (
          <ObjectNode key={c.id} id={c.id} depth={depth} />
        ) : (
          <li key={c.id} role="treeitem">
            <Row
              item={{ kind: "diagram", id: c.id }}
              depth={depth}
              icon={<ViewIcon kind={viewKind(state, metamodel, c.id)} />}
              label={c.name}
            />
          </li>
        ),
      )}
    </>
  );
}

/** Opens a folder or container when something inside it is selected (the explorer reveals the selection). */
function useReveal(id: Id, setOpen: (open: boolean) => void) {
  const { state, metamodel } = useModel();
  const selection = useWorkbench((s) => itemSelected(s.selection));
  const holds =
    !!selection &&
    selection.id !== id &&
    (folderChain(state, targetFolder(state, selection)).includes(id) ||
      (selection.kind === "object" &&
        isWithin(state, metamodel, selection, { kind: "object", id }) &&
        state.objects.get(id) !== undefined));
  useEffect(() => {
    if (holds) setOpen(true);
  }, [holds, selection?.id, setOpen]);
}

function FolderNode({ id, depth }: { id: Id; depth: number }) {
  const { state, metamodel } = useModel();
  const [open, setOpen] = useState(depth < 2);
  useReveal(id, setOpen);
  const folder = state.folders.get(id);
  if (!folder) return null;
  const empty = childrenOf(state, metamodel, { kind: "folder", id }).length === 0;
  return (
    <li role="treeitem" aria-expanded={open}>
      <Row
        item={{ kind: "folder", id }}
        depth={depth}
        icon={<FolderIcon />}
        expanded={empty ? undefined : open}
        label={folder.name}
        onToggle={() => setOpen(!open)}
        onExpand={() => setOpen(true)}
      />
      {open && !empty && (
        <ul role="group">
          <Children parent={{ kind: "folder", id }} depth={depth + 1} />
        </ul>
      )}
    </li>
  );
}

function ObjectNode({ id, depth }: { id: Id; depth: number }) {
  const { state, metamodel } = useModel();
  const contents = childrenOf(state, metamodel, { kind: "object", id });
  const group = isGroup(state, metamodel, id);
  const members = group ? groupMembers(state, id) : [];
  const meaning = explorerGroups(state, metamodel, id, new Set(members.map((m) => m.relationship.id)));
  // Structure is open until closed; meaning alone waits to be asked for (workbench.md, "Explorer: a semantic navigator").
  const [chosen, setOpen] = useState<boolean | null>(null);
  const open = chosen ?? contents.length + members.length > 0;
  useReveal(id, setOpen);
  const object = state.objects.get(id);
  if (!object) return null;
  const hasChildren = contents.length + members.length + meaning.length > 0;
  return (
    <li role="treeitem" aria-expanded={hasChildren ? open : undefined}>
      <Row
        item={{ kind: "object", id }}
        depth={depth}
        icon={<ObjectGlyph type={object.type} group={group} />}
        expanded={hasChildren ? open : undefined}
        label={object.name}
        onToggle={() => setOpen(!open)}
        onExpand={() => setOpen(true)}
      />
      {open && hasChildren && (
        <ul role="group">
          <Children parent={{ kind: "object", id }} depth={depth + 1} />
          {members.map(({ relationship, member }) => (
            <li key={relationship.id} role="treeitem">
              <Row
                item={{ kind: "object", id: member.id }}
                depth={depth + 1}
                icon={
                  <>
                    <span className="ref-mark">↗</span>
                    <ObjectGlyph type={member.type} />
                  </>
                }
                label={member.name}
                memberOf={relationship.id}
              />
            </li>
          ))}
          {meaning.map((g) => (
            <MeaningGroup key={`${g.kind}:${g.direction}`} group={g} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * One semantic group under an object: its relationships of one kind and direction, collapsed and dimmed, with the
 * objects at their other end as references (↗). Selecting a reference selects that object; it is stored elsewhere.
 */
function MeaningGroup({ group, depth }: { group: RelationshipGroup; depth: number }) {
  const { state } = useModel();
  const select = useWorkbench((s) => s.select);
  const [open, setOpen] = useState(false);
  return (
    <li role="treeitem" aria-expanded={open} className="meaning" data-kind={group.kind}>
      <button className="group-row" style={{ paddingLeft: indent(depth) }} onClick={() => setOpen(!open)}>
        {open ? "▾" : "▸"} ⋯ {group.label} ({group.rows.length})
      </button>
      {open && (
        <ul role="group">
          {group.rows.map(({ relationship, other, arrow }) => (
            <li key={relationship.id} role="treeitem">
              <button
                className="ref-row"
                style={{ paddingLeft: indent(depth + 1) + TWISTY }}
                onClick={() => select({ kind: "object", id: other })}
              >
                ↗ {state.objects.get(other)?.name ?? other}
                {relationship.payload.length > 0 && (
                  <span className="payload-text">
                    {" "}
                    {arrow} {payloadText(state, relationship)}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** An object's glyph: its type's, from the semantic category (notation-and-metamodel-admin.md §2). */
function ObjectGlyph({ type, group }: { type: string; group?: boolean }) {
  const { metamodel } = useModel();
  const notation = notationFor(metamodel.objectType(type));
  return <Glyph glyph={group ? "group" : notation.glyph} colour={notation.ink} />;
}

function FilterResults({ query }: { query: string }) {
  const { state, metamodel } = useModel();
  const match = (name: string) => name.toLocaleLowerCase().includes(query);
  const rows = [
    ...[...state.folders.live()].filter((f) => match(f.name)).map((f) => ({ kind: "folder" as const, ...f })),
    ...[...state.diagrams.live()].filter((d) => match(d.name)).map((d) => ({ kind: "diagram" as const, ...d })),
    ...[...state.objects.live()].filter((o) => namesOf(o).some(match)).map((o) => ({ kind: "object" as const, ...o })),
  ].sort(byName);
  if (rows.length === 0) return <li className="muted empty">Nothing matches.</li>;
  return (
    <>
      {rows.map((r) => (
        <li key={r.id} role="treeitem">
          <Row
            item={{ kind: r.kind, id: r.id }}
            depth={0}
            icon={
              r.kind === "object" ? (
                <ObjectGlyph type={r.type} />
              ) : r.kind === "folder" ? (
                <FolderIcon />
              ) : (
                <ViewIcon kind={viewKind(state, metamodel, r.id)} />
              )
            }
            label={r.name}
          />
        </li>
      ))}
    </>
  );
}

function Row(props: {
  item: Selection;
  depth: number;
  icon: ReactNode;
  /** Open or closed when the row has children; undefined for a leaf. */
  expanded?: boolean;
  label: string;
  onToggle?: () => void;
  /** Opens a closed folder or container (hovering over it while dragging). */
  onExpand?: () => void;
  /** A group member's reference row: the `groups` relationship it shows. */
  memberOf?: Id;
}) {
  const { item, depth, icon, expanded, label, onToggle, onExpand, memberOf } = props;
  const { state, metamodel } = useModel();
  const { openMenu, setHint } = useContext(Context);
  const selected = useWorkbench((s) => s.selection?.id === item.id && !memberOf);
  const marked = useWorkbench((s) => !memberOf && s.marked.some((m) => m.id === item.id));
  const renaming = useWorkbench(
    (s) => !memberOf && s.explorerTask?.kind === "rename" && s.explorerTask.item.id === item.id,
  );
  const select = useWorkbench((s) => s.select);
  const toggleMark = useWorkbench((s) => s.toggleMark);
  const presence = useWorkbench((s) => s.presence);
  const myId = useAuth((s) => s.signIn?.userId);
  const [drop, setDrop] = useState<Position | null>(null);
  const openTimer = useRef<number | undefined>(undefined);
  const others = presence.filter((u) => u.id !== myId && u.selection.includes(item.id));
  // Folders hold anything; objects hold contents (or, for a group, members). Member rows are not drop targets.
  const canHold = item.kind !== "diagram";

  const openIt = () => {
    if (item.kind === "folder") onToggle?.();
    else openItem(item);
  };
  const showMenu = (x: number, y: number) => {
    const marks = useWorkbench.getState().marked;
    if (marks.length > 1 && marks.some((m) => m.id === item.id) && !memberOf) {
      return openMenu({ x, y, label: `${marks.length} items`, entries: marksMenu(state, metamodel, marks) });
    }
    select(item);
    openMenu({
      x,
      y,
      label,
      entries: memberOf ? memberMenu(state, item, memberOf) : itemMenu(state, metamodel, item),
    });
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      // Ctrl/⌘+↑/↓ moves the row among its siblings; the row keeps the focus wherever it lands.
      e.preventDefault();
      if (memberOf || !moveItem(state, metamodel, item, e.key === "ArrowUp" ? -1 : 1)) return;
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>(`.explorer .row[data-id="${item.id}"]:not(.member)`)?.focus(),
      );
      return;
    }
    if (e.key === "Enter") openIt();
    else if (e.key === "F2" && !memberOf) renameItem(item);
    else if (e.key === "Delete") {
      if (memberOf) runPlan(removeFromGroupPlan(state, memberOf));
      else deleteItem(state, item);
    } else if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
      const rect = e.currentTarget.getBoundingClientRect();
      showMenu(rect.left + 24, rect.bottom);
    } else return;
    e.preventDefault();
  };

  // ---------------------------------------------------------------- drag and drop
  const stopTimer = () => {
    window.clearTimeout(openTimer.current);
    openTimer.current = undefined;
  };
  const planFor = (e: DragEvent): { position: Position; plan: Plan } | null => {
    if (!dragging || memberOf) return null;
    const rect = e.currentTarget.getBoundingClientRect();
    const position = dropPosition(e.clientY - rect.top, rect.height, canHold);
    return { position, plan: dropPlan(state, metamodel, dragging, item, position) };
  };
  const onDragStart = (e: DragEvent) => {
    const marks = useWorkbench.getState().marked;
    const items = !memberOf && marks.some((m) => m.id === item.id) ? marks : [item];
    dragging = { items, ...(memberOf ? { memberOf } : {}) };
    e.dataTransfer.effectAllowed = "copyMove";
    e.dataTransfer.setData(DRAG_EXPLORER, item.id);
    // A single object can also be dropped on a diagram, as another occurrence.
    if (item.kind === "object" && items.length === 1) e.dataTransfer.setData(DRAG_OBJECT, item.id);
  };
  const onDragOver = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes(DRAG_EXPLORER)) return;
    const result = planFor(e);
    if (!result || "error" in result.plan) {
      setDrop(null);
      setHint(result && "error" in result.plan ? result.plan.error : null);
      stopTimer();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setHint(null);
    setDrop(result.position);
    if (result.position === "into" && onExpand && openTimer.current === undefined) {
      openTimer.current = window.setTimeout(onExpand, OPEN_AFTER_MS);
    } else if (result.position !== "into") stopTimer();
  };
  const onDragLeave = (e: DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDrop(null);
    stopTimer();
  };
  const onDrop = (e: DragEvent) => {
    const result = planFor(e);
    setDrop(null);
    setHint(null);
    stopTimer();
    if (!result) return;
    e.preventDefault();
    e.stopPropagation();
    const drag = dragging!;
    // Alt+drop onto an object: choose how it relates (workbench.md, "Explorer: a semantic navigator").
    const one = drag.items.length === 1 && drag.items[0]!.kind === "object" && !drag.memberOf;
    if (
      e.altKey &&
      one &&
      result.position === "into" &&
      item.kind === "object" &&
      !isGroup(state, metamodel, item.id)
    ) {
      return openMenu({
        x: e.clientX,
        y: e.clientY,
        label: "Relationship type",
        entries: altDropMenu(drag.items[0]!.id, item.id),
      });
    }
    runPlan(result.plan);
  };
  const altDropMenu = (childId: Id, parentId: Id): MenuEntry[] => {
    const choices = typeChoices(state, metamodel, childId, parentId);
    // Contained objects take their place at the end of the new container's contents.
    const atEnd = (plan: Plan): Plan => {
      if ("error" in plan) return plan;
      const siblings = childrenOf(state, metamodel, { kind: "object", id: parentId }).filter((s) => s.id !== childId);
      const child = state.objects.get(childId)!;
      const ranks: Edit[] = rankEdits(siblings, siblings.length, [{ kind: "object", id: childId, name: child.name }]);
      return { ...plan, edits: [...plan.edits, ...ranks] };
    };
    return [
      {
        label: "Contain as",
        disabled: choices.contain.length ? null : "No containment rule allows this pair",
        submenu: choices.contain.map((t) => ({
          label: t.name,
          run: () => runPlan(atEnd(containAsPlan(state, metamodel, childId, parentId, t.key))),
        })),
      },
      {
        label: "Add as part",
        disabled: choices.part.length ? null : "No composition or aggregation rule allows this pair",
        submenu: choices.part.map((t) => ({
          label: t.name,
          run: () => runPlan(partPlan(state, metamodel, childId, parentId, t.key)),
        })),
      },
    ];
  };

  if (renaming) return <RenameBox item={item} depth={depth} icon={icon} name={label} />;
  return (
    <div
      className={`row${selected ? " selected" : ""}${marked ? " marked" : ""}${memberOf ? " member" : ""}${
        drop ? ` drop-${drop}` : ""
      }`}
      style={{ paddingLeft: indent(depth) }}
      tabIndex={0}
      aria-selected={selected}
      data-kind={item.kind}
      data-id={item.id}
      title={memberOf ? `${label}: stored in its own folder` : undefined}
      draggable
      onDragStart={onDragStart}
      onDragEnd={() => {
        dragging = null;
        setHint(null);
      }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={(e) => {
        if ((e.ctrlKey || e.metaKey) && !memberOf) {
          // Ctrl/⌘-click marks rows to drag or group together; the selection joins the marks.
          const { marked: marks } = useWorkbench.getState();
          const selection = itemSelected(useWorkbench.getState().selection);
          if (marks.length === 0 && selection && selection.id !== item.id) toggleMark(selection);
          toggleMark(item);
          return;
        }
        toggleMark(null);
        select(item);
        if (item.kind === "folder") onToggle?.();
      }}
      onDoubleClick={openIt}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        showMenu(e.clientX, e.clientY);
      }}
    >
      <span
        className="twisty"
        aria-hidden
        onClick={(e) => {
          // Objects open on double-click, so their contents toggle from the triangle.
          if (expanded === undefined || !onToggle) return;
          e.stopPropagation();
          onToggle();
        }}
      >
        {expanded === undefined ? "" : expanded ? "▾" : "▸"}
      </span>
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

function RenameBox({ item, depth, icon, name }: { item: Selection; depth: number; icon: ReactNode; name: string }) {
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
    <div className="row renaming" style={{ paddingLeft: indent(depth) }} data-kind={item.kind}>
      <span className="twisty" aria-hidden />
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

function CreateForm(props: {
  kind: "folder" | "object" | "group";
  folderId: Id | null;
  /** For a new group: the objects it gathers. */
  members: Id[];
  onDone(): void;
}) {
  const { kind, folderId, members, onDone } = props;
  const { metamodel } = useModel();
  const edit = useWorkbench((s) => s.edit);
  const select = useWorkbench((s) => s.select);
  const notify = useWorkbench((s) => s.notify);
  const types = metamodel
    .allObjectTypes()
    .filter((t) => !t.definition.abstract)
    .map((t) => ({ key: t.definition.key, name: t.definition.name }));
  const [name, setName] = useState("");
  const [type, setType] = useState(types[0]?.key ?? "");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return onDone();
    if (create(trimmed)) onDone();
  };
  /** Makes the item; false when the change was refused. */
  const create = (trimmed: string): boolean => {
    const id = ulid();
    const ok =
      kind === "folder"
        ? edit(`Create folder ${trimmed}`, [{ edit: "createFolder", id, parentId: folderId, name: trimmed }])
        : kind === "object"
          ? edit(`Create ${trimmed}`, [{ edit: "createObject", id, type, name: trimmed, folderId: folderId! }])
          : // A group, with the objects it was made from (decision B22).
            edit(members.length ? `Group ${members.length} items as ${trimmed}` : `Create group ${trimmed}`, [
              { edit: "createObject", id, type: "group", name: trimmed, folderId: folderId! },
              ...members.map((m): Edit => ({
                edit: "createRelationship",
                id: ulid(),
                type: "groups",
                sourceId: id,
                targetId: m,
              })),
            ]);
    if (ok) {
      useWorkbench.getState().toggleMark(null);
      select({ kind: kind === "group" ? "object" : kind, id });
    }
    return ok;
  };
  const words = kind;
  return (
    <form className="create" onSubmit={submit} onKeyDown={(e) => e.key === "Escape" && onDone()}>
      {kind === "object" && (
        <select aria-label="Object type" value={type} onChange={(e) => setType(e.target.value)}>
          {types.map((t) => (
            <option key={t.key} value={t.key}>
              {t.name}
            </option>
          ))}
        </select>
      )}
      {kind === "object" ? (
        // Offers the objects this may already be before making a new one (design/02-model/duplicates-and-identity.md §5).
        <FindOrCreate
          key={type}
          type={type}
          folderId={folderId}
          label="New object name"
          onPick={(object) => {
            select({ kind: "object", id: object.id });
            notify(`${object.name} already exists, so it is selected instead of making a copy`, "info");
          }}
          onCreate={(chosen) => create(chosen)}
          onDone={onDone}
        />
      ) : (
        <>
          <input
            autoFocus
            aria-label={`New ${words} name`}
            placeholder={kind === "folder" ? "Folder name" : kind === "group" ? "Group name" : "Name"}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" className="primary">
            Create
          </button>
        </>
      )}
    </form>
  );
}
