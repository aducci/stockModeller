// Types from scratch and the metamodel as a file (storage §7, "Starting over").
import { describe, expect, it } from "vitest";
import { essentials } from "@connectome/content";
import { compileDraft, type Draft } from "../src/property-admin";
import {
  countTypeChanges,
  emptyMetamodel,
  exportMetamodel,
  importAsDraft,
  metamodelFileName,
  newDiagramType,
  newObjectType,
  newRelationshipType,
  readMetamodel,
  removeObjectType,
  removeRelationshipType,
  rootObjectTypes,
  typeChanges,
  updateObjectType,
  updateRelationshipType,
  whyKeepObjectType,
} from "../src/type-admin";

const published: Draft = { package: essentials.metamodel, diagramTypes: essentials.diagramTypes };

describe("types from scratch", () => {
  it("builds a whole metamodel from an empty one, and it compiles", () => {
    let draft: Draft = emptyMetamodel("Mine");
    const team = newObjectType(draft, "Team");
    draft = team.draft;
    const squad = newObjectType(draft, "Squad", team.key);
    draft = updateObjectType(squad.draft, squad.key, { category: "actor", abstraction: "logical" });
    const owns = newRelationshipType(draft, "Owns");
    draft = updateRelationshipType(owns.draft, owns.key, { inverseVerb: "is owned by", semantic: "assignment" });
    draft = {
      ...draft,
      package: {
        ...draft.package,
        relationshipRules: [{ relationshipType: "owns", sourceType: "team", targetType: "team", enforcement: "block" }],
      },
    };
    const map = newDiagramType(draft, "Team map", rootObjectTypes(draft));
    draft = map.draft;

    expect([team.key, squad.key, owns.key, map.key]).toEqual(["team", "squad", "owns", "teamMap"]);
    expect(draft.package.objectTypes[1]).toEqual({
      key: "squad",
      name: "Squad",
      properties: [],
      extends: "team",
      category: "actor",
      abstraction: "logical",
    });
    expect(draft.diagramTypes).toEqual([{ key: "teamMap", name: "Team map", kind: "canvas", objectTypes: ["team"] }]);
    const compiled = compileDraft(draft);
    expect(compiled.problems).toEqual([]);
    expect(compiled.metamodel!.isA("squad", "team")).toBe(true);
    expect(compiled.metamodel!.relationshipType("owns")).toMatchObject({ verb: "owns", semantic: "assignment" });
  });

  it("numbers keys that are taken and clears fields set back to empty", () => {
    const { draft, key } = newObjectType(published, "Application");
    expect(key).toBe("application2");
    const cleared = updateObjectType(updateObjectType(draft, key, { plural: "Apps" }), key, { plural: "" });
    expect(cleared.package.objectTypes.find((t) => t.key === key)).not.toHaveProperty("plural");
  });

  it("removes a type with the rules and diagram type lists that name it", () => {
    const keep = whyKeepObjectType(published, "applicationBase", 0);
    expect(keep).toMatch(/inherits from it/);
    expect(whyKeepObjectType(published, "server", 3)).toBe("3 objects of this type exist");

    const withoutServer = removeObjectType(published, "server");
    expect(withoutServer.package.objectTypes.some((t) => t.key === "server")).toBe(false);
    expect(
      withoutServer.package.relationshipRules!.some((r) => r.sourceType === "server" || r.targetType === "server"),
    ).toBe(false);
    expect(withoutServer.diagramTypes.some((d) => d.objectTypes.includes("server"))).toBe(false);
    expect(compileDraft(withoutServer).problems).toEqual([]);

    const withoutCalls = removeRelationshipType(published, "calls");
    expect(withoutCalls.package.relationshipRules!.some((r) => r.relationshipType === "calls")).toBe(false);
    expect(withoutCalls.diagramTypes.some((d) => d.relationshipTypes?.includes("calls"))).toBe(false);
  });

  it("counts types added, removed and changed for the review", () => {
    let draft = newObjectType(published, "Team").draft;
    draft = updateRelationshipType(draft, "calls", { verb: "invokes" });
    draft = removeObjectType(draft, "server");
    // Properties are reviewed on their own, not as a changed type.
    draft = updateObjectType(draft, "capability", { properties: [] });
    const changes = typeChanges(published, draft);
    expect(changes.object.added.map((t) => t.key)).toEqual(["team"]);
    expect(changes.object.removed.map((t) => t.key)).toEqual(["server"]);
    expect(changes.object.changed).toEqual([]);
    expect(changes.relationship.changed.map((t) => t.key)).toEqual(["calls"]);
    expect(countTypeChanges(changes)).toBe(3);
  });
});

describe("the metamodel as a file", () => {
  it("exports and reads back the same metamodel", () => {
    const text = exportMetamodel(published);
    expect(JSON.parse(text)).toMatchObject({ format: "connectome.metamodel" });
    const read = readMetamodel(text);
    expect(read.package).toEqual(published.package);
    expect(read.diagramTypes).toEqual(published.diagramTypes);
    expect(metamodelFileName("Insurance EA", "1.5.2")).toBe("insurance-ea-1.5.2.metamodel.json");
  });

  it("reads a bare package and a publish body too", () => {
    const { version: _, ...pkg } = published.package;
    expect(readMetamodel(JSON.stringify(pkg)).package.objectTypes).toEqual(published.package.objectTypes);
    const body = { baseVersion: "1.0.0", metamodel: pkg, diagramTypes: published.diagramTypes };
    expect(readMetamodel(JSON.stringify(body)).diagramTypes).toHaveLength(published.diagramTypes.length);
  });

  it("reads a file exported before level was renamed to abstraction (B62)", () => {
    const text = JSON.stringify({ package: published.package, diagramTypes: published.diagramTypes })
      .replaceAll('"abstraction":', '"level":')
      .replaceAll('"abstractionFixed":', '"levelFixed":')
      .replaceAll("semantic.abstraction", "semantic.level");
    expect(text).toContain('"level":"conceptual"');
    const read = readMetamodel(text);
    expect(read.package).toEqual(published.package);
    expect(read.diagramTypes).toEqual(published.diagramTypes);
  });

  it("says what is wrong with a file it cannot use", () => {
    expect(() => readMetamodel("not json")).toThrow("not JSON");
    expect(() => readMetamodel("[]")).toThrow("not a metamodel");
    expect(() => readMetamodel(JSON.stringify({ hello: 1 }))).toThrow("no metamodel package");
    const broken = {
      package: { name: "B", objectTypes: [{ key: "a", name: "A", extends: "x" }], relationshipTypes: [] },
    };
    expect(() => readMetamodel(JSON.stringify(broken))).toThrow('extends unknown type "x"');
  });

  it("imports as a draft of the published version", () => {
    const draft = importAsDraft(emptyMetamodel("Mine"), "1.5.3");
    expect(draft.package).toMatchObject({ name: "Mine", version: "1.5.3", objectTypes: [] });
  });
});
