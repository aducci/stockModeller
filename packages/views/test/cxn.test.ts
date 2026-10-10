// The CXN Builder projection (views-and-design-artifacts.md §15) over the example repository.
import { describe, expect, it } from "vitest";
import { essentials, insuranceGroup } from "@connectome/content";
import { applyChange, Metamodel, ModelState } from "@connectome/engine";
import type { CxnDefinition } from "@connectome/model";
import {
  connectEdits,
  connectionOf,
  connectionOptions,
  disconnectEdits,
  evaluateScope,
  facets,
  planConnect,
  projectCxn,
} from "../src";

const metamodel = Metamodel.compile(essentials.metamodel, essentials.diagramTypes);
const fresh = () => {
  const state = new ModelState();
  const result = applyChange(state, insuranceGroup.baselineChange(), {
    metamodel,
    actor: { kind: "user", id: "U-DANA" },
    scenario: { id: insuranceGroup.baselineScenarioId, isBaseline: true },
    now: "2026-10-07T12:00:00.000Z",
  });
  if (!result.ok) throw new Error(JSON.stringify(result.reasons));
  return state;
};
const state = fresh();
const names = (rows: { object: { name: string } }[]) => rows.map((r) => r.object.name);

const appsToCapabilities: CxnDefinition = {
  rows: { from: { type: ["applicationBase"] } },
  columns: { from: { type: ["capability"] } },
  relationships: { types: ["realizes"], dir: "rowToColumn" },
  create: "realizes",
};

describe("scope filters", () => {
  it("filters by property values, a list value by key", () => {
    const scope = { from: { type: ["applicationBase"], where: { "assessment.technicalFit": { in: ["1", "2"] } } } };
    expect(evaluateScope(state, metamodel, scope).map((o) => o.name)).toEqual(["Claims Manager", "Legacy CRM"]);
  });

  it("filters by abstraction, counting a type's default", () => {
    const scope = { from: { where: { "semantic.abstraction": { in: ["logical"] } }, type: ["interface"] } };
    expect(evaluateScope(state, metamodel, scope).map((o) => o.name)).toEqual(["Claims API", "Payments API"]);
  });

  it("filters by what an object is related to, either way", () => {
    const related = { from: { related: { id: "O-APP-1" } } };
    expect(evaluateScope(state, metamodel, related).map((o) => o.name)).toEqual([
      "Claim",
      "Claim Intake",
      "Claims API",
      "Claims department",
      "Handle Claim",
      "Legacy CRM",
      "Payment confirmations as events or polling",
      "Payments API",
      "Payments Hub",
      "SRV-APP-01",
    ]);
    const byType = { from: { related: { id: "O-APP-1", types: ["flowsTo"] } } };
    expect(evaluateScope(state, metamodel, byType).map((o) => o.name)).toEqual([
      "Legacy CRM",
      "Payments API",
      "Payments Hub",
    ]);
  });
});

