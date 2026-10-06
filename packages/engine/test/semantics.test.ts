// Semantic kinds, categories and levels (design/02-model/semantics.md §2–§4) in the compiled metamodel and the engine.
import { describe, expect, it } from "vitest";
import { SEMANTIC_KINDS, type Edit, type MetamodelPackage } from "@connectome/model";
import { essentials } from "@connectome/content";
import { Metamodel, MetamodelError } from "../src";
import { apply, applyOk, exampleState, metamodel } from "./fixtures";

const base: MetamodelPackage = {
  name: "Test",
  version: "1.0.0",
  objectTypes: [{ key: "thing", name: "Thing", properties: [] }],
  relationshipTypes: [],
};

function problems(pkg: Partial<MetamodelPackage>): string {
  try {
    Metamodel.compile({ ...base, ...pkg });
  } catch (e) {
    if (e instanceof MetamodelError) return e.problems.join("\n");
    throw e;
  }
  return "";
}

describe("semantic metamodel", () => {
  it("classifies every Essentials type", () => {
    for (const rt of essentials.metamodel.relationshipTypes) expect(rt.semantic, rt.key).toBeDefined();
    for (const ot of metamodel.allObjectTypes().filter((t) => !t.definition.extends))
      expect(ot.category, ot.definition.key).not.toBe("other");
    expect(metamodel.relationshipType("contains")).toMatchObject({ semantic: "containment", nesting: true });
    expect(metamodel.relationshipType("hostedOn")).toMatchObject({
      semantic: "assignment",
      semanticDirection: "reverse",
    });
  });

  it("covers every kind once, with a navigation label per direction", () => {
    expect(new Set(SEMANTIC_KINDS.map((k) => k.kind)).size).toBe(14);
    expect(metamodel.semanticDirection("realizes", "source")).toBe("outgoing");
    expect(metamodel.semanticDirection("hostedOn", "source")).toBe("incoming");
  });

  it("treats a type without a kind as an association and keeps its nesting", () => {
    const mm = Metamodel.compile({
      ...base,
      relationshipTypes: [{ key: "holds", name: "Holds", verb: "holds", inverseVerb: "is held by", nesting: true }],
    });
    expect(mm.relationshipType("holds")).toMatchObject({ semantic: "association", nesting: true, singleParent: false });
  });

  it("makes every containment nest with a single parent", () => {
    const mm = Metamodel.compile({
      ...base,
      relationshipTypes: [{ key: "has", name: "Has", verb: "has", inverseVerb: "is in", semantic: "containment" }],
    });
    expect(mm.relationshipType("has")).toMatchObject({ nesting: true, singleParent: true });
    expect(
      problems({
        relationshipTypes: [
          { key: "has", name: "Has", verb: "has", inverseVerb: "is in", semantic: "containment", singleParent: false },
        ],
      }),
    ).toContain("always nests with a single parent");
  });

  it("refuses nesting on kinds that cannot nest", () => {
    expect(
      problems({
        relationshipTypes: [{ key: "f", name: "F", verb: "f", inverseVerb: "f by", semantic: "flow", nesting: true }],
      }),
    ).toContain("cannot be shown by nesting");
  });

  it("reserves the core package's keys", () => {
    expect(
      problems({ propertyTypes: [{ key: "semantic.level", name: "Mine", group: "semantic", dataType: "text" }] }),
    ).toContain("reserved by the core package");
  });

  it("refuses a fixed level without a level", () => {
    expect(problems({ objectTypes: [{ key: "thing", name: "Thing", properties: [], levelFixed: true }] })).toContain(
      "fixes its level but names none",
    );
  });

  it("gives every object type the level property and inherits category and level", () => {
    expect(metamodel.objectType("saasApplication")).toMatchObject({ category: "component", level: "implementation" });
    expect(metamodel.objectType("location")!.properties.has("semantic.level")).toBe(true);
    expect(metamodel.relationshipTypeProperties("accesses").has("access.mode")).toBe(true);
    expect(metamodel.relationshipTypeProperties("calls").has("interaction.protocol")).toBe(true);
    expect(metamodel.relationshipTypeProperties("serves").has("access.mode")).toBe(false);
  });
});

describe("semantic properties in the engine", () => {
  it("lets any object override its type's default level, and reads the default otherwise", () => {
    const state = exampleState();
    expect(metamodel.objectLevel(state.objects.get("O-APP-1")!)).toBe("implementation");
    applyOk(state, [{ edit: "setProperties", id: "O-APP-1", baseVersion: 1, set: { "semantic.level": "logical" } }]);
    expect(metamodel.objectLevel(state.objects.get("O-APP-1")!)).toBe("logical");
    const bad = apply(state, [
      { edit: "setProperties", id: "O-APP-1", baseVersion: 2, set: { "semantic.level": "x" } },
    ]);
    expect(bad.ok).toBe(false);
  });

  it("keeps a fixed level", () => {
    const mm = Metamodel.compile({
      ...base,
      objectTypes: [{ key: "thing", name: "Thing", properties: [], level: "physical", levelFixed: true }],
    });
    const state = exampleState();
    const create = (level: string): Edit => ({
      edit: "createObject",
      id: `N-${level}`,
      type: "thing",
      name: level,
      folderId: "F04",
      properties: { "semantic.level": level },
    });
    expect(apply(state, [create("logical")], { metamodel: mm })).toMatchObject({
      ok: false,
      reasons: [expect.objectContaining({ property: "properties.semantic.level" })],
    });
    expect(apply(state, [create("physical")], { metamodel: mm }).ok).toBe(true);
  });

  it("accepts the kind's core properties on a relationship", () => {
    const state = exampleState();
    applyOk(state, [
      { edit: "createObject", id: "N-DATA", type: "dataObject", name: "Claim", folderId: "F04" },
      {
        edit: "createRelationship",
        id: "N-ACC",
        type: "accesses",
        sourceId: "O-APP-1",
        targetId: "N-DATA",
        properties: { "access.mode": "readWrite" },
      },
    ]);
    expect(state.relationships.get("N-ACC")!.properties).toEqual({ "access.mode": "readWrite" });
  });
});
