import { describe, expect, it } from "vitest";
import { essentials } from "@connectome/content";
import { Metamodel } from "@connectome/engine";
import {
  compileDraft,
  countChanges,
  matrixCell,
  ruleChanges,
  ruleUsage,
  setRule,
  tryConnection,
  typeTree,
  type Rule,
} from "../src/metamodel-admin";

const snapshot = { package: essentials.metamodel, diagramTypes: essentials.diagramTypes } as never;
const rules = essentials.metamodel.relationshipRules! as Rule[];
const metamodel = Metamodel.compile(essentials.metamodel, essentials.diagramTypes);

describe("typeTree", () => {
  it("lists each parent type before its subtypes", () => {
    const keys = typeTree(metamodel).map((r) => `${r.depth}:${r.type.definition.key}`);
    const base = keys.indexOf("0:applicationBase");
    expect(keys.slice(base, base + 3)).toEqual(["0:applicationBase", "1:application", "1:saasApplication"]);
    expect(keys).toHaveLength(metamodel.allObjectTypes().length);
  });
});

describe("matrixCell", () => {
  it("shows a rule on a parent type as inherited, and a rule on the exact pair as its own", () => {
    const cell = matrixCell(metamodel, rules, "application", "process");
    const serves = cell.find((e) => e.relationshipType.key === "serves")!;
    expect(serves.own).toBeUndefined();
    expect(serves.inheritedFrom).toMatchObject({ sourceType: "applicationBase", targetType: "process" });
    const own = matrixCell(metamodel, rules, "applicationBase", "process").find(
      (e) => e.relationshipType.key === "serves",
    )!;
    expect(own.own).toBeDefined();
  });

  it("covers `*` targets and keeps warn-only rules hollow", () => {
    expect(matrixCell(metamodel, rules, "organisationUnit", "server").map((e) => e.relationshipType.key)).toContain(
      "owns",
    );
    const contains = matrixCell(metamodel, rules, "application", "application").find(
      (e) => e.relationshipType.key === "contains",
    )!;
    expect(contains.enforcement).toBe("warn");
  });
});

describe("setRule and ruleChanges", () => {
  it("adds, re-enforces and removes one exact rule, and reports the difference", () => {
    const added = setRule(rules, "accesses", "process", "dataObject", "block");
    expect(added).toHaveLength(rules.length + 1);
    const warned = setRule(added, "accesses", "process", "dataObject", "warn");
    expect(warned.at(-1)).toMatchObject({ enforcement: "warn" });
    expect(setRule(warned, "accesses", "process", "dataObject", "block").at(-1)!.enforcement).toBeUndefined();
    const removed = setRule(warned, "serves", "applicationBase", "process", null);
    const changes = ruleChanges(rules, removed);
    expect(changes.added).toEqual([
      { relationshipType: "accesses", sourceType: "process", targetType: "dataObject", enforcement: "warn" },
    ]);
    expect(changes.removed.map((r) => r.relationshipType)).toEqual(["serves"]);
    expect(countChanges(changes)).toBe(2);
    expect(countChanges(ruleChanges(rules, rules))).toBe(0);
  });

  it("compiles a draft, or says why it cannot", () => {
    expect(compileDraft(snapshot, setRule(rules, "accesses", "process", "dataObject", "block")).problems).toEqual([]);
    const bad = compileDraft(snapshot, [
      ...rules,
      { relationshipType: "teleports", sourceType: "process", targetType: "*" },
    ]);
    expect(bad.metamodel).toBeNull();
    expect(bad.problems.join()).toContain("teleports");
  });
});

describe("ruleUsage", () => {
  it("counts the relationships each rule allows, through subtypes", () => {
    const usage = ruleUsage(metamodel, rules, [
      { relationshipType: "serves", sourceType: "application", targetType: "process", count: 2 },
      { relationshipType: "serves", sourceType: "saasApplication", targetType: "process", count: 1 },
    ]);
    expect(usage.get("serves:applicationBase->process")).toBe(3);
    expect(usage.get("flowsTo:applicationBase->applicationBase")).toBe(0);
  });
});

describe("tryConnection", () => {
  it("lists what the connect menu offers, and what can be nested", () => {
    const result = tryConnection(metamodel, rules, "capability", "capability");
    expect(result.connect.map((c) => c.relationshipType.key)).toEqual(
      expect.arrayContaining(["contains", "specialises"]),
    );
    expect(result.nest.map((n) => n.key)).toContain("contains");
    expect(result.refused).toBeNull();
  });

  it("says why nothing connects, and what the source can connect to instead", () => {
    const result = tryConnection(metamodel, rules, "server", "capability");
    expect(result.connect).toEqual([]);
    expect(result.refused).toMatch(/^No rule connects Server to Capability\./);
  });
});
