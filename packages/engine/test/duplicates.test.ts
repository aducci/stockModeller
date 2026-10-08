// Possible duplicates, other names and not-duplicate judgements (design/02-model/duplicates-and-identity.md §6).
import { describe, expect, it } from "vitest";
import type { Edit } from "@connectome/model";
import { findSimilarObjects, possibleDuplicates, type ModelState } from "../src";
import { apply, applyOk, exampleState, metamodel } from "./fixtures";

const app = (id: string, name: string, properties = {}): Edit => ({
  edit: "createObject",
  id,
  type: "application",
  name,
  folderId: "F04",
  properties,
});
const rel = (id: string, type: string, sourceId: string, targetId: string): Edit => ({
  edit: "createRelationship",
  id,
  type,
  sourceId,
  targetId,
});
const pairs = (state: ModelState, query = {}) =>
  possibleDuplicates(state, metamodel, query).map((p) => [p.a.name, p.b.name].sort().join(" + "));
const pairOf = (state: ModelState, x: string, y: string) =>
  possibleDuplicates(state, metamodel).find((p) => (p.a.id === x && p.b.id === y) || (p.a.id === y && p.b.id === x));

describe("possibleDuplicates", () => {
  it("finds nothing in the example repository", () => {
    expect(pairs(exampleState())).toEqual([]);
  });

  it("finds the same name, a misspelling and an acronym, with reasons", () => {
    const state = exampleState();
    applyOk(state, [
      // Data objects only warn on a repeated name, so a second Claim can exist.
      { edit: "createObject", id: "D1", type: "dataObject", name: "claim", folderId: "F08" },
      app("A1", "Claim Manager"),
      app("A2", "CRM"),
      app("A3", "Customer Relationship Management"),
    ]);
    expect(pairOf(state, "D1", "O-DAT-1")).toMatchObject({ score: 1, reasons: ["Same name", "In the same folder"] });
    expect(pairOf(state, "A1", "O-APP-1")).toMatchObject({ reasons: ["Similar spelling", "In the same folder"] });
    expect(pairOf(state, "A2", "A3")?.reasons[0]).toBe("CRM stands for Customer Relationship Management");
  });

  it("matches other names (aliases)", () => {
    const state = exampleState();
    const crm = state.objects.get("O-APP-2")!;
    applyOk(state, [
      { edit: "setAliases", id: crm.id, baseVersion: crm.version, aliases: ["Siebel"] },
      app("A1", "Siebel"),
    ]);
    expect(pairOf(state, "A1", "O-APP-2")).toMatchObject({
      score: 1,
      reasons: ["Legacy CRM is also known as Siebel", "In the same folder"],
    });
    expect(findSimilarObjects(state, metamodel, { name: "siebel", type: "application" })[0]).toMatchObject({
      object: { id: "O-APP-2" },
      exact: true,
      reason: "Also known as Siebel",
    });
  });

  it("finds objects with different names that share their neighbours", () => {
    const state = exampleState();
    const links = (id: string, n: number): Edit[] => [
      rel(`R${n}1`, "realizes", id, "O-CAP-2"),
      rel(`R${n}2`, "serves", id, "O-PRC-1"),
      rel(`R${n}3`, "hostedOn", id, "O-SRV-1"),
      rel(`R${n}4`, "accesses", id, "O-DAT-1"),
    ];
    applyOk(state, [app("A1", "Atlas"), app("A2", "Orion"), ...links("A1", 1), ...links("A2", 2)]);
    const pair = pairOf(state, "A1", "A2")!;
    expect(pair.score).toBeGreaterThanOrEqual(0.8);
    expect(pair.reasons[0]).toBe("Each realizes Claim Intake, serves Handle Claim, is hosted on SRV-APP-01 and 1 more");
    // Two shared neighbours out of four say less, and a different name keeps them apart.
    applyOk(state, [app("A3", "Vega"), ...links("A3", 3).slice(0, 2)]);
    expect(pairOf(state, "A1", "A3")).toBeUndefined();
  });

  it("compares only related types at the same level, and not objects related to each other", () => {
    const state = exampleState();
    applyOk(state, [
      // A capability and an application share a name but are different kinds of thing.
      app("A1", "Claim Intake"),
      // The same name at another level is a deliberate second view.
      app("A2", "Claims Manager", { "semantic.level": "logical" }),
      // A SaaS application is in the application family.
      { edit: "createObject", id: "S1", type: "saasApplication", name: "Payment Hub", folderId: "F04" },
      // Two applications that exchange data are two applications, however alike their names.
      app("A3", "Claims Managr"),
      rel("R1", "flowsTo", "A3", "O-APP-1"),
    ]);
    expect(pairs(state)).toEqual(["Payment Hub + Payments Hub"]);
  });

  it("forgets a pair judged not duplicates, until one of them is renamed", () => {
    const state = exampleState();
    applyOk(state, [app("A1", "Claim Manager")]);
    const a1 = state.objects.get("A1")!;
    applyOk(state, [
      {
        edit: "setNotDuplicates",
        id: a1.id,
        baseVersion: a1.version,
        notDuplicates: [{ of: "O-APP-1", name: "Claim Manager", otherName: "Claims Manager" }],
      },
    ]);
    expect(pairOf(state, "A1", "O-APP-1")).toBeUndefined();
    const original = state.objects.get("O-APP-1")!;
    applyOk(state, [{ edit: "renameObject", id: original.id, baseVersion: original.version, name: "Claim Manager." }]);
    expect(pairOf(state, "A1", "O-APP-1")).toBeDefined();
  });

  it("lists only one object's pairs when asked", () => {
    const state = exampleState();
    applyOk(state, [app("A1", "Claim Manager"), app("A2", "CRM"), app("A3", "Customer Relationship Management")]);
    expect(pairs(state, { objectId: "A2" })).toEqual(["CRM + Customer Relationship Management"]);
  });
});

describe("setAliases and setNotDuplicates", () => {
  const reason = (state: ModelState, edits: Edit[]) => {
    const result = apply(state, edits);
    if (result.ok) throw new Error("expected a rejection");
    return result.reasons[0];
  };

  it("refuses blank or repeated names and a judgement about the object itself", () => {
    const state = exampleState();
    const crm = state.objects.get("O-APP-2")!;
    const base = { id: crm.id, baseVersion: crm.version };
    expect(reason(state, [{ edit: "setAliases", ...base, aliases: [" "] }])).toMatchObject({ property: "aliases" });
    expect(reason(state, [{ edit: "setAliases", ...base, aliases: ["Siebel", "siebel "] }])).toMatchObject({
      message: '"siebel" is listed twice',
    });
    expect(
      reason(state, [
        { edit: "setNotDuplicates", ...base, notDuplicates: [{ of: crm.id, name: crm.name, otherName: crm.name }] },
      ]),
    ).toMatchObject({ property: "notDuplicates" });
  });

  it("leaves the fields out when cleared, as on a fresh object", () => {
    const state = exampleState();
    const crm = state.objects.get("O-APP-2")!;
    applyOk(state, [{ edit: "setAliases", id: crm.id, baseVersion: crm.version, aliases: ["Siebel"] }]);
    const after = state.objects.get(crm.id)!;
    expect(after.aliases).toEqual(["Siebel"]);
    applyOk(state, [{ edit: "setAliases", id: crm.id, baseVersion: after.version, aliases: [] }]);
    expect("aliases" in state.objects.get(crm.id)!).toBe(false);
  });
});
