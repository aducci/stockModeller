// Semantic kinds, categories and abstractions (design/02-model/semantics.md §2–§4) in the compiled metamodel and the engine.
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
    // A group (decision B22) only gathers other objects, so it is the one type with no category of its own.
    for (const ot of metamodel.allObjectTypes().filter((t) => !t.definition.extends && t.definition.key !== "group"))
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
      problems({ propertyTypes: [{ key: "semantic.abstraction", name: "Mine", group: "semantic", dataType: "text" }] }),
    ).toContain("reserved by the core package");
  });

  it("refuses a fixed abstraction without an abstraction", () => {
    expect(
      problems({ objectTypes: [{ key: "thing", name: "Thing", properties: [], abstractionFixed: true }] }),
    ).toContain("fixes its abstraction but names none");
  });

  it("gives every object type the abstraction property and inherits category and abstraction", () => {
    expect(metamodel.objectType("saasApplication")).toMatchObject({
      category: "component",
      abstraction: "implementation",
    });
    expect(metamodel.objectType("location")!.properties.has("semantic.abstraction")).toBe(true);
    expect(metamodel.relationshipTypeProperties("accesses").has("access.mode")).toBe(true);
    expect(metamodel.relationshipTypeProperties("calls").has("interaction.protocol")).toBe(true);
    expect(metamodel.relationshipTypeProperties("serves").has("access.mode")).toBe(false);
  });
});

