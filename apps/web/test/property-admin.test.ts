import { describe, expect, it } from "vitest";
import { essentials } from "@connectome/content";
import {
  camelKey,
  compileDraft,
  countDraftChanges,
  draftChanges,
  inheritedFrom,
  newPropertyKey,
  ownCarriers,
  removePropertyType,
  sameAsPublished,
  setCarried,
  upsertPropertyType,
  upsertValueList,
  type Draft,
} from "../src/property-admin";

const published: Draft = { package: essentials.metamodel, diagramTypes: essentials.diagramTypes };

describe("keys", () => {
  it("makes camel-case keys from names, numbered when taken", () => {
    expect(camelKey("Risk notes")).toBe("riskNotes");
    expect(camelKey("3rd party")).toBe("p3rdParty");
    expect(newPropertyKey("Risk", "Notes", [])).toBe("risk.notes");
    expect(newPropertyKey("risk", "notes", ["risk.notes"])).toBe("risk.notes2");
  });
});

describe("carrying properties", () => {
  it("gives a property to object, relationship and diagram types and takes it away again", () => {
    let draft = upsertPropertyType(published, {
      key: "risk.notes",
      name: "Risk notes",
      group: "risk",
      dataType: "text",
    });
    draft = setCarried(draft, "object", "server", "risk.notes", true);
    draft = setCarried(draft, "relationship", "flowsTo", "risk.notes", true);
    draft = setCarried(draft, "diagram", "applicationLandscape", "risk.notes", true);
    expect(ownCarriers(draft, "risk.notes")).toEqual({
      object: ["server"],
      relationship: ["flowsTo"],
      diagram: ["applicationLandscape"],
    });
    const compiled = compileDraft(draft);
    expect(compiled.metamodel!.objectType("server")!.properties.has("risk.notes")).toBe(true);
    expect(compiled.metamodel!.relationshipTypeProperties("flowsTo").has("risk.notes")).toBe(true);
    expect(compiled.metamodel!.diagramType("applicationLandscape")!.properties.has("risk.notes")).toBe(true);

    const removed = removePropertyType(draft, "risk.notes");
    expect(ownCarriers(removed, "risk.notes")).toEqual({ object: [], relationship: [], diagram: [] });
    expect(sameAsPublished(published, removed)).toBe(true);
  });

  it("knows where an inherited property comes from, and drops it from property sets when it is taken away", () => {
    expect(inheritedFrom(published.package, "application", "cost.runCost")?.key).toBe("applicationBase");
    const draft = setCarried(published, "object", "applicationBase", "cost.runCost", false);
    expect(compileDraft(draft).problems).toEqual([]);
    const sets = draft.package.objectTypes.find((t) => t.key === "applicationBase")!.propertySets ?? [];
    expect(sets.every((s) => !s.properties.includes("cost.runCost"))).toBe(true);
  });

  it("renames a new property's key everywhere it is used", () => {
    let draft = upsertPropertyType(published, {
      key: "custom.newProperty",
      name: "New",
      group: "custom",
      dataType: "text",
    });
    draft = setCarried(draft, "object", "server", "custom.newProperty", true);
    draft = upsertPropertyType(
      draft,
      { key: "risk.owner", name: "Owner", group: "risk", dataType: "text" },
      "custom.newProperty",
    );
    expect(ownCarriers(draft, "risk.owner").object).toEqual(["server"]);
    expect(ownCarriers(draft, "custom.newProperty").object).toEqual([]);
  });
});

describe("draft changes", () => {
  it("counts a new list property with its list and types as one change, plus each later edit", () => {
    let draft = upsertValueList(published, { key: "riskLevel", values: [{ key: "low", label: "Low" }] });
    draft = upsertPropertyType(draft, {
      key: "risk.level",
      name: "Risk level",
      group: "risk",
      dataType: "list",
      valueList: "riskLevel",
    });
    draft = setCarried(draft, "object", "server", "risk.level", true);
    const changes = draftChanges(published, draft);
    expect(changes.properties.added.map((p) => p.key)).toEqual(["risk.level"]);
    expect(changes.carried.added).toEqual([{ kind: "object", type: "server", property: "risk.level" }]);
    expect(countDraftChanges(changes)).toBe(1);

    const more = setCarried(draft, "object", "server", "lifecycle.status", false);
    expect(countDraftChanges(draftChanges(published, more))).toBe(2);
  });

  it("reports a list property without its list as a problem", () => {
    const draft = upsertPropertyType(published, {
      key: "risk.level",
      name: "Risk level",
      group: "risk",
      dataType: "list",
      valueList: "missing",
    });
    expect(compileDraft(draft).problems.join()).toContain("unknown value list");
  });
});
