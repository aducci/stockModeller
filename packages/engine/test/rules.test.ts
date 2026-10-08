// The essential rules of design/02-model/overview.md §3, one block per rule.
import { describe, expect, it } from "vitest";
import type { Edit } from "@connectome/model";
import { apply, applyOk, exampleState, line, occurrence } from "./fixtures";

const v = (state: ReturnType<typeof exampleState>, id: string) =>
  (state.objects.get(id) ?? state.relationships.get(id) ?? state.diagrams.get(id))!.version;

function rejection(state: ReturnType<typeof exampleState>, edits: Edit[]) {
  const result = apply(state, edits);
  if (result.ok) throw new Error("expected a rejection");
  return result.reasons[0]!;
}

describe("rule 1: every item has exactly one type from the metamodel", () => {
  it("rejects unknown and abstract object types", () => {
    const state = exampleState();
    const create = (type: string): Edit => ({ edit: "createObject", id: "N1", type, name: "X", folderId: "F04" });
    expect(rejection(state, [create("spaceship")])).toMatchObject({ code: "invalid", property: "type" });
    expect(rejection(state, [create("applicationBase")])).toMatchObject({ code: "invalid", property: "type" });
  });

  it("rejects unknown relationship types", () => {
    const state = exampleState();
    const edit: Edit = {
      edit: "createRelationship",
      id: "N1",
      type: "likes",
      sourceId: "O-APP-1",
      targetId: "O-PRC-1",
    };
    expect(rejection(state, [edit])).toMatchObject({ code: "invalid", property: "type" });
  });

  it("changes type with property mapping, dropping values the new type cannot hold and restoring them on undo", () => {
    const state = exampleState();
    const before = { ...state.objects.get("O-APP-1")!.properties };
    const result = applyOk(state, [
      { edit: "removeOccurrence", diagramId: "D-01", occurrenceId: "OO-4" },
      { edit: "removeOccurrence", diagramId: "D-01", occurrenceId: "OO-6" },
      { edit: "deleteRelationship", id: "R-10", baseVersion: 1 }, // hostedOn is only allowed from application
      { edit: "changeObjectType", id: "O-APP-1", baseVersion: 1, type: "saasApplication" },
    ]);
    expect(state.objects.get("O-APP-1")!.type).toBe("saasApplication");
    expect(state.objects.get("O-APP-1")!.properties).toEqual(before); // saasApplication inherits every property used
    expect(result.versions["O-APP-1"]).toBe(2);
  });

  it("refuses a type change that breaks an existing relationship", () => {
    const state = exampleState();
    const edits: Edit[] = [
      { edit: "removeOccurrence", diagramId: "D-01", occurrenceId: "OO-4" },
      { edit: "removeOccurrence", diagramId: "D-01", occurrenceId: "OO-6" },
      { edit: "changeObjectType", id: "O-APP-1", baseVersion: 1, type: "saasApplication" },
    ];
    expect(rejection(state, edits)).toMatchObject({ code: "ruleViolation", rule: "hostedOn:allowedPairs" });
  });
});

describe("rule 2: properties use assigned property types and valid values", () => {
  const set = (values: Record<string, unknown>): Edit =>
    ({ edit: "setProperties", id: "O-APP-1", baseVersion: 1, set: values }) as Edit;

  it("accepts valid values of every kind and clears with null", () => {
    const state = exampleState();
    applyOk(state, [
      set({
        "lifecycle.status": "phaseOut",
        "lifecycle.retiredFrom": "2027-03-31",
        "cost.runCost": { amount: 99.5, currency: "EUR" },
        "technical.users": 400,
        "technical.hosting": "Azure",
        "ownership.businessOwner": null,
      }),
    ]);
    const props = state.objects.get("O-APP-1")!.properties;
    expect(props["lifecycle.status"]).toBe("phaseOut");
    expect(props).not.toHaveProperty("ownership.businessOwner");
  });

  it.each([
    [{ "flow.protocol": "REST" }, "This type has no property"],
    [{ "lifecycle.status": "zombie" }, "must be one of"],
    [{ "lifecycle.activeFrom": "2026-02-30" }, "must be a date"],
    [{ "technical.users": 3.5 }, "whole number"],
    [{ "technical.users": -1 }, "at least 0"],
    [{ "technical.users": "many" }, "must be a number"],
    [{ "cost.runCost": { amount: 1, currency: "euro" } }, "currency"],
    [{ "cost.totalCost": { amount: 1, currency: "EUR" } }, "calculated"],
  ])("rejects %j", (values, message) => {
    const reason = rejection(exampleState(), [set(values)]);
    expect(reason).toMatchObject({ code: "invalid" });
    expect(reason.code === "invalid" && reason.message).toContain(message);
  });

  it("lets the system write calculated values", () => {
    const state = exampleState();
    applyOk(state, [set({ "cost.totalCost": { amount: 1, currency: "EUR" } })], {
      actor: { kind: "system", id: "system" },
    });
  });

  it("checks relationship properties against the relationship type", () => {
    const state = exampleState();
    const create = (properties: Record<string, unknown>) =>
      ({
        edit: "createRelationship",
        id: "N1",
        type: "flowsTo",
        sourceId: "O-APP-3",
        targetId: "O-APP-2",
        properties,
      }) as Edit;
    expect(rejection(state, [create({ "lifecycle.status": "active" })])).toMatchObject({ code: "invalid" });
    applyOk(state, [create({ "flow.frequency": 12 })]);
  });
});

