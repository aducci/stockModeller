// Explorer order (setRank, storage.md §7) and groups (Essentials `group` + `groups`, decision B22).
import { describe, expect, it } from "vitest";
import { invertLog } from "../src";
import { apply, applyOk, exampleState, lee, metamodel } from "./fixtures";

describe("explorer order", () => {
  it("ranks folders, objects and diagrams, and null drops the rank", () => {
    const state = exampleState();
    applyOk(state, [
      { edit: "setRank", item: "folder", id: "F04", rank: "a0" },
      { edit: "setRank", item: "object", id: "O-APP-1", rank: "a1" },
      { edit: "setRank", item: "diagram", id: "D-01", rank: "a2" },
    ]);
    expect(state.folders.get("F04")!.rank).toBe("a0");
    expect(state.objects.get("O-APP-1")!.rank).toBe("a1");
    expect(state.diagrams.get("D-01")!.rank).toBe("a2");

    applyOk(state, [{ edit: "setRank", item: "object", id: "O-APP-1", rank: null }]);
    expect("rank" in state.objects.get("O-APP-1")!).toBe(false);
  });

  it("logs the old rank as the inverse", () => {
    const state = exampleState();
    applyOk(state, [{ edit: "setRank", item: "object", id: "O-APP-1", rank: "a1" }]);
    const result = applyOk(state, [{ edit: "setRank", item: "object", id: "O-APP-1", rank: "b" }]);
    expect(invertLog(result.log)).toEqual([{ edit: "setRank", item: "object", id: "O-APP-1", rank: "a1" }]);
  });

  it("is last writer wins, and does not conflict with a rename made meanwhile", () => {
    const state = exampleState();
    const app = state.objects.get("O-APP-1")!;
    applyOk(state, [{ edit: "setRank", item: "object", id: app.id, rank: "a1" }]);
    applyOk(state, [{ edit: "renameObject", id: app.id, baseVersion: app.version, name: "Claims Hub" }], {
      actor: lee,
    });
    expect(state.objects.get(app.id)).toMatchObject({ name: "Claims Hub", rank: "a1" });
  });

  it("refuses an empty rank and a missing item", () => {
    const state = exampleState();
    expect(apply(state, [{ edit: "setRank", item: "folder", id: "F04", rank: "" }]).ok).toBe(false);
    expect(apply(state, [{ edit: "setRank", item: "diagram", id: "D-NONE", rank: "a" }]).ok).toBe(false);
  });

  it("compiles with Essentials", () => {
    expect(metamodel.allDiagramTypes().length).toBeGreaterThan(0);
  });
});

describe("groups", () => {
  it("groups any objects without moving them, and an object may be in several groups", () => {
    const state = exampleState();
    applyOk(state, [
      { edit: "createObject", id: "G-1", type: "group", name: "Claims tooling", folderId: "F04" },
      { edit: "createObject", id: "G-2", type: "group", name: "Customer facing", folderId: "F02" },
      { edit: "createRelationship", id: "R-G1", type: "groups", sourceId: "G-1", targetId: "O-APP-1" },
      { edit: "createRelationship", id: "R-G2", type: "groups", sourceId: "G-1", targetId: "O-CAP-1" },
      { edit: "createRelationship", id: "R-G3", type: "groups", sourceId: "G-2", targetId: "O-APP-1" },
      { edit: "createRelationship", id: "R-G4", type: "groups", sourceId: "G-1", targetId: "G-2" },
    ]);
    expect(state.objects.get("O-APP-1")!.folderId).toBe("F04");
    expect(state.objects.get("O-CAP-1")!.folderId).toBe("F02");
    expect(state.objects.get("G-2")!.folderId).toBe("F02");
    expect(metamodel.relationshipType("groups")).toMatchObject({ semantic: "aggregation" });
  });

  it("only a group groups", () => {
    const state = exampleState();
    const result = apply(state, [
      { edit: "createRelationship", id: "R-X", type: "groups", sourceId: "O-APP-1", targetId: "O-APP-2" },
    ]);
    expect(result.ok).toBe(false);
  });
});
