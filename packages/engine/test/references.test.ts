// Reference properties with many values, and abstraction on relationships (slice DOC-2).
import { describe, expect, it } from "vitest";
import { invertLog } from "../src";
import { apply, applyOk, exampleState, metamodel, snapshot } from "./fixtures";

const flowsOf = (state: ReturnType<typeof exampleState>, id: string) =>
  state.relationships.get(id)!.properties["integration.informationFlows"];

describe("references with many values", () => {
  it("hold several elements of the allowed types, each once", () => {
    const state = exampleState();
    applyOk(state, [{ edit: "createObject", id: "F-1", type: "informationFlow", name: "Status", folderId: "F04" }]);
    const set = (value: unknown) =>
      apply(state, [
        {
          edit: "setRelationshipProperties",
          id: "R-16",
          baseVersion: state.relationships.get("R-16")!.version,
          set: { "integration.informationFlows": value as string[] },
        },
      ]);
    expect(set(["O-FN-1", "F-1"]).ok).toBe(true);
    expect(flowsOf(state, "R-16")).toEqual(["O-FN-1", "F-1"]);
    expect(set(["O-FN-1", "O-FN-1"])).toMatchObject({ ok: false });
    expect(set(["O-APP-1"])).toMatchObject({ ok: false });
    expect(set(["O-NOPE"])).toMatchObject({ ok: false });
  });

  it("let go of a deleted element, and get it back on undo", () => {
    const state = exampleState();
    const before = snapshot(state);
    const fn = state.objects.get("O-FN-1")!;
    const result = applyOk(state, [{ edit: "deleteObject", id: fn.id, baseVersion: fn.version }]);
    expect(flowsOf(state, "R-16")).toBeUndefined();
    applyOk(state, JSON.parse(JSON.stringify(invertLog(result.log))));
    expect(snapshot(state)).toEqual(before);
  });
});

describe("abstraction on relationships", () => {
  it("is the relationship's own, else its type's default", () => {
    const state = exampleState();
    expect(metamodel.relationshipAbstraction(state.relationships.get("R-08")!)).toBe("conceptual");
    expect(metamodel.relationshipAbstraction(state.relationships.get("R-16")!)).toBe("logical");
    expect(metamodel.relationshipAbstraction(state.relationships.get("R-09")!)).toBeUndefined();
  });
});
