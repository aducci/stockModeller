// Pure helpers behind the explorer's menus (design/04-ux/workbench.md, "Menus"): where new items go and what
// a folder holds. Kept free of React so they are unit-tested.
import type { ModelState } from "@connectome/engine";
import type { Id } from "@connectome/model";
import type { Selection as Item } from "./state/workbench";

/** The folder new items go into: the selected folder, or the folder of the selected item. */
export function targetFolder(state: ModelState, item: Item | null): Id | null {
  if (!item) return null;
  if (item.kind === "folder") return state.folders.get(item.id) ? item.id : null;
  if (item.kind === "object") return state.objects.get(item.id)?.folderId ?? null;
  return state.diagrams.get(item.id)?.folderId ?? null;
}

/** A folder and its parents up to the top level (ids, nearest first). */
export function folderChain(state: ModelState, folderId: Id | null): Id[] {
  const chain: Id[] = [];
  for (let id = folderId; id && !chain.includes(id); id = state.folders.get(id)?.parentId ?? null) {
    if (!state.folders.get(id)) break;
    chain.push(id);
  }
  return chain;
}

/** Names of what a folder holds (subfolders, diagrams, objects); empty when it can be deleted as is. */
export function folderContents(state: ModelState, folderId: Id): string[] {
  return [
    ...state.folders.find("byParent", folderId),
    ...state.diagrams.find("byFolder", folderId),
    ...state.objects.find("byFolder", folderId),
  ].map((i) => i.name);
}

/** The item's current name, or undefined once it is gone. */
export function itemName(state: ModelState, item: Item): string | undefined {
  const row =
    item.kind === "folder"
      ? state.folders.get(item.id)
      : item.kind === "object"
        ? state.objects.get(item.id)
        : state.diagrams.get(item.id);
  return row?.name;
}

/** Why a folder cannot be deleted as it is, or null when it can. */
export function whyFolderNotDeletable(state: ModelState, folderId: Id): string | null {
  const contents = folderContents(state, folderId);
  if (contents.length === 0) return null;
  return `Not empty: holds ${contents.length} item${contents.length === 1 ? "" : "s"}`;
}

/** Keeps a menu inside the viewport: shifts it left or up when it would overflow. */
export function clampMenu(
  x: number,
  y: number,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
): { x: number; y: number } {
  const margin = 4;
  return {
    x: Math.max(margin, Math.min(x, viewport.width - size.width - margin)),
    y: Math.max(margin, Math.min(y, viewport.height - size.height - margin)),
  };
}