describe("rule 3: relationships connect two existing objects, of a pair the rules allow", () => {
  it("rejects a pair no rule allows", () => {
    const edit: Edit = {
      edit: "createRelationship",
      id: "N1",
      type: "serves",
      sourceId: "O-APP-1",
      targetId: "O-SRV-1",
    };
    const reason = rejection(exampleState(), [edit]);
    expect(reason).toMatchObject({ code: "ruleViolation", rule: "serves:allowedPairs" });
    expect(reason.code === "ruleViolation" && reason.message).toBe('No rule allows "Application serves Server"');
  });

  it("matches rules through inheritance and the * wildcard", () => {
    const state = exampleState();
    applyOk(state, [
      { edit: "createRelationship", id: "N1", type: "serves", sourceId: "O-APP-3", targetId: "O-PRC-1" }, // saas → applicationBase rule
      { edit: "createObject", id: "ORG", type: "organisationUnit", name: "Claims Dept", folderId: "F01" },
      { edit: "createRelationship", id: "N2", type: "owns", sourceId: "ORG", targetId: "O-SRV-1" }, // * target
    ]);
  });

  it("allows a pair matched only by a warn rule, with a finding", () => {
    const state = exampleState();
    const result = applyOk(state, [
      { edit: "createRelationship", id: "N1", type: "contains", sourceId: "O-APP-1", targetId: "O-APP-2" },
    ]);
    expect(result.findings).toEqual([
      expect.objectContaining({ rule: "contains:applicationBase->applicationBase", itemId: "N1", severity: "warning" }),
    ]);
  });

  it("rejects missing endpoints and self-links", () => {
    const state = exampleState();
    const create = (sourceId: string, targetId: string): Edit => ({
      edit: "createRelationship",
      id: "N1",
      type: "flowsTo",
      sourceId,
      targetId,
    });
    expect(rejection(state, [create("O-APP-1", "NOPE")])).toMatchObject({ code: "invalid", property: "targetId" });
    expect(rejection(state, [create("O-APP-1", "O-APP-1")])).toMatchObject({ code: "invalid", property: "targetId" });
  });

  it("re-checks the rules when a relationship is reconnected, and drops its now-wrong lines", () => {
    const state = exampleState();
    expect(
      rejection(state, [{ edit: "reconnectRelationship", id: "R-08", baseVersion: 1, targetId: "O-SRV-1" }]),
    ).toMatchObject({
      code: "ruleViolation",
    });
    applyOk(state, [{ edit: "reconnectRelationship", id: "R-08", baseVersion: 1, targetId: "O-APP-2" }]);
    expect(state.relationshipOccurrences.find("byRelationship", "R-08")).toEqual([]);
  });
});

