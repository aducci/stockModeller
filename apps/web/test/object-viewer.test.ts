import { describe, expect, it } from "vitest";
import { essentials, insuranceGroup } from "@connectome/content";
import { applyChange, Metamodel, ModelState } from "@connectome/engine";
import {
  addChoices,
  addEdits,
  columnChoices,
  defaultChildType,
  objectsUnder,
  parseCell,
  targetChain,
  viewerColumns,
  viewerTree,
} from "../src/object-viewer";

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
  it("shows a folder's subfolders, objects and their contents as the explorer does", () => {
    const tree = viewerTree(state, metamodel, "F01");
    const line = (r: (typeof tree)[number]) => `${"  ".repeat(r.depth)}${r.kind === "folder" ? "/" : ""}${r.name}`;
    expect(tree.map(line)).toEqual(
      expect.arrayContaining(["/Capabilities", "  Claims Management", "    Claim Intake"]),
    );
    const at = (name: string) => tree.findIndex((r) => r.name === name);
    expect(at("Claims Management")).toBeLessThan(at("Claim Intake"));
    expect(tree.find((r) => r.name === "Claims Management")).toMatchObject({ hasChildren: true, path: "Capabilities" });
    // A collapsed row hides what is below it.
    const closed = viewerTree(state, metamodel, "F01", new Set(["O-CAP-1"]));
    expect(closed.some((r) => r.name === "Claim Intake")).toBe(false);
    expect(closed.some((r) => r.name === "Claims Management")).toBe(true);
  });

  it("lists every object under a folder flat, contents too, with its folder path, by name", () => {
    const flat = objectsUnder(state, metamodel, "F01");
    expect(flat.every((r) => r.kind === "object" && r.depth === 0)).toBe(true);
    expect(flat.find((r) => r.name === "Assess Claim")!.path).toBe("Processes");
    const names = flat.map((r) => r.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("adds inside an object only what a containment rule allows, starting with the type its contents have", () => {
    const process = { kind: "object" as const, id: "O-PRC-1" };
    const choices = addChoices(state, metamodel, process);
    expect(choices.map((c) => c.type.definition.key)).toContain("processStep");
    expect(choices.every((c) => c.relationshipType === "contains")).toBe(true);
    expect(choices.length).toBeLessThan(addChoices(state, metamodel, { kind: "folder", id: "F03" }).length);
    expect(defaultChildType(state, metamodel, "O-PRC-1", choices)).toBe("processStep");
    expect(
      defaultChildType(state, metamodel, "O-CAP-2", addChoices(state, metamodel, { kind: "object", id: "O-CAP-2" })),
    ).toBe("capability");

    const plan = addEdits(
      state,
      process,
      choices.find((c) => c.type.definition.key === "processStep")!,
      "Close Claim",
    );
    if ("error" in plan) throw new Error(plan.error);
    const mine = exampleState();
    const result = applyChange(
      mine,
      { id: "C-ADD", scenarioId: insuranceGroup.baselineScenarioId, label: plan.label, edits: plan.edits },
      {
        metamodel,
        actor: { kind: "user", id: "U-DANA" },
        scenario: { id: insuranceGroup.baselineScenarioId, isBaseline: true },
      },
    );
    if (!result.ok) throw new Error(JSON.stringify(result.reasons));
    const after = viewerTree(mine, metamodel, "F03");
    expect(after.find((r) => r.name === "Close Claim")).toMatchObject({ depth: 1, kind: "object" });
    expect(targetChain(mine, metamodel, { kind: "object", id: plan.id }, "F01")).toEqual([plan.id, "O-PRC-1", "F03"]);
  });

  it("shows no property columns until some are chosen, and offers what any listed type carries", () => {
    expect(viewerColumns(metamodel, [])).toEqual([]);
    expect(viewerColumns(metamodel, ["semantic.abstraction", "nope"]).map((p) => p.key)).toEqual([
      "semantic.abstraction",
    ]);
    const offered = columnChoices(metamodel, ["application", "capability"]).map((p) => p.key);
    const carried = (t: string) => [...metamodel.objectType(t)!.properties];
    expect(offered).toEqual(
      expect.arrayContaining(
        [...carried("application"), ...carried("capability")].filter(
          (k) => metamodel.propertyType(k)?.dataType !== "calculated",
        ),
      ),
    );
  });

  it("reads typed cells", () => {
    const number = { key: "n", name: "N", group: "g", dataType: "number" as const };
    expect(parseCell(number, " 42 ")).toBe(42);
    expect(parseCell(number, "x")).toBeUndefined();
    expect(parseCell(number, "")).toBeNull();
    expect(parseCell({ ...number, dataType: "text" }, " a ")).toBe("a");
  });
});
