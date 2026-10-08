import { describe, expect, it } from "vitest";
import { essentials, insuranceGroup } from "@connectome/content";
import { applyChange, Metamodel, ModelState } from "@connectome/engine";
import { clampMenu, folderChain, folderContents, itemName, targetFolder, whyFolderNotDeletable } from "../src/explorer";

const metamodel = Metamodel.compile(essentials.metamodel, essentials.diagramTypes);

function exampleState(): ModelState {
  const state = new ModelState();
  const result = applyChange(state, insuranceGroup.baselineChange(), {
    metamodel,
    actor: { kind: "user", id: "U-DANA" },
    scenario: { id: insuranceGroup.baselineScenarioId, isBaseline: true },
    now: "2026-10-06T12:00:00.000Z",
  });
  if (!result.ok) throw new Error(JSON.stringify(result.reasons));
  return state;
}

const state = exampleState();

describe("explorer menu helpers", () => {
  it("puts new items into the selected folder, or the selected item's folder", () => {
    expect(targetFolder(state, null)).toBeNull();
    expect(targetFolder(state, { kind: "folder", id: "F02" })).toBe("F02");
    expect(targetFolder(state, { kind: "object", id: "O-APP-1" })).toBe("F04");
    expect(targetFolder(state, { kind: "diagram", id: "D-01" })).toBe(state.diagrams.get("D-01")!.folderId);
    expect(targetFolder(state, { kind: "folder", id: "F-GONE" })).toBeNull();
  });

  it("walks from a folder up to the top level", () => {
    expect(folderChain(state, "F02")).toEqual(["F02", "F01"]);
    expect(folderChain(state, null)).toEqual([]);
  });

  it("lets only an empty folder be deleted, and says why otherwise", () => {
    expect(folderContents(state, "F01").sort()).toEqual(["Capabilities", "Claims department", "Processes"]);
    expect(whyFolderNotDeletable(state, "F01")).toBe("Not empty: holds 3 items");
    expect(whyFolderNotDeletable(state, "F07")).toBeNull();
  });

  it("names items, and nothing once they are gone", () => {
    expect(itemName(state, { kind: "object", id: "O-APP-2" })).toBe("Legacy CRM");
    expect(itemName(state, { kind: "folder", id: "F04" })).toBe("Applications");
    expect(itemName(state, { kind: "object", id: "O-GONE" })).toBeUndefined();
  });

  it("keeps a menu inside the window", () => {
    const size = { width: 200, height: 100 };
    const viewport = { width: 800, height: 600 };
    expect(clampMenu(100, 100, size, viewport)).toEqual({ x: 100, y: 100 });
    expect(clampMenu(700, 550, size, viewport)).toEqual({ x: 596, y: 496 });
    expect(clampMenu(-10, -10, size, viewport)).toEqual({ x: 4, y: 4 });
  });
});
