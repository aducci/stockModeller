// A new object starts at its type's abstraction (decision B57), unless the change sets the abstraction itself.
import { describe, expect, it } from "vitest";
import { apply, applyOk, exampleState } from "./fixtures";

describe("abstraction default", () => {
  it("gives a new object its type's abstraction, inherited or its own, and keeps an explicit one", () => {
    const state = exampleState();
    const folderId = [...state.folders.live()][0]!.id;
    const create = (id: string, type: string, properties?: Record<string, string | null>) => ({
      edit: "createObject" as const,
      id,
      type,
      name: id,
      folderId,
      ...(properties ? { properties } : {}),
    });
    applyOk(state, [
      create("O-PROC", "process"),
      create("O-APP", "application"),
      create("O-LOC", "location"),
      create("O-STEP", "process", { "semantic.abstraction": "logical" }),
      create("O-NONE", "process", { "semantic.abstraction": null }),
    ]);
    const abstraction = (id: string) => state.objects.get(id)!.properties["semantic.abstraction"];
    expect(abstraction("O-PROC")).toBe("conceptual");
    expect(abstraction("O-APP")).toBe("implementation");
    expect(abstraction("O-LOC")).toBeUndefined();
    expect(abstraction("O-STEP")).toBe("logical");
    expect(abstraction("O-NONE")).toBeUndefined();
    expect(apply(state, [create("O-X", "nope")]).ok).toBe(false);
  });
});