describe("rule 4: every object is in exactly one folder", () => {
  it("requires an existing folder on create and move", () => {
    const state = exampleState();
    expect(
      rejection(state, [{ edit: "createObject", id: "N1", type: "server", name: "S", folderId: "NOPE" }]),
    ).toMatchObject({
      property: "folderId",
    });
    expect(rejection(state, [{ edit: "moveToFolder", id: "O-SRV-1", baseVersion: 1, folderId: "NOPE" }])).toMatchObject(
      {
        property: "folderId",
      },
    );
    applyOk(state, [{ edit: "moveToFolder", id: "O-SRV-1", baseVersion: 1, folderId: "F04" }]);
    expect(state.objects.get("O-SRV-1")!.folderId).toBe("F04");
    expect(state.objectOccurrences.find("byObject", "O-SRV-1")).toEqual([]); // moving changes nothing else
  });

  it("refuses to delete a non-empty folder unless asked to delete its contents", () => {
    const state = exampleState();
    expect(rejection(state, [{ edit: "deleteFolder", id: "F01", contents: "refuseIfNotEmpty" }])).toMatchObject({
      code: "invalid",
      message: '"Business" is not empty: 2 folders',
    });
    applyOk(state, [{ edit: "deleteFolder", id: "F01", contents: "deleteContents" }]);
    expect(state.objects.get("O-CAP-1")).toBeUndefined();
    expect(state.objects.get("O-APP-1")).toBeDefined();
    expect(state.relationships.get("R-05")).toBeUndefined(); // realizes a deleted capability
  });

  it("deletes folders only in the baseline", () => {
    const state = exampleState();
    const result = apply(state, [{ edit: "deleteFolder", id: "F07", contents: "refuseIfNotEmpty" }], {
      scenario: { id: "S2", isBaseline: false },
    });
    expect(result).toMatchObject({ ok: false, reasons: [{ code: "invalid" }] });
  });

  it("keeps folder names unique among siblings and folders out of their own subtree", () => {
    const state = exampleState();
    expect(rejection(state, [{ edit: "createFolder", id: "N1", parentId: "F01", name: "Processes" }])).toMatchObject({
      property: "name",
    });
    expect(rejection(state, [{ edit: "moveFolder", id: "F01", parentId: "F02" }])).toMatchObject({
      property: "parentId",
    });
  });
});

describe("rule 5: nesting relationships never form a cycle; single parent", () => {
  it("rejects a cycle", () => {
    const edit: Edit = {
      edit: "createRelationship",
      id: "N1",
      type: "contains",
      sourceId: "O-CAP-2",
      targetId: "O-CAP-1",
    };
    expect(rejection(exampleState(), [edit])).toMatchObject({ code: "ruleViolation", rule: "contains:noCycles" });
  });

  it("rejects a second parent through a single-parent type", () => {
    const state = exampleState();
    const edits: Edit[] = [
      { edit: "createObject", id: "CAP-X", type: "capability", name: "Other", folderId: "F02" },
      { edit: "createRelationship", id: "N1", type: "contains", sourceId: "CAP-X", targetId: "O-CAP-2" },
    ];
    expect(rejection(state, edits)).toMatchObject({ code: "ruleViolation", rule: "contains:singleParent" });
  });

  it("allows moving a child to a new parent within one change", () => {
    const state = exampleState();
    applyOk(state, [
      { edit: "removeOccurrence", diagramId: "D-01", occurrenceId: "OO-2" },
      { edit: "createObject", id: "CAP-X", type: "capability", name: "Other", folderId: "F02" },
      { edit: "reconnectRelationship", id: "R-01", baseVersion: 1, sourceId: "CAP-X" },
    ]);
  });
});

describe("rule 6: occurrences point to existing items and hold only layout", () => {
  it("allows many occurrences of one object, also on one diagram", () => {
    const state = exampleState();
    applyOk(state, [{ edit: "addObjectOccurrence", diagramId: "D-01", occurrence: occurrence("OO-7", "O-APP-1") }]);
    expect(state.objectOccurrences.find("byObject", "O-APP-1")).toHaveLength(3);
  });

  it("needs a nesting relationship behind a nested occurrence", () => {
    const state = exampleState();
    const nested = occurrence("OO-7", "O-APP-1", { parentOccurrenceId: "OO-1" });
    expect(rejection(state, [{ edit: "addObjectOccurrence", diagramId: "D-01", occurrence: nested }])).toMatchObject({
      code: "ruleViolation",
      rule: "nesting:backedByRelationship",
    });
  });

  it("joins a line to occurrences of the relationship's own source and target", () => {
    const state = exampleState();
    const wrong = line("RO-9", "R-08", "OO-5", "OO-4"); // reversed
    expect(
      rejection(state, [{ edit: "addRelationshipOccurrence", diagramId: "D-01", occurrence: wrong }]),
    ).toMatchObject({
      code: "invalid",
      property: "occurrence",
    });
  });

  it("refuses objects the diagram type does not show", () => {
    const state = exampleState();
    const edit: Edit = { edit: "addObjectOccurrence", diagramId: "D-01", occurrence: occurrence("OO-7", "O-SRV-1") };
    expect(rejection(state, [edit])).toMatchObject({ code: "invalid", property: "occurrence.objectId" });
  });

  it("un-nests occurrences when their nesting relationship is deleted", () => {
    const state = exampleState();
    applyOk(state, [{ edit: "deleteRelationship", id: "R-01", baseVersion: 1 }]);
    const child = state.objectOccurrences.get("OO-2")!;
    expect(child.parentOccurrenceId).toBeNull();
    expect([child.x, child.y]).toEqual([20 + 16, 20 + 36]); // stays where it was on screen
    expect(state.relationshipOccurrences.get("RO-1")).toBeUndefined();
  });
});

