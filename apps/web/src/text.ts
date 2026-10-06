// Words the workbench shows (design/04-ux/design-system.md §4: say exactly what happens).
import type { SessionStatus } from "@connectome/client";
import type { ModelState } from "@connectome/engine";
import type { Id, Rejection } from "@connectome/model";

/** Why the server (or the engine, locally) refused a change, in the user's words. */
export function describeRejection(reason: Rejection): string {
  switch (reason.code) {
    case "conflict":
      return `${reason.changedBy} changed this just now. Their change was kept.`;
    case "gone":
      return "It was deleted meanwhile, so your change was undone.";
    case "ruleViolation":
      return reason.message;
    case "invalid":
      return reason.message;
    case "forbidden":
      return reason.scope === "offline"
        ? "You have been offline for a while: editing is paused until the connection returns."
        : `You may not make this change (${reason.scope}).`;
  }
}

/** The quiet save indicator in the top bar: no Save button, just the state. */
export function saveState(status: SessionStatus, pending: number): { text: string; tone: "ok" | "busy" | "warn" } {
  switch (status) {
    case "connecting":
      return { text: "Connecting…", tone: "busy" };
    case "reconnecting":
      return { text: "Reconnecting…", tone: "warn" };
    case "paused":
      return { text: "Offline: editing paused", tone: "warn" };
    case "closed":
      return { text: "Disconnected", tone: "warn" };
    case "live":
      return pending > 0 ? { text: "Saving…", tone: "busy" } : { text: "All changes saved", tone: "ok" };
  }
}

/** Folder names from the root down to a folder (the breadcrumb). */
export function folderPath(state: ModelState, folderId: Id | null): string[] {
  const names: string[] = [];
  const seen = new Set<Id>();
  for (let id = folderId; id && !seen.has(id);) {
    seen.add(id);
    const folder = state.folders.get(id);
    if (!folder) break;
    names.unshift(folder.name);
    id = folder.parentId;
  }
  return names;
}

/** Sorts by name the way people read lists (numbers in order, case ignored). */
export const byName = <T extends { name: string }>(a: T, b: T) =>
  a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
