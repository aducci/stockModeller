import { describe, expect, it } from "vitest";
import { inTextEntry, shortcutLabel, workbenchShortcut } from "../src/keys";

const press = (key: string, mods: Partial<{ ctrl: boolean; meta: boolean; shift: boolean; alt: boolean }> = {}) => ({
  key,
  ctrlKey: mods.ctrl ?? false,
  metaKey: mods.meta ?? false,
  shiftKey: mods.shift ?? false,
  altKey: mods.alt ?? false,
});

describe("workbench shortcuts", () => {
  it("undoes with Ctrl+Z or ⌘Z", () => {
    expect(workbenchShortcut(press("z", { ctrl: true }))).toBe("undo");
    expect(workbenchShortcut(press("z", { meta: true }))).toBe("undo");
  });

  it("redoes with Ctrl+Shift+Z, ⌘⇧Z or Ctrl+Y", () => {
    expect(workbenchShortcut(press("Z", { ctrl: true, shift: true }))).toBe("redo");
    expect(workbenchShortcut(press("z", { meta: true, shift: true }))).toBe("redo");
    expect(workbenchShortcut(press("y", { ctrl: true }))).toBe("redo");
  });

  it("ignores the keys without Ctrl or ⌘, and with Alt", () => {
    expect(workbenchShortcut(press("z"))).toBeNull();
    expect(workbenchShortcut(press("z", { ctrl: true, alt: true }))).toBeNull();
    expect(workbenchShortcut(press("x", { ctrl: true }))).toBeNull();
  });

  it("leaves text boxes their own undo", () => {
    expect(inTextEntry({ tagName: "INPUT", type: "text" } as unknown as EventTarget)).toBe(true);
    expect(inTextEntry({ tagName: "TEXTAREA" } as unknown as EventTarget)).toBe(true);
    expect(inTextEntry({ tagName: "DIV", isContentEditable: true } as unknown as EventTarget)).toBe(true);
    expect(inTextEntry({ tagName: "INPUT", type: "checkbox" } as unknown as EventTarget)).toBe(false);
    expect(inTextEntry({ tagName: "BUTTON" } as unknown as EventTarget)).toBe(false);
    expect(inTextEntry(null)).toBe(false);
  });

  it("writes the shortcut the platform's way", () => {
    expect(shortcutLabel("undo", false)).toBe("Ctrl+Z");
    expect(shortcutLabel("redo", false)).toBe("Ctrl+Shift+Z");
    expect(shortcutLabel("redo", true)).toBe("⌘⇧Z");
  });
});