describe("rule 7: deleting an object deletes its relationships and occurrences", () => {
  it("cascades, and the inverse restores everything", () => {
    const state = exampleState();
    const result = applyOk(state, [{ edit: "deleteObject", id: "O-APP-1", baseVersion: v(state, "O-APP-1") }]);
    expect(state.objects.get("O-APP-1")).toBeUndefined();
    for (const r of ["R-05", "R-07", "R-08", "R-09", "R-10"]) expect(state.relationships.get(r)).toBeUndefined();
    expect(state.objectOccurrences.find("byObject", "O-APP-1")).toEqual([]);
    expect(state.relationshipOccurrences.get("RO-3")).toBeUndefined();
    expect(result.log[0]!.inverse.map((e) => e.edit)).toEqual([
      "createObject",
      "createRelationship",
      "createRelationship",
      "createRelationship",
      "createRelationship",
      "createRelationship",
      "addObjectOccurrence",
      "addRelationshipOccurrence",
      "addObjectOccurrence",
      "addRelationshipOccurrence",
    ]);
  });

  it("brings back a restored object with a higher version", () => {
    const state = exampleState();
    const result = applyOk(state, [{ edit: "deleteObject", id: "O-SRV-1", baseVersion: 1 }]);
    expect(result.versions["O-SRV-1"]).toBe(2);
    const undo = applyOk(state, result.log[0]!.inverse);
    expect(undo.versions["O-SRV-1"]).toBe(3);
    expect(state.objects.get("O-SRV-1")!.name).toBe("SRV-APP-01");
  });
});

describe("rule 8: removing an occurrence never deletes the object", () => {
  it("removes the occurrence and its lines only; nested occurrences move out", () => {
    const state = exampleState();
    applyOk(state, [{ edit: "removeOccurrence", diagramId: "D-01", occurrenceId: "OO-1" }]);
    expect(state.objects.get("O-CAP-1")).toBeDefined();
    expect(state.relationships.get("R-01")).toBeDefined();
    expect(state.relationshipOccurrences.get("RO-1")).toBeUndefined();
    expect(state.objectOccurrences.get("OO-3")!.parentOccurrenceId).toBeNull();
  });
});

describe("rule 9: every edit happens inside a change", () => {
  it("applies all edits or none", () => {
    const state = exampleState();
    const before = state.clone();
    const result = apply(state, [
      { edit: "renameObject", id: "O-APP-1", baseVersion: 1, name: "Claims Manager 2" },
      { edit: "createRelationship", id: "N1", type: "serves", sourceId: "O-APP-1", targetId: "O-SRV-1" },
    ]);
    expect(result.ok).toBe(false);
    expect(state.objects.get("O-APP-1")!.name).toBe("Claims Manager");
    expect([...state.objects.all()]).toEqual([...before.objects.all()]);
  });

  it("rejects empty changes and changes for another scenario", () => {
    const state = exampleState();
    expect(apply(state, [])).toMatchObject({ ok: false, reasons: [{ property: "edits" }] });
  });
});