describe("semantic properties in the engine", () => {
  it("lets any object override its type's default abstraction, and reads the default otherwise", () => {
    const state = exampleState();
    expect(metamodel.objectAbstraction(state.objects.get("O-APP-1")!)).toBe("implementation");
    applyOk(state, [
      { edit: "setProperties", id: "O-APP-1", baseVersion: 1, set: { "semantic.abstraction": "logical" } },
    ]);
    expect(metamodel.objectAbstraction(state.objects.get("O-APP-1")!)).toBe("logical");
    const bad = apply(state, [
      { edit: "setProperties", id: "O-APP-1", baseVersion: 2, set: { "semantic.abstraction": "x" } },
    ]);
    expect(bad.ok).toBe(false);
  });

  it("keeps a fixed abstraction", () => {
    const mm = Metamodel.compile({
      ...base,
      objectTypes: [{ key: "thing", name: "Thing", properties: [], abstraction: "physical", abstractionFixed: true }],
    });
    const state = exampleState();
    const create = (abstraction: string): Edit => ({
      edit: "createObject",
      id: `N-${abstraction}`,
      type: "thing",
      name: abstraction,
      folderId: "F04",
      properties: { "semantic.abstraction": abstraction },
    });
    expect(apply(state, [create("logical")], { metamodel: mm })).toMatchObject({
      ok: false,
      reasons: [expect.objectContaining({ property: "properties.semantic.abstraction" })],
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

describe("payloads and interactions (semantics.md §5–§6)", () => {
  const undo = (state: ReturnType<typeof exampleState>, result: ReturnType<typeof applyOk>) =>
    applyOk(state, JSON.parse(JSON.stringify(invertLog(result.log))) as Edit[]);
  const ends = (state: ReturnType<typeof exampleState>, id: string) => {
    const r = state.relationships.get(id)!;
    return `${r.sourceId}->${r.targetId}`;
  };
  const withInformation = () => {
    const state = exampleState();
    applyOk(state, [
      { edit: "createObject", id: "D-PAY", type: "dataObject", name: "Payment Information", folderId: "F04" },
      { edit: "createObject", id: "D-CLM", type: "dataObject", name: "Claim", folderId: "F04" },
      { edit: "createObject", id: "I-API", type: "interface", name: "Payments API", folderId: "F04" },
    ]);
    return state;
  };

  it("sets a flow's payload and undoes it; types without a payload refuse one", () => {
    const state = withInformation();
    const result = applyOk(state, [{ edit: "setPayload", id: "R-08", baseVersion: 1, payload: ["D-PAY", "D-CLM"] }]);
    expect(state.relationships.get("R-08")!.payload).toEqual(["D-PAY", "D-CLM"]);
    expect(state.relationships.find("byPayload", "D-CLM").map((r) => r.id)).toEqual(["R-08"]);
    undo(state, result);
    expect(state.relationships.get("R-08")!.payload).toEqual([]);
    const realizes = apply(state, [{ edit: "setPayload", id: "R-05", baseVersion: 1, payload: ["D-PAY"] }]);
    expect(realizes).toMatchObject({ ok: false, reasons: [expect.objectContaining({ property: "payload" })] });
    const twice = apply(state, [{ edit: "setPayload", id: "R-08", baseVersion: 3, payload: ["D-PAY", "D-PAY"] }]);
    expect(twice).toMatchObject({ ok: false, reasons: [expect.objectContaining({ property: "payload.1" })] });
  });

  it("takes a deleted object out of every payload, and undo puts it back in place", () => {
    const state = withInformation();
    applyOk(state, [
      { edit: "setPayload", id: "R-08", baseVersion: 1, payload: ["D-PAY", "D-CLM"] },
      { edit: "setPayload", id: "R-09", baseVersion: 1, payload: ["D-PAY"] },
    ]);
    const result = applyOk(state, [{ edit: "deleteObject", id: "D-PAY", baseVersion: 1 }]);
    expect(state.relationships.get("R-08")!.payload).toEqual(["D-CLM"]);
    expect(state.relationships.get("R-09")!.payload).toEqual([]);
    undo(state, result);
    expect(state.relationships.get("R-08")!.payload).toEqual(["D-PAY", "D-CLM"]);
    expect(state.relationships.get("R-09")!.payload).toEqual(["D-PAY"]);
  });

  it("keeps an interaction's messages on its two objects and follows it when reconnected", () => {
    const state = withInformation();
    applyOk(state, [
      { edit: "createRelationship", id: "C1", type: "calls", sourceId: "O-APP-1", targetId: "I-API" },
      {
        edit: "createRelationship",
        id: "M-REQ",
        type: "flowsTo",
        sourceId: "O-APP-1",
        targetId: "I-API",
        parentId: "C1",
        payload: ["D-CLM"],
      },
      {
        edit: "createRelationship",
        id: "M-RES",
        type: "flowsTo",
        sourceId: "I-API",
        targetId: "O-APP-1",
        parentId: "C1",
      },
    ]);
    expect([state.relationships.get("M-REQ")!.rank, state.relationships.get("M-RES")!.rank]).toEqual([0, 1]);

    const elsewhere = apply(state, [
      {
        edit: "createRelationship",
        id: "M-X",
        type: "flowsTo",
        sourceId: "O-APP-2",
        targetId: "O-APP-1",
        parentId: "C1",
      },
    ]);
    expect(elsewhere).toMatchObject({ ok: false, reasons: [expect.objectContaining({ rule: "message:endpoints" })] });
    const notInteraction = apply(state, [
      {
        edit: "createRelationship",
        id: "M-X",
        type: "flowsTo",
        sourceId: "O-APP-1",
        targetId: "O-APP-3",
        parentId: "R-08",
      },
    ]);
    expect(notInteraction).toMatchObject({ ok: false, reasons: [expect.objectContaining({ property: "parentId" })] });

    const moved = applyOk(state, [{ edit: "reconnectRelationship", id: "C1", baseVersion: 1, sourceId: "O-APP-2" }]);
    expect([ends(state, "M-REQ"), ends(state, "M-RES")]).toEqual(["O-APP-2->I-API", "I-API->O-APP-2"]);
    undo(state, moved);
    expect([ends(state, "M-REQ"), ends(state, "M-RES")]).toEqual(["O-APP-1->I-API", "I-API->O-APP-1"]);

    const retyped = apply(state, [{ edit: "changeRelationshipType", id: "C1", baseVersion: 3, type: "flowsTo" }]);
    expect(retyped).toMatchObject({ ok: false, reasons: [expect.objectContaining({ property: "type" })] });
  });

  it("deletes an interaction with its messages, and undo restores them in one step", () => {
    const state = withInformation();
    applyOk(state, [
      { edit: "createRelationship", id: "C1", type: "calls", sourceId: "O-APP-1", targetId: "I-API" },
      {
        edit: "createRelationship",
        id: "M-REQ",
        type: "flowsTo",
        sourceId: "O-APP-1",
        targetId: "I-API",
        parentId: "C1",
      },
      {
        edit: "createRelationship",
        id: "M-RES",
        type: "flowsTo",
        sourceId: "I-API",
        targetId: "O-APP-1",
        parentId: "C1",
        payload: ["D-PAY"],
      },
    ]);
    const before = state.relationships.get("M-RES");
    const result = applyOk(state, [{ edit: "deleteRelationship", id: "C1", baseVersion: 1 }]);
    expect(["C1", "M-REQ", "M-RES"].map((id) => state.relationships.get(id))).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
    undo(state, result);
    expect(state.relationships.get("M-RES")).toMatchObject({ parentId: "C1", rank: 1, payload: ["D-PAY"] });
    expect(state.relationships.get("M-RES")!.properties).toEqual(before!.properties);
    expect(state.relationships.get("M-REQ")).toMatchObject({ parentId: "C1", rank: 0 });
  });
});
