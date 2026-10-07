// Rule usage (design/02-model/notation-and-metamodel-admin.md §10): combinations in use, and what new rules refuse.
import { describe, expect, it } from "vitest";
import { essentials } from "@connectome/content";
import { Metamodel, newlyRefused, relationshipCombinations, unallowedCombinations } from "../src";
import { exampleState, metamodel } from "./fixtures";

describe("rule usage", () => {
  const state = exampleState();

  it("counts each combination of relationship type, source type and target type, most used first", () => {
    const combos = relationshipCombinations(state);
    const flows = combos.filter((c) => c.relationshipType === "flowsTo");
    expect(flows.reduce((n, c) => n + c.count, 0)).toBe(3);
    expect(combos.map((c) => c.count)).toEqual([...combos.map((c) => c.count)].sort((a, b) => b - a));
  });

  it("finds nothing unallowed in the example, and what dropping a rule would refuse", () => {
    expect(unallowedCombinations(state, metamodel)).toEqual([]);
    const strict = Metamodel.compile(
      {
        ...essentials.metamodel,
        relationshipRules: essentials.metamodel.relationshipRules!.filter((r) => r.relationshipType !== "serves"),
      },
      essentials.diagramTypes,
    );
    const refused = newlyRefused(state, metamodel, strict);
    expect(refused.length).toBeGreaterThan(0);
    expect(refused.every((c) => c.relationshipType === "serves")).toBe(true);
    expect(unallowedCombinations(state, strict)).toEqual(refused);
  });
});