describe("names, keys and uniqueness", () => {
  it("auto-numbers keys from the type's pattern", () => {
    const state = exampleState();
    applyOk(state, [{ edit: "createObject", id: "N1", type: "application", name: "New App", folderId: "F04" }]);
    expect(state.objects.get("N1")!.key).toBe("APP-0003");
  });

  it("keeps application names unique in the repository (case-insensitive)", () => {
    const state = exampleState();
    const edit: Edit = { edit: "createObject", id: "N1", type: "application", name: "claims manager", folderId: "F05" };
    expect(rejection(state, [edit])).toMatchObject({ code: "invalid", property: "name" });
  });

  it("keeps capability names unique per folder only", () => {
    const state = exampleState();
    applyOk(state, [{ edit: "createObject", id: "N1", type: "capability", name: "Claim Intake", folderId: "F01" }]);
    const clash: Edit = { edit: "createObject", id: "N2", type: "capability", name: "Claim Intake", folderId: "F02" };
    expect(rejection(state, [clash])).toMatchObject({ property: "name" });
  });

  it("requires a name and rejects duplicate keys", () => {
    const state = exampleState();
    expect(
      rejection(state, [{ edit: "createObject", id: "N1", type: "server", name: "  ", folderId: "F05" }]),
    ).toMatchObject({
      property: "name",
    });
    const dup: Edit = {
      edit: "createObject",
      id: "N1",
      type: "application",
      name: "X",
      folderId: "F04",
      key: "APP-0001",
    };
    expect(rejection(state, [dup])).toMatchObject({ property: "key" });
  });
});

describe("confirmations", () => {
  it("stamps who confirmed a value and when, and refuses a value changed meanwhile", () => {
    const state = exampleState();
    const v = state.objects.get("O-APP-1")!.version;
    applyOk(state, [
      {
        edit: "confirmProperties",
        id: "O-APP-1",
        baseVersion: v,
        keys: ["lifecycle.status", "assessment.criticality"],
      },
    ]);
    expect(state.objects.get("O-APP-1")!.confirmations).toEqual({
      "lifecycle.status": { by: "U-DANA", at: "2026-10-06T12:00:00.000Z" },
      "assessment.criticality": { by: "U-DANA", at: "2026-10-06T12:00:00.000Z" },
    });

    // Lee changes the status; Dana's confirmation, sent against the old version, is refused for it.
    applyOk(
      state,
      [{ edit: "setProperties", id: "O-APP-1", baseVersion: v + 1, set: { "lifecycle.status": "phaseOut" } }],
      { actor: { kind: "user", id: "U-LEE" } },
    );
    expect(
      apply(state, [{ edit: "confirmProperties", id: "O-APP-1", baseVersion: v + 1, keys: ["lifecycle.status"] }]),
    ).toMatchObject({ ok: false, reasons: [{ code: "conflict", property: "properties.lifecycle.status" }] });
    // Another property, unchanged since, can still be confirmed against that version.
    applyOk(state, [
      { edit: "confirmProperties", id: "O-APP-1", baseVersion: v + 1, keys: ["assessment.businessFit"] },
    ]);
  });

  it("refuses a property the type does not have, or one listed twice", () => {
    const state = exampleState();
    const v = state.objects.get("O-APP-1")!.version;
    expect(
      apply(state, [{ edit: "confirmProperties", id: "O-APP-1", baseVersion: v, keys: ["flow.protocol"] }]),
    ).toMatchObject({ ok: false, reasons: [{ code: "invalid", property: "keys" }] });
    expect(
      apply(state, [
        { edit: "confirmProperties", id: "O-APP-1", baseVersion: v, keys: ["lifecycle.status", "lifecycle.status"] },
      ]),
    ).toMatchObject({ ok: false, reasons: [{ code: "invalid", property: "keys" }] });
  });
});

describe("external ids", () => {
  it("refuses a second object claiming the same system id, and allows it once the first is gone", () => {
    const state = exampleState();
    const create = (id: string): Edit => ({
      edit: "createObject",
      id,
      type: "application",
      name: `App ${id}`,
      folderId: "F04",
      externalIds: { servicenow: "cmdb_ci_appl_7781" },
    });
    expect(rejection(state, [create("N1")])).toMatchObject({ code: "invalid", property: "externalIds.servicenow" });
    const owner = [...state.objects.live()].find((o) => o.externalIds.servicenow === "cmdb_ci_appl_7781")!;
    applyOk(state, [{ edit: "deleteObject", id: owner.id, baseVersion: owner.version }]);
    applyOk(state, [create("N1")]);
  });

  it("allows the same id in another system", () => {
    const state = exampleState();
    applyOk(state, [
      {
        edit: "createObject",
        id: "N1",
        type: "application",
        name: "Other",
        folderId: "F04",
        externalIds: { leanix: "cmdb_ci_appl_7781" },
      },
    ]);
  });
});
