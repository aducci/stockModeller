// The workbench-wide shortcuts (design/04-ux/workbench.md, "Keyboard"): the keys people know from every editor.
// Text boxes keep their own meaning for the same keys, so typing in one never undoes a model change.

export type WorkbenchShortcut = "undo" | "redo";

interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/** The workbench shortcut a key press asks for, or null. Ctrl on Windows and Linux, ⌘ on a Mac. */
export function workbenchShortcut(e: KeyLike): WorkbenchShortcut | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
  const key = e.key.toLowerCase();
  if (key === "z") return e.shiftKey ? "redo" : "undo";
  if (key === "y" && !e.shiftKey) return "redo";
  return null;
}

/** True when the key press belongs to a text box, a list box or editable text rather than to the workbench. */
export function inTextEntry(target: EventTarget | null): boolean {
  const el = target as { tagName?: string; isContentEditable?: boolean; type?: string } | null;
  if (!el?.tagName) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
  if (el.tagName !== "INPUT") return false;
  return !["checkbox", "radio", "button", "submit", "range", "color"].includes(el.type ?? "text");
}

/** How a shortcut is written next to its menu item on this platform. */
export function shortcutLabel(shortcut: WorkbenchShortcut, mac: boolean): string {
  const mod = mac ? "⌘" : "Ctrl+";
  return shortcut === "undo" ? `${mod}Z` : `${mod}${mac ? "⇧" : "Shift+"}Z`;
}

export const isMac = (): boolean => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
