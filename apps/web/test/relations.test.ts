import { describe, expect, it } from "vitest";
import { essentials, insuranceGroup } from "@connectome/content";
import { applyChange, Metamodel, ModelState } from "@connectome/engine";
import { meaningGroups, occurrences, reach, relatedObjects, structureGroups } from "../src/relations";
import { addToDiagramPlan } from "../src/diagram";

const metamodel = Metamodel.compile(essentials.metamodel, essentials.diagramTypes);
const state = new ModelState();
applyChange(state, insuranceGroup.baselineChange(), {
  metamodel,
  actor: { kind: "user", id: "U-DANA" },
  scenario: { id: insuranceGroup.baselineScenarioId, isBaseline: true },
  now: "2026-10-06T12:00:00.000Z",
});
const name = (id: string) => state.objects.get(id)!.name;

describe("the Relations window's views", () => {
  it("filters relationships by meaning on the other object's name, its type, the verb or the group", () => {
    const rows = (filter: string) =>
      meaningGroups(state, metamodel, "O-APP-1", filter).flatMap((g) => g.rows.map((r) => name(r.other)));
    expect(rows("payments")).toEqual(["Payments API", "Payments Hub"]);
    expect(rows("SERVES")).toEqual(["Handle Claim"]);
    expect(rows("upstream")).toEqual(["Legacy CRM"]);
    expect(rows("zzz")).toEqual([]);
  });

  it("lists each related object once, with every relationship to it", () => {
    const related = relatedObjects(state, metamodel, "O-APP-1");
    expect(related.map((r) => name(r.objectId))).toEqual([...related.map((r) => name(r.objectId))].sort());
    expect(related.find((r) => name(r.objectId) === "Payments Hub")!.links.map((l) => l.verb)).toEqual(["flows to"]);
  });

  it("reaches along flows both ways, with how many steps away", () => {
    const [down, up] = reach(state, metamodel, "O-APP-1", "flow", 2);
    expect(down!.label).toBe("Downstream");
    expect(down!.steps.map((s) => [name(s.objectId), s.depth])).toContainEqual(["Payments Hub", 1]);
    expect(up!.label).toBe("Upstream");
    expect(up!.steps.map((s) => name(s.objectId))).toContain("Legacy CRM");
    expect(reach(state, metamodel, "O-APP-1", "flow", 2, "legacy")[0]!.steps).toEqual([]);
  });

  it("keeps only structural kinds in the structure view", () => {
    for (const g of structureGroups(state, metamodel, "O-APP-1"))
      expect(["containment", "composition", "aggregation", "specialisation"]).toContain(g.kind);
  });

  it("counts occurrences per diagram and adds an object below what is drawn", () => {
    const [first] = occurrences(state, "O-APP-1");
    expect(first!.count).toBeGreaterThanOrEqual(1);
    const plan = addToDiagramPlan(state, metamodel, first!.diagramId, "O-APP-1", "OCC-NEW");
    expect("edits" in plan && plan.edits[0]).toMatchObject({
      edit: "addObjectOccurrence",
      occurrence: { id: "OCC-NEW", objectId: "O-APP-1", x: 40 },
    });
    expect(occurrences(state, "O-APP-1", "zzz")).toEqual([]);
  });
});
