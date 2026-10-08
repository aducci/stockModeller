// Name uniqueness per object type and duplicate relationships (design/02-model/duplicates-and-identity.md §4).
import { describe, expect, it } from "vitest";
import type { Edit } from "@connectome/model";
import { duplicateRelationships, nameClash } from "../src";
import { apply, applyOk, exampleState, metamodel } from "./fixtures";

function rejection(state: ReturnType<typeof exampleState>, edits: Edit[]) {
  const result = apply(state, edits);
  if (result.ok) throw new Error("expected a rejection");
  return result.reasons[0]!;
}

const step = (id: string, name: string): Edit => ({
  edit: "createObject",
  id,
  type: "processStep",
  name,
  folderId: "F03",
});
const contain = (id: string, container: string, content: string): Edit => ({
  edit: "createRelationship",
  id,
  type: "contains",
  sourceId: container,
  targetId: content,
});

describe("uniqueName: container", () => {
  it("refuses a second step of the same name in one process, and allows it elsewhere", () => {
    const state = exampleState();
    // Handle Claim already contains Assess Claim.
    expect(rejection(state, [step("N1", "assess claim"), contain("R1", "O-PRC-1", "N1")])).toMatchObject({
      code: "invalid",
      property: "name",
      message: 'A Process step named "Assess Claim" already exists in Handle Claim',
    });
    // On its own, or in another process, the name is free.
    applyOk(state, [step("N1", "Assess Claim")]);
    applyOk(state, [
      { edit: "createObject", id: "P2", type: "process", name: "Handle Complaint", folderId: "F03" },
      step("N2", "Assess Claim"),
      contain("R2", "P2", "N2"),
    ]);
  });

  it("checks a rename and a move to another container", () => {
    const state = exampleState();
    const pay = state.objects.get("O-STP-2")!;
    expect(
      rejection(state, [{ edit: "renameObject", id: pay.id, baseVersion: pay.version, name: "Assess Claim" }]),
    ).toMatchObject({ property: "name" });
    applyOk(state, [
      { edit: "createObject", id: "P2", type: "process", name: "Handle Complaint", folderId: "F03" },
      step("N1", "Pay Claim"),
      contain("R1", "P2", "N1"),
    ]);
    const r = state.relationships.get("R1")!;
    expect(
      rejection(state, [{ edit: "reconnectRelationship", id: r.id, baseVersion: r.version, sourceId: "O-PRC-1" }]),
    ).toMatchObject({ property: "name" });
  });
});

describe("uniqueAcross: family", () => {
  it("refuses a SaaS application named like an application", () => {
    const state = exampleState();
    const saas: Edit = {
      edit: "createObject",
      id: "N1",
      type: "saasApplication",
      name: "Claims Manager",
      folderId: "F04",
    };
    expect(rejection(state, [saas])).toMatchObject({
      property: "name",
      message: 'An Application named "Claims Manager" already exists in this repository',
    });
  });
});

describe("uniquePerLevel", () => {
  it("allows the same name at another level, and checks a change of level", () => {
    const state = exampleState();
    applyOk(state, [
      {
        edit: "createObject",
        id: "N1",
        type: "application",
        name: "Claims Manager",
        folderId: "F04",
        properties: { "semantic.level": "logical" },
      },
    ]);
    const n1 = state.objects.get("N1")!;
    expect(
      rejection(state, [
        { edit: "setProperties", id: "N1", baseVersion: n1.version, set: { "semantic.level": "implementation" } },
      ]),
    ).toMatchObject({ property: "name" });
  });
});

describe("onClash: warn", () => {
  it("saves a repeated data object name with a finding", () => {
    const state = exampleState();
    const result = applyOk(state, [
      { edit: "createObject", id: "N1", type: "dataObject", name: "Payment", folderId: "F08" },
    ]);
    expect(result.findings).toEqual([
      {
        rule: "dataObject:uniqueName",
        itemId: "N1",
        severity: "warning",
        message: 'A Data object named "Payment" already exists in this repository',
      },
    ]);
  });
});

describe("nameClash", () => {
  it("answers for an object about to be created", () => {
    const state = exampleState();
    const place = { type: "application", folderId: "F04", containerId: null, level: "implementation", selfId: null };
    expect(nameClash(state, metamodel, { ...place, name: " claims MANAGER " })).toMatchObject({
      enforcement: "block",
      object: { id: "O-APP-1" },
    });
    expect(nameClash(state, metamodel, { ...place, name: "Claims Manager", level: "logical" })).toBeNull();
    expect(nameClash(state, metamodel, { ...place, name: "Fraud Check" })).toBeNull();
  });
});

describe("distinct relationships", () => {
  it("flags a second relationship of a structural kind between the same two objects", () => {
    const state = exampleState();
    const result = applyOk(state, [
      { edit: "createRelationship", id: "N1", type: "serves", sourceId: "O-APP-1", targetId: "O-PRC-1" },
    ]);
    expect(result.findings).toEqual([
      expect.objectContaining({
        rule: "serves:distinct",
        itemId: "N1",
        message: '"Claims Manager serves Handle Claim" already exists',
      }),
    ]);
  });

  it("allows flows with different payloads, and flags one with the same payload", () => {
    const state = exampleState();
    // Claims Manager already flows to Payments Hub, carrying nothing.
    const flow = (id: string, payload: string[]): Edit => ({
      edit: "createRelationship",
      id,
      type: "flowsTo",
      sourceId: "O-APP-1",
      targetId: "O-APP-3",
      payload,
    });
    expect(applyOk(state, [flow("N1", ["O-DAT-1"])]).findings).toEqual([]);
    const same = applyOk(state, [flow("N2", ["O-DAT-1"])]);
    expect(same.findings[0]!.message).toBe(
      '"Claims Manager flows to Payments Hub" already exists with the same payload',
    );
    expect(duplicateRelationships(state, metamodel, state.relationships.get("N2")!).map((r) => r.id)).toEqual(["N1"]);
    // Changing the payload makes it distinct again.
    const n2 = state.relationships.get("N2")!;
    const changed = applyOk(state, [{ edit: "setPayload", id: "N2", baseVersion: n2.version, payload: ["O-DAT-2"] }]);
    expect(changed.findings).toEqual([]);
  });
});
