import { describe, expect, it } from "vitest";
import { essentials, insuranceGroup } from "@connectome/content";
import { applyChange, Metamodel, ModelState } from "@connectome/engine";
import { objectsUnder, parseCell, viewerColumns } from "../src/object-viewer";

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

describe("object viewer", () => {
  it("lists a folder's objects, and with subfolders their path below it", () => {
    const top = [...state.folders.live()].find(
      (f) => f.parentId === null && state.folders.find("byParent", f.id).length,
    )!;
    const shallow = objectsUnder(state, top.id, false);
    const deep = objectsUnder(state, top.id, true);
    expect(shallow.every((r) => r.path === "" && r.object.folderId === top.id)).toBe(true);
    expect(deep.length).toBeGreaterThan(shallow.length);
    const nested = deep.find((r) => r.path !== "")!;
    expect(state.folders.get(nested.object.folderId)!.name).toBe(nested.path.split(" / ").pop());
    const names = deep.map((r) => r.object.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("shows the properties every listed type carries", () => {
    const one = viewerColumns(metamodel, ["application"]).map((p) => p.key);
    expect(one).toContain("semantic.level");
    expect(one.length).toBeLessThanOrEqual(8);
    const mixed = viewerColumns(metamodel, ["application", "capability"]).map((p) => p.key);
    const carries = (type: string, key: string) => metamodel.objectType(type)!.properties.has(key);
    expect(mixed.every((k) => carries("application", k) && carries("capability", k))).toBe(true);
    expect(mixed[0]).toBe("semantic.level");
    expect(viewerColumns(metamodel, [])).toEqual([]);
  });

  it("reads typed cells", () => {
    const number = { key: "n", name: "N", group: "g", dataType: "number" as const };
    expect(parseCell(number, " 42 ")).toBe(42);
    expect(parseCell(number, "x")).toBeUndefined();
    expect(parseCell(number, "")).toBeNull();
    expect(parseCell({ ...number, dataType: "text" }, " a ")).toBe("a");
  });
});