describe("CXN Builder", () => {
  it("counts existing connections between the panes and ticks the other side's selection", () => {
    const m = projectCxn(state, metamodel, appsToCapabilities, { left: new Set(["O-APP-1"]), right: new Set() });
    expect(m.connection?.key).toBe("realizes");
    expect(m.existing).toEqual([
      ["O-APP-1", "O-CAP-2"],
      ["O-APP-3", "O-CAP-3"],
    ]);
    expect(names(m.left.rows)).toEqual(["Claims Manager", "Legacy CRM", "Payments Hub"]);
    expect(m.left.rows.map((r) => r.count)).toEqual([1, 0, 1]);
    // The right pane is a tree by containment by default.
    expect(names(m.right.rows)).toEqual(["Claims Management", "Claim Intake", "Claim Settlement"]);
    expect(m.right.rows.map((r) => r.depth)).toEqual([0, 1, 1]);
    expect(m.right.rows.map((r) => r.tick)).toEqual([null, "all", null]);
  });

  it("ticks some when only part of the selection is connected", () => {
    const m = projectCxn(state, metamodel, appsToCapabilities, {
      left: new Set(["O-APP-1", "O-APP-2"]),
      right: new Set(),
    });
    expect(m.right.rows.find((r) => r.object.id === "O-CAP-2")?.tick).toBe("some");
  });

  it("hides connected members and says how many", () => {
    const m = projectCxn(state, metamodel, {
      ...appsToCapabilities,
      panes: { left: { hideConnected: true }, right: { hideConnected: true, shape: "list" } },
    });
    expect(names(m.left.rows)).toEqual(["Legacy CRM"]);
    expect(m.left.hidden).toBe(2);
    expect(names(m.right.rows)).toEqual(["Claims Management"]);
  });

  it("shows a member whose container is filtered out under a heading", () => {
    const m = projectCxn(state, metamodel, {
      ...appsToCapabilities,
      columns: { from: { type: ["capability"], where: { "semantic.abstraction": { in: ["conceptual"] } } } },
      panes: { right: { hideConnected: true } },
      rows: { from: { type: ["application"] } },
    });
    // Claims Manager realizes Claim Intake; Payments Hub (a SaaS application) is not in the left pane.
    expect(m.right.rows.map((r) => [r.object.name, r.depth])).toEqual([
      ["Claims Management", 0],
      ["Claim Settlement", 1],
    ]);
    const tree = projectCxn(state, metamodel, {
      ...appsToCapabilities,
      columns: { from: { type: ["capability"], related: { id: "O-APP-1" } } },
    });
    expect(tree.right.rows.map((r) => [r.object.name, r.depth, r.heading])).toEqual([
      ["Claims Management", 0, true],
      ["Claim Intake", 1, false],
    ]);
  });

  it("offers the allowed relationship types first, the refused ones with a reason, then link kinds", () => {
    const options = connectionOptions(state, metamodel, appsToCapabilities);
    const realizes = options.find((o) => o.value === "type:realizes")!;
    expect(realizes.refused).toBeNull();
    const hosted = options.find((o) => o.value === "type:hostedOn")!;
    expect(hosted.refused).toMatch(/No rule allows/);
    expect(options.indexOf(realizes)).toBeLessThan(options.indexOf(hosted));
    expect(options.at(-1)).toMatchObject({ value: "link:related", kind: "link", refused: null });
  });

  it("plans new, existing and refused pairs, and links them in one change", () => {
    const s = fresh();
    const connection = connectionOf(metamodel, appsToCapabilities)!;
    const plan = planConnect(s, metamodel, connection, ["O-APP-1", "O-APP-2"], ["O-CAP-2", "O-CAP-3"]);
    expect(plan.have).toEqual([["O-APP-1", "O-CAP-2"]]);
    expect(plan.add).toEqual([
      { sourceId: "O-APP-1", targetId: "O-CAP-3" },
      { sourceId: "O-APP-2", targetId: "O-CAP-2" },
      { sourceId: "O-APP-2", targetId: "O-CAP-3" },
    ]);
    expect(plan.refused).toEqual([]);
    const ctx = {
      metamodel,
      actor: { kind: "user" as const, id: "U-DANA" },
      scenario: { id: insuranceGroup.baselineScenarioId, isBaseline: true },
      now: "2026-10-08T12:00:00.000Z",
    };
    const done = applyChange(
      s,
      {
        id: "C-LINK",
        scenarioId: insuranceGroup.baselineScenarioId,
        label: "Link",
        edits: connectEdits(connection, plan.add),
      },
      ctx,
    );
    expect(done.ok ? [] : done.reasons).toEqual([]);
    expect(projectCxn(s, metamodel, appsToCapabilities).existing).toHaveLength(5);
    const pairs = projectCxn(s, metamodel, appsToCapabilities).existing;
    const undone = applyChange(
      s,
      {
        id: "C-UNLINK",
        scenarioId: insuranceGroup.baselineScenarioId,
        label: "Unlink",
        edits: disconnectEdits(s, connection, pairs),
      },
      ctx,
    );
    expect(undone.ok).toBe(true);
    expect(projectCxn(s, metamodel, appsToCapabilities).existing).toEqual([]);
  });

  it("refuses pairs no rule allows, and turns a type allowed only the other way", () => {
    const hostedOn = connectionOf(metamodel, { ...appsToCapabilities, create: "hostedOn" })!;
    const plan = planConnect(state, metamodel, hostedOn, ["O-APP-2"], ["O-CAP-1"]);
    expect(plan.refused[0]?.reason).toMatch(/No rule allows Hosted on between Application and Capability/);
    // Capabilities on the left, applications on the right: realizes still runs application → capability.
    const realizes = connectionOf(metamodel, appsToCapabilities)!;
    expect(planConnect(state, metamodel, realizes, ["O-CAP-1"], ["O-APP-2"]).add).toEqual([
      { sourceId: "O-APP-2", targetId: "O-CAP-1" },
    ]);
  });

  it("links anything to anything with a link kind", () => {
    const s = fresh();
    const related = connectionOf(metamodel, { ...appsToCapabilities, link: "related" })!;
    expect(related.kind).toBe("link");
    const plan = planConnect(s, metamodel, related, ["O-APP-2"], ["O-SRV-1"]);
    expect(plan.add).toEqual([{ sourceId: "O-APP-2", targetId: "O-SRV-1" }]);
    const ctx = {
      metamodel,
      actor: { kind: "user" as const, id: "U-DANA" },
      scenario: { id: insuranceGroup.baselineScenarioId, isBaseline: true },
      now: "2026-10-08T12:00:00.000Z",
    };
    expect(
      applyChange(
        s,
        {
          id: "C-L",
          scenarioId: insuranceGroup.baselineScenarioId,
          label: "Link",
          edits: connectEdits(related, plan.add),
        },
        ctx,
      ).ok,
    ).toBe(true);
    expect(planConnect(s, metamodel, related, ["O-SRV-1"], ["O-APP-2"]).have).toHaveLength(1);
  });

  it("counts list property values among a pane's members", () => {
    const apps = evaluateScope(state, metamodel, { from: { type: ["applicationBase"] } });
    const byKey = Object.fromEntries(facets(metamodel, apps).map((f) => [f.key, f.values]));
    expect(byKey["assessment.technicalFit"]).toEqual([
      { key: "1", label: "1 – poor", count: 1 },
      { key: "2", label: "2", count: 1 },
      { key: "5", label: "5 – excellent", count: 1 },
    ]);
    expect(byKey["semantic.abstraction"]?.map((v) => [v.key, v.count])).toEqual([["implementation", 3]]);
  });
});
