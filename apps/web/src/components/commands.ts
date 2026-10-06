// The commands behind the explorer's right-click menu and the File menu (design/04-ux/workbench.md, "Menus").
// Both menus build their items here so an item reads and behaves the same wherever it appears.
import type { ModelState } from "@connectome/engine";
import { useAuth } from "../state/auth";
import { useWorkbench, type Selection } from "../state/workbench";
import { navigate } from "../route";
import { itemName, targetFolder, whyFolderNotDeletable } from "../explorer";
import type { MenuEntry } from "./Menu";

const store = () => useWorkbench.getState();
const NO_FOLDER = "Select a folder, or an item in one, first";

/** New items go into the selected folder or the selected item's folder; a new folder goes at the top level when
 * nothing is selected. */
function newItems(folderId: string | null): MenuEntry[] {
  const create = (what: "folder" | "object" | "diagram") => () =>
    store().setExplorerTask({ kind: "create", what, folderId });
  return [
    { label: "New folder", run: create("folder") },
    { label: "New object", disabled: folderId ? null : NO_FOLDER, run: create("object") },
    { label: "New diagram", disabled: folderId ? null : NO_FOLDER, run: create("diagram") },
  ];
}

/** Opens an object page or a diagram tab. */
export function openItem(item: Selection) {
  if (item.kind !== "folder") store().openTab({ kind: item.kind, id: item.id });
}

export function renameItem(item: Selection) {
  store().setExplorerTask({ kind: "rename", item });
}

/** Deletes an item: a folder only when empty, an object after the dialog listing what goes with it. */
export function deleteItem(state: ModelState, item: Selection) {
  const { edit, askDeleteObject, select, closeTab } = store();
  if (item.kind === "object") return askDeleteObject(item.id);
  if (item.kind === "folder") {
    const folder = state.folders.get(item.id);
    const why = whyFolderNotDeletable(state, item.id);
    if (!folder) return;
    if (why) return store().notify(`Cannot delete ${folder.name}: ${why.toLowerCase()}`, "error");
    if (edit(`Delete folder ${folder.name}`, [{ edit: "deleteFolder", id: folder.id, contents: "refuseIfNotEmpty" }]))
      select(null);
    return;
  }
  const diagram = state.diagrams.get(item.id);
  if (!diagram) return;
  if (edit(`Delete diagram ${diagram.name}`, [{ edit: "deleteDiagram", id: diagram.id }])) {
    closeTab(diagram.id);
    select(null);
  }
}

/** The right-click menu of one explorer row. */
export function itemMenu(state: ModelState, item: Selection): MenuEntry[] {
  const folderId = targetFolder(state, item);
  const open: MenuEntry[] =
    item.kind === "folder" ? [] : [{ label: "Open", shortcut: "Enter", run: () => openItem(item) }, "separator"];
  const deleteLabel = { folder: "Delete folder", object: "Delete object…", diagram: "Delete diagram" }[item.kind];
  return [
    ...open,
    { label: "New", submenu: newItems(folderId) },
    "separator",
    { label: "Rename", shortcut: "F2", run: () => renameItem(item) },
    "separator",
    {
      label: deleteLabel,
      shortcut: "Del",
      danger: true,
      disabled: item.kind === "folder" ? whyFolderNotDeletable(state, item.id) : null,
      run: () => deleteItem(state, item),
    },
  ];
}

/** The right-click menu of the explorer's empty space. */
export function backgroundMenu(): MenuEntry[] {
  return [
    { label: "New folder", run: () => store().setExplorerTask({ kind: "create", what: "folder", folderId: null }) },
  ];
}

/** The File menu in the top bar: acts on the shared selection. */
export function fileMenu(state: ModelState): MenuEntry[] {
  const { selection, tabs, activeTab, closeTab, closeAllTabs } = store();
  const current = selection && itemName(state, selection) !== undefined ? selection : null;
  const folderId = targetFolder(state, current);
  const none = "Select an item in the explorer first";
  return [
    ...newItems(folderId),
    "separator",
    { label: "Rename", shortcut: "F2", disabled: current ? null : none, run: () => current && renameItem(current) },
    {
      label: "Delete",
      shortcut: "Del",
      danger: true,
      disabled: !current ? none : current.kind === "folder" ? whyFolderNotDeletable(state, current.id) : null,
      run: () => current && deleteItem(state, current),
    },
    "separator",
    { label: "Close tab", disabled: activeTab ? null : "No tab is open", run: () => activeTab && closeTab(activeTab) },
    { label: "Close all tabs", disabled: tabs.length ? null : "No tab is open", run: closeAllTabs },
    "separator",
    { label: "Switch repository…", run: () => navigate({ repositoryId: null, scenarioId: null }) },
    {
      label: "Sign out",
      run: () => {
        navigate({ repositoryId: null, scenarioId: null });
        useAuth.getState().setSignIn(null);
      },
    },
  ];
}
