// The concurrency table of design/03-platform/collaboration-and-changes.md §2.
// Each "user" submits edits based on the version they saw; the server applies changes in arrival order.
import { describe, expect, it } from "vitest";
import { apply, applyOk, dana, exampleState, lee } from "./fixtures";

describe("concurrent edits", () => {
  it("applies an edit when nobody else touched the item", () => {
    const state = exampleState();
    const result = applyOk(state, [{ edit: "renameObject", id: "O-APP-1", baseVersion: 1, name: "Claims Hub" }]);
    expect(result.versions).toEqual({ "O-APP-1": 2 });
  });

  it("keeps both edits when two people change different properties (A renames while B sets the owner)", () => {
    const state = exampleState();
    applyOk(state, [{ edit: "renameObject", id: "O-APP-1", baseVersion: 1, name: "Claims Hub" }], { actor: dana });
    applyOk(
      state,
      [{ edit: "setProperties", id: "O-APP-1", baseVersion: 1, set: { "ownership.businessOwner": "lee@example.com" } }],
      {
        actor: lee,
      },
    );
    const obj = state.objects.get("O-APP-1")!;
    expect(obj.name).toBe("Claims Hub");
    expect(obj.properties["ownership.businessOwner"]).toBe("lee@example.com");
    expect(obj.version).toBe(3);
  });

  it("treats each property separately, also inside setProperties", () => {
    const state = exampleState();
    applyOk(
      state,
      [{ edit: "setProperties", id: "O-APP-1", baseVersion: 1, set: { "lifecycle.status": "phaseOut" } }],
      { actor: dana },
    );
    applyOk(state, [{ edit: "setProperties", id: "O-APP-1", baseVersion: 1, set: { "technical.users": 10 } }], {
      actor: lee,
    });
  });

  it("rejects an edit to the same property, naming who changed it", () => {
    const state = exampleState();
    applyOk(state, [{ edit: "renameObject", id: "O-APP-1", baseVersion: 1, name: "Claims Hub" }], { actor: dana });
    const result = apply(state, [{ edit: "renameObject", id: "O-APP-1", baseVersion: 1, name: "Claims Central" }], {
      actor: lee,
    });
    expect(result).toEqual({
      ok: false,
      reasons: [{ code: "conflict", editIndex: 0, property: "name", changedBy: dana.id }],
    });
  });

  it("accepts the same edit once rebased on the latest version", () => {
    const state = exampleState();
    applyOk(state, [{ edit: "renameObject", id: "O-APP-1", baseVersion: 1, name: "Claims Hub" }], { actor: dana });
    applyOk(state, [{ edit: "renameObject", id: "O-APP-1", baseVersion: 2, name: "Claims Central" }], { actor: lee });
    expect(state.objects.get("O-APP-1")!.name).toBe("Claims Central");
  });

  it("rejects an edit to an item deleted meanwhile as gone", () => {
    const state = exampleState();
    applyOk(state, [{ edit: "deleteObject", id: "O-SRV-1", baseVersion: 1 }], { actor: dana });
    const result = apply(state, [{ edit: "renameObject", id: "O-SRV-1", baseVersion: 1, name: "SRV-02" }], {
      actor: lee,
    });
    expect(result).toEqual({ ok: false, reasons: [{ code: "gone", editIndex: 0, itemId: "O-SRV-1" }] });
  });

  it("rejects an edit whose target was deleted meanwhile", () => {
    const state = exampleState();
    applyOk(state, [{ edit: "deleteFolder", id: "F07", contents: "refuseIfNotEmpty" }], { actor: dana });
    const result = apply(state, [{ edit: "moveToFolder", id: "O-SRV-1", baseVersion: 1, folderId: "F07" }], {
      actor: lee,
    });
    expect(result).toMatchObject({ ok: false, reasons: [{ code: "gone", itemId: "F07" }] });
  });

  it("rejects deleting an item someone changed since you saw it", () => {
    const state = exampleState();
    applyOk(state, [{ edit: "renameObject", id: "O-SRV-1", baseVersion: 1, name: "SRV-02" }], { actor: dana });
    const result = apply(state, [{ edit: "deleteObject", id: "O-SRV-1", baseVersion: 1 }], { actor: lee });
    expect(result).toMatchObject({ ok: false, reasons: [{ code: "conflict", property: "*", changedBy: dana.id }] });
  });

  it("rejects a base version from the future", () => {
    const result = apply(exampleState(), [{ edit: "renameObject", id: "O-APP-1", baseVersion: 7, name: "X" }]);
    expect(result).toMatchObject({ ok: false, reasons: [{ code: "invalid", property: "baseVersion" }] });
  });

  it("lets the last writer win on layout, with no prompt", () => {
    const state = exampleState();
    const move = (x: number) =>
      ({ edit: "moveObjectOccurrence", diagramId: "D-01", occurrenceId: "OO-4", x, y: 0 }) as const;
    applyOk(state, [move(100)], { actor: dana });
    applyOk(state, [move(200)], { actor: lee });
    expect(state.objectOccurrences.get("OO-4")!.x).toBe(200);
  });

  it("validation scenario 4: one renames an object while the other moves its occurrence; both survive", () => {
    const state = exampleState();
    applyOk(state, [{ edit: "renameObject", id: "O-APP-1", baseVersion: 1, name: "Claims Hub" }], { actor: dana });
    applyOk(state, [{ edit: "moveObjectOccurrence", diagramId: "D-01", occurrenceId: "OO-4", x: 75, y: 120 }], {
      actor: lee,
    });
    expect(state.objects.get("O-APP-1")!.name).toBe("Claims Hub");
    expect(state.objectOccurrences.get("OO-4")).toMatchObject({ x: 75, y: 120 });
  });

  it("raises an item's version once per change, however many edits touch it", () => {
    const state = exampleState();
    const result = applyOk(state, [
      { edit: "renameObject", id: "O-APP-1", baseVersion: 1, name: "Claims Hub" },
      { edit: "setTags", id: "O-APP-1", baseVersion: 1, tags: ["core"] },
      { edit: "setProperties", id: "O-APP-1", baseVersion: 1, set: { "technical.users": 1 } },
    ]);
    expect(result.versions).toEqual({ "O-APP-1": 2 });
    // and the inverses all start from that version
    for (const entry of result.log) expect(entry.inverse).toEqual([expect.objectContaining({ baseVersion: 2 })]);
  });

  it("allows editing an item created earlier in the same change", () => {
    const state = exampleState();
    applyOk(state, [
      { edit: "createObject", id: "N1", type: "server", name: "SRV-NEW", folderId: "F05" },
      { edit: "setProperties", id: "N1", baseVersion: 1, set: { "lifecycle.status": "planned" } },
    ]);
    expect(state.objects.get("N1")!.version).toBe(1);
  });
});
