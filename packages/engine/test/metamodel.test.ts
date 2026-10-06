import { describe, expect, it } from "vitest";
import type { MetamodelPackage } from "@connectome/model";
import { Metamodel, MetamodelError } from "../src";
import { metamodel } from "./fixtures";

describe("compiled Essentials metamodel", () => {
  it("resolves inheritance", () => {
    expect(metamodel.objectType("application")!.lineage).toEqual(["application", "applicationBase"]);
    expect(metamodel.isA("saasApplication", "applicationBase")).toBe(true);
    expect(metamodel.isA("server", "applicationBase")).toBe(false);
    expect(metamodel.objectType("saasApplication")!.properties.has("lifecycle.status")).toBe(true);
    expect(metamodel.objectType("application")!.properties.has("technical.hosting")).toBe(true);
    expect(metamodel.objectType("saasApplication")!.properties.has("technical.hosting")).toBe(false);
    expect(metamodel.objectType("saasApplication")!.uniqueName).toBe("repository");
    expect(metamodel.objectType("application")!.keyPattern).toBe("APP-{0000}");
  });

  it("matches rules through inheritance and wildcards, defaulting enforcement to block", () => {
    expect(metamodel.matchingRules("serves", "saasApplication", "process")).toEqual([
      expect.objectContaining({ key: "serves:applicationBase->process", enforcement: "block" }),
    ]);
    expect(metamodel.matchingRules("owns", "organisationUnit", "server")).toHaveLength(1);
    expect(metamodel.matchingRules("hostedOn", "saasApplication", "server")).toEqual([]);
  });

  it("lists the relationship types allowed between two object types", () => {
    const keys = metamodel.allowedRelationshipTypes("application", "applicationBase").map((t) => t.key);
    expect(keys.sort()).toEqual(["contains", "flowsTo"]);
  });

  it("lets diagram types admit subtypes of listed types", () => {
    const dt = metamodel.diagramType("applicationLandscape")!;
    expect(metamodel.diagramAllowsObjectType(dt, "saasApplication")).toBe(true);
    expect(metamodel.diagramAllowsObjectType(dt, "server")).toBe(false);
    expect(dt.nesting).toBe("nested");
  });
});

describe("compiling a broken package", () => {
  it("lists every problem at once", () => {
    const broken: MetamodelPackage = {
      name: "Broken",
      version: "1.0.0",
      propertyTypes: [{ key: "a.status", name: "Status", group: "a", dataType: "list", valueList: "missing" }],
      objectTypes: [
        { key: "a", name: "A", extends: "b", properties: ["a.status", "a.nope"] },
        { key: "b", name: "B", extends: "a", properties: [] },
      ],
      relationshipTypes: [{ key: "r", name: "R", verb: "r", inverseVerb: "r of", singleParent: true }],
      relationshipRules: [{ relationshipType: "q", sourceType: "a", targetType: "zzz" }],
    };
    expect(() => Metamodel.compile(broken)).toThrow(MetamodelError);
    try {
      Metamodel.compile(broken);
    } catch (e) {
      const problems = (e as MetamodelError).problems.join("\n");
      expect(problems).toContain('unknown value list "missing"');
      expect(problems).toContain("inherits from itself");
      expect(problems).toContain('unknown property type "a.nope"');
      expect(problems).toContain("singleParent but not nesting");
      expect(problems).toContain('unknown relationship type "q"');
      expect(problems).toContain('unknown object type "zzz"');
    }
  });
});
