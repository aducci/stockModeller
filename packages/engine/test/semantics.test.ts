// Semantic kinds, categories and levels (design/02-model/semantics.md §2–§4) in the compiled metamodel and the engine.
import { describe, expect, it } from "vitest";
import { SEMANTIC_KINDS, type Edit, type MetamodelPackage } from "@connectome/model";
import { essentials } from "@connectome/content";
import { invertLog, Metamodel, MetamodelError } from "../src";
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

describe("containment (semantics.md §3)", () => {
  const undo = (state: ReturnType<typeof exampleState>, result: ReturnType<typeof applyOk>) =>
    applyOk(state, JSON.parse(JSON.stringify(invertLog(result.log))) as Edit[]);
  const folder = (state: ReturnType<typeof exampleState>, id: string) => state.objects.get(id)!.folderId;
  const links = (state: ReturnType<typeof exampleState>) =>
    [...state.relationships.live()].map((r) => `${r.id}:${r.sourceId}->${r.targetId}`).sort();

  it("moves a new content and its own contents into the container's folder, and undo puts them back", () => {
    const state = exampleState();
    applyOk(state, [
      { edit: "createObject", id: "CAP-X", type: "capability", name: "Fraud", folderId: "F05" },
      { edit: "createObject", id: "CAP-Y", type: "capability", name: "Fraud scoring", folderId: "F05" },
      { edit: "createRelationship", id: "R-XY", type: "contains", sourceId: "CAP-X", targetId: "CAP-Y" },
    ]);
    const result = applyOk(state, [
      { edit: "createRelationship", id: "R-1X", type: "contains", sourceId: "O-CAP-1", targetId: "CAP-X" },
    ]);
    expect([folder(state, "CAP-X"), folder(state, "CAP-Y")]).toEqual(["F02", "F02"]);
    undo(state, result);
    expect([folder(state, "CAP-X"), folder(state, "CAP-Y")]).toEqual(["F05", "F05"]);
  });

  it("moves contents with their container, and keeps a content from leaving on its own", () => {
    const state = exampleState();
    const moved = applyOk(state, [{ edit: "moveToFolder", id: "O-CAP-1", baseVersion: 1, folderId: "F05" }]);
    expect(["O-CAP-1", "O-CAP-2", "O-CAP-3"].map((id) => folder(state, id))).toEqual(["F05", "F05", "F05"]);
    undo(state, moved);
    expect(folder(state, "O-CAP-2")).toBe("F02");
    const refused = apply(state, [{ edit: "moveToFolder", id: "O-CAP-2", baseVersion: 1, folderId: "F05" }]);
    expect(refused).toMatchObject({ ok: false, reasons: [expect.objectContaining({ property: "folderId" })] });
  });

  it("re-parents by reconnecting the same relationship, moving the content's folder", () => {
    const state = exampleState();
    applyOk(state, [{ edit: "createObject", id: "CAP-Z", type: "capability", name: "Finance", folderId: "F05" }]);
    const result = applyOk(state, [{ edit: "reconnectRelationship", id: "R-02", baseVersion: 1, sourceId: "CAP-Z" }]);
    expect(state.relationships.get("R-02")!.sourceId).toBe("CAP-Z");
    expect(folder(state, "O-CAP-3")).toBe("F05");
    undo(state, result);
    expect(folder(state, "O-CAP-3")).toBe("F02");
  });

  it("keeps one container across every containment type", () => {
    const mm = Metamodel.compile({
      ...base,
      relationshipTypes: [
        { key: "holds", name: "Holds", verb: "holds", inverseVerb: "is held by", semantic: "containment" },
        { key: "has", name: "Has", verb: "has", inverseVerb: "is in", semantic: "containment" },
      ],
      relationshipRules: [
        { relationshipType: "holds", sourceType: "thing", targetType: "thing" },
        { relationshipType: "has", sourceType: "thing", targetType: "thing" },
      ],
    });
    const state = exampleState();
    const things = ["A", "B", "C"].map((id): Edit => ({
      edit: "createObject",
      id,
      type: "thing",
      name: id,
      folderId: "F04",
    }));
    applyOk(state, [...things, { edit: "createRelationship", id: "AB", type: "holds", sourceId: "A", targetId: "B" }], {
      metamodel: mm,
    });
    const second = apply(state, [{ edit: "createRelationship", id: "CB", type: "has", sourceId: "C", targetId: "B" }], {
      metamodel: mm,
    });
    expect(second).toMatchObject({ ok: false, reasons: [expect.objectContaining({ rule: "has:singleParent" })] });
    const loop = apply(state, [{ edit: "createRelationship", id: "BA", type: "has", sourceId: "B", targetId: "A" }], {
      metamodel: mm,
    });
    expect(loop).toMatchObject({ ok: false, reasons: [expect.objectContaining({ rule: "has:noCycles" })] });
  });

  it("moves a deleted container's contents up a level, or deletes them too", () => {
    const state = exampleState();
    applyOk(state, [
      { edit: "createObject", id: "CAP-4", type: "capability", name: "Triage", folderId: "F02" },
      { edit: "createRelationship", id: "R-24", type: "contains", sourceId: "O-CAP-2", targetId: "CAP-4" },
    ]);
    const before = links(state);
    const up = applyOk(state, [{ edit: "deleteObject", id: "O-CAP-2", baseVersion: 1 }]);
    expect(state.relationships.get("R-24")).toMatchObject({ sourceId: "O-CAP-1", targetId: "CAP-4" });
    undo(state, up);
    expect(links(state)).toEqual(before);

    const all = applyOk(state, [
      {
        edit: "deleteObject",
        id: "O-CAP-2",
        baseVersion: state.objects.get("O-CAP-2")!.version,
        contents: "deleteContents",
      },
    ]);
    expect(state.objects.get("CAP-4")).toBeUndefined();
    undo(state, all);
    expect(state.objects.get("CAP-4")).toBeDefined();
  });

  it("changes a relationship's type, keeping its id, and back", () => {
    const state = exampleState();
    const result = applyOk(state, [{ edit: "changeRelationshipType", id: "R-03", baseVersion: 1, type: "composedOf" }]);
    expect(state.relationships.get("R-03")).toMatchObject({ type: "composedOf", sourceId: "O-PRC-1" });
    undo(state, result);
    expect(state.relationships.get("R-03")!.type).toBe("contains");
    const refused = apply(state, [{ edit: "changeRelationshipType", id: "R-05", baseVersion: 1, type: "serves" }]);
    expect(refused.ok).toBe(false); // an application does not serve a capability
  });

  it("deletes the parts of a whole whose composition cascades", () => {
    const mm = Metamodel.compile({
      ...base,
      relationshipTypes: [
        {
          key: "madeOf",
          name: "Made of",
          verb: "is made of",
          inverseVerb: "is part of",
          semantic: "composition",
          cascadeDelete: true,
        },
      ],
      relationshipRules: [{ relationshipType: "madeOf", sourceType: "thing", targetType: "thing" }],
    });
    const state = exampleState();
    applyOk(
      state,
      [
        { edit: "createObject", id: "W", type: "thing", name: "Whole", folderId: "F04" },
        { edit: "createObject", id: "P", type: "thing", name: "Part", folderId: "F05" },
        { edit: "createRelationship", id: "WP", type: "madeOf", sourceId: "W", targetId: "P" },
      ],
      { metamodel: mm },
    );
    expect(state.objects.get("P")!.folderId).toBe("F05"); // composition moves nothing
    applyOk(state, [{ edit: "deleteObject", id: "W", baseVersion: 1 }], { metamodel: mm });
    expect(state.objects.get("P")).toBeUndefined();
  });
});
