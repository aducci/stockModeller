import { describe, expect, it } from "vitest";
import { essentials, insuranceGroup } from "@connectome/content";
import { applyChange, Metamodel, ModelState } from "@connectome/engine";
import { findOrCreateOptions } from "../src/find-or-create";

const metamodel = Metamodel.compile(essentials.metamodel, essentials.diagramTypes);
const state = new ModelState();
applyChange(state, insuranceGroup.baselineChange(), {
  metamodel,
  actor: { kind: "user", id: "U-DANA" },
  scenario: { id: insuranceGroup.baselineScenarioId, isBaseline: true },
  now: "2026-10-06T12:00:00.000Z",
});

describe("find or create", () => {
  it("offers nothing until a name is typed, and then creating is the default", () => {
    expect(findOrCreateOptions(state, metamodel, " ", "application", "F04")).toEqual({
      matches: [],
      refused: null,
      defaultIndex: 0,
    });
    const options = findOrCreateOptions(state, metamodel, "Fraud Check", "application", "F04");
    expect(options.defaultIndex).toBe(options.matches.length);
  });

  it("reuses an exact match by default, and says why a second one cannot be made", () => {
    const options = findOrCreateOptions(state, metamodel, "claims-manager", "application", "F04");
    expect(options.matches[0]!.object.name).toBe("Claims Manager");
    expect(options.defaultIndex).toBe(0);
    // "claims-manager" is not the same name to the engine, so it may still be created deliberately.
    expect(options.refused).toBeNull();
    expect(findOrCreateOptions(state, metamodel, "CLAIMS MANAGER", "application", "F04").refused).toBe(
      "An Application named “Claims Manager” already exists in this repository",
    );
  });

  it("lists partial matches while typing, without choosing one", () => {
    const options = findOrCreateOptions(state, metamodel, "claims man", "application", "F04");
    expect(options.matches[0]!.object.name).toBe("Claims Manager");
    expect(options.defaultIndex).toBe(options.matches.length);
  });

  it("checks folder-scoped names in the target folder only", () => {
    expect(findOrCreateOptions(state, metamodel, "Claim Intake", "capability", "F02").refused).toMatch(
      /in this folder/,
    );
    const elsewhere = findOrCreateOptions(state, metamodel, "Claim Intake", "capability", "F01");
    expect(elsewhere.refused).toBeNull();
    expect(elsewhere.defaultIndex).toBe(0);
  });
});
