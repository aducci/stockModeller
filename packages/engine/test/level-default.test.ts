// A new object starts at its type's level (decision B57), unless the change sets the level itself.
import { describe, expect, it } from "vitest";
import { apply, applyOk, exampleState } from "./fixtures";

describe("level default", () => {
  it("gives a new object its type's level, inherited or its own, and keeps an explicit one", () => {
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
      create("O-STEP", "process", { "semantic.level": "logical" }),
      create("O-NONE", "process", { "semantic.level": null }),
    ]);
    const level = (id: string) => state.objects.get(id)!.properties["semantic.level"];
    expect(level("O-PROC")).toBe("conceptual");
    expect(level("O-APP")).toBe("implementation");
    expect(level("O-LOC")).toBeUndefined();
    expect(level("O-STEP")).toBe("logical");
    expect(level("O-NONE")).toBeUndefined();
    expect(apply(state, [create("O-X", "nope")]).ok).toBe(false);
  });
});
