// Property usage and the impact of publishing a new metamodel (slice A-1b; design/02-model/metamodel.md §7).
import { describe, expect, it } from "vitest";
import { essentials } from "@connectome/content";
import type { MetamodelPackage } from "@connectome/model";
import { Metamodel, ModelState, metamodelImpact, propertyUsage, strandedValues } from "../src";
import { exampleState, metamodel } from "./fixtures";

const compile = (change: (pkg: MetamodelPackage) => void) => {
  const pkg = structuredClone(essentials.metamodel);
  change(pkg);
  return Metamodel.compile(pkg, essentials.diagramTypes);
};

describe("property usage", () => {
  const state = exampleState();

  it("counts the items holding a value for each property", () => {
    const usage = propertyUsage(state);
    expect(usage.get("lifecycle.status")).toEqual({ objects: 5, relationships: 0, diagrams: 0 });
    expect(strandedValues(state, metamodel).size).toBe(0);
  });

  it("reports values a type stops carrying, and keeps a publish that only strands values", () => {
    const after = compile((pkg) => {
      const server = pkg.objectTypes.find((t) => t.key === "server")!;
      server.properties = server.properties!.filter((p) => p !== "lifecycle.status");
    });
    expect(metamodelImpact(state, metamodel, after)).toEqual({
      stranded: [{ propertyType: "lifecycle.status", count: 1 }],
      problems: [],
    });
  });

  it("refuses removing a type in use, changing a data type with values, and removing a list value in use", () => {
    const after = compile((pkg) => {
      pkg.objectTypes = pkg.objectTypes.filter((t) => t.key !== "server");
      pkg.relationshipRules = pkg.relationshipRules!.filter(
        (r) => r.sourceType !== "server" && r.targetType !== "server",
      );
      const fit = pkg.propertyTypes!.find((p) => p.key === "cost.runCost")!;
      fit.dataType = "text";
      delete fit.unit;
      const status = pkg.valueLists!.find((l) => l.key === "lifecycleStatus")!;
      status.values = status.values.filter((v) => v.key !== "active");
    });
    const { problems } = metamodelImpact(state, metamodel, after);
    expect(problems.some((p) => p.includes('Object type "server" is removed'))).toBe(true);
    expect(problems.some((p) => p.includes("data type cannot change"))).toBe(true);
    expect(problems.some((p) => p.includes('value "active" is removed'))).toBe(true);
  });

  it("refuses changing the kind of a diagram type that diagrams use, and allows it for an unused one", () => {
    const retyped = (key: string) =>
      Metamodel.compile(
        essentials.metamodel,
        essentials.diagramTypes.map((d) =>
          d.key === key ? { ...d, kind: "sequence" as const, matrix: undefined, document: undefined } : d,
        ),
      );
    expect(metamodelImpact(state, metamodel, retyped("applicationLandscape")).problems).toEqual([
      'Diagram type "applicationLandscape" changes from canvas to sequence but 1 diagrams still use it',
    ]);
    expect(metamodelImpact(new ModelState(), metamodel, retyped("applicationLandscape")).problems).toEqual([]);
  });
});
