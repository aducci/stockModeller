// The matrix projection (views-and-design-artifacts.md §4) over the example repository.
import { describe, expect, it } from "vitest";
import { essentials, insuranceGroup } from "@connectome/content";
import { applyChange, Metamodel, ModelState } from "@connectome/engine";
import type { MatrixDefinition } from "@connectome/model";
import { evaluateScope, matrixDefinition, projectMatrix } from "../src";

const metamodel = Metamodel.compile(essentials.metamodel, essentials.diagramTypes);
const state = new ModelState();
const result = applyChange(state, insuranceGroup.baselineChange(), {
  metamodel,
  actor: { kind: "user", id: "U-DANA" },
  scenario: { id: insuranceGroup.baselineScenarioId, isBaseline: true },
  now: "2026-10-07T12:00:00.000Z",
});
if (!result.ok) throw new Error(JSON.stringify(result.reasons));

const capabilityByApplication: MatrixDefinition = {
  rows: { from: { type: ["capability"] } },
  columns: { from: { type: ["applicationBase"] } },
  relationships: { types: ["realizes"], dir: "columnToRow" },
  groupRows: true,
};
const names = (items: { object: { name: string } }[]) => items.map((i) => i.object.name);

describe("scopes", () => {
  it("selects by type, including subtypes, ordered by name", () => {
    expect(evaluateScope(state, metamodel, { from: { type: ["applicationBase"] } }).map((o) => o.name)).toEqual([
      "Claims Manager",
      "Legacy CRM",
      "Payments Hub",
    ]);
  });

  it("follows steps by kind and direction, filtering what they reach", () => {
    const scope = {
      from: { type: ["capability"] },
      steps: [{ kind: ["realisation" as const], dir: "in" as const, to: { type: ["saasApplication"] } }],
    };
    expect(evaluateScope(state, metamodel, scope).map((o) => o.name)).toEqual(["Payments Hub"]);
  });

  it("selects by semantic category", () => {
    const names = evaluateScope(state, metamodel, { from: { category: ["technology"] } }).map((o) => o.name);
    expect(names).toEqual(["SRV-APP-01"]);
  });
});

describe("matrix", () => {
  it("groups rows by containment and fills cells with the matching relationships", () => {
    const m = projectMatrix(state, metamodel, capabilityByApplication);
    expect(names(m.rows)).toEqual(["Claims Management", "Claim Intake", "Claim Settlement"]);
    expect(m.rows.map((r) => r.depth)).toEqual([0, 1, 1]);
    expect(m.rows[0]!.hasChildren).toBe(true);
    expect(names(m.columns)).toEqual(["Claims Manager", "Legacy CRM", "Payments Hub"]);
    expect(m.cell("O-CAP-2", "O-APP-1").map((r) => r.id)).toEqual(["R-05"]);
    expect(m.cell("O-CAP-3", "O-APP-3").map((r) => r.id)).toEqual(["R-06"]);
    expect(m.cell("O-CAP-2", "O-APP-3")).toEqual([]);
    expect(m.rowTotal("O-CAP-1")).toBe(0);
    expect(m.columnTotal("O-APP-1")).toBe(1);
  });

  it("ignores relationships running the other way", () => {
    const m = projectMatrix(state, metamodel, { ...capabilityByApplication, relationships: { types: ["realizes"] } });
    expect(m.cell("O-CAP-2", "O-APP-1")).toEqual([]);
  });

  it("hides empty columns, and empty rows unless something inside them is filled", () => {
    const m = projectMatrix(state, metamodel, { ...capabilityByApplication, hideEmpty: true });
    expect(names(m.rows)).toEqual(["Claims Management", "Claim Intake", "Claim Settlement"]);
    expect(names(m.columns)).toEqual(["Claims Manager", "Payments Hub"]);
    const ungrouped = projectMatrix(state, metamodel, {
      ...capabilityByApplication,
      groupRows: false,
      hideEmpty: true,
    });
    expect(names(ungrouped.rows)).toEqual(["Claim Intake", "Claim Settlement"]);
  });

  it("offers the relationship types the rules allow, the right way round", () => {
    const m = projectMatrix(state, metamodel, capabilityByApplication);
    expect(m.options("O-CAP-2", "O-APP-3")).toEqual([
      { type: "realizes", name: "realizes", sourceId: "O-APP-3", targetId: "O-CAP-2" },
    ]);
    const processes = projectMatrix(state, metamodel, {
      ...capabilityByApplication,
      rows: { from: { type: ["server"] } },
    });
    expect(processes.options("O-SRV-1", "O-APP-1")).toEqual([]);
  });

  it("merges the diagram's own keys over its type's matrix", () => {
    const type = essentials.diagramTypes.find((t) => t.kind === "matrix");
    const def = matrixDefinition(type, { hideEmpty: true });
    expect(def.hideEmpty).toBe(true);
    expect(def.rows).toEqual(type!.matrix!.rows);
  });
});
