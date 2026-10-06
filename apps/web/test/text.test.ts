import { describe, expect, it } from "vitest";
import { ModelState } from "@connectome/engine";
import { describeRejection, folderPath, saveState } from "../src/text";

describe("workbench wording", () => {
  it("says whether changes are saved, without a Save button", () => {
    expect(saveState("live", 0)).toEqual({ text: "All changes saved", tone: "ok" });
    expect(saveState("live", 2).text).toBe("Saving…");
    expect(saveState("reconnecting", 1).text).toBe("Reconnecting…");
    expect(saveState("paused", 1).tone).toBe("warn");
  });

  it("explains rejections in the user's words", () => {
    expect(describeRejection({ code: "conflict", editIndex: 0, property: "name", changedBy: "dana" })).toBe(
      "dana changed this just now. Their change was kept.",
    );
    expect(describeRejection({ code: "gone", editIndex: 0, itemId: "X" })).toMatch(/deleted meanwhile/);
    expect(describeRejection({ code: "forbidden", editIndex: 0, scope: "offline" })).toMatch(/editing is paused/);
  });

  it("builds a folder breadcrumb, and stops on a cycle", () => {
    const state = new ModelState();
    state.load("folders", [
      { id: "A", parentId: null, name: "Business", deleted: false },
      { id: "B", parentId: "A", name: "Capabilities", deleted: false },
      { id: "C", parentId: "D", name: "Loop 1", deleted: false },
      { id: "D", parentId: "C", name: "Loop 2", deleted: false },
    ]);
    expect(folderPath(state, "B")).toEqual(["Business", "Capabilities"]);
    expect(folderPath(state, null)).toEqual([]);
    expect(folderPath(state, "C")).toEqual(["Loop 2", "Loop 1"]);
  });
});
