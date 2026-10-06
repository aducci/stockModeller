import { describe, expect, it } from "vitest";
import { essentials } from "@connectome/content";
import { Metamodel } from "@connectome/engine";
import type { PropertyType, ValueList } from "@connectome/model";
import { displayValue, editorFor, fieldGroups, isRatingList } from "../src/inspector";

const metamodel = Metamodel.compile(essentials.metamodel, essentials.diagramTypes);
const list = (key: string) => metamodel.valueList(key)!;
const pt = (over: Partial<PropertyType>): PropertyType => ({
  key: "x.y",
  name: "Y",
  group: "x",
  dataType: "text",
  ...over,
});
const short: ValueList = {
  key: "hosting",
  values: [
    { key: "onPrem", label: "On-prem" },
    { key: "cloud", label: "Cloud" },
    { key: "saas", label: "SaaS" },
  ],
};

describe("the properties panel's editors", () => {
  it("chooses an editor from the data type and the value list", () => {
    expect(editorFor(pt({ dataType: "list" }), list("fit"))).toBe("rating");
    expect(editorFor(pt({ dataType: "list" }), short)).toBe("segmented");
    // Four values whose labels would not fit a 300 px panel side by side.
    expect(editorFor(pt({ dataType: "list" }), list("lifecycleStatus"))).toBe("dropdown");
    expect(editorFor(pt({ dataType: "list" }), list("criticality"))).toBe("dropdown");
    expect(editorFor(pt({ dataType: "boolean" }))).toBe("switch");
    expect(editorFor(pt({ dataType: "multiList" }), short)).toBe("chips");
    expect(editorFor(pt({ dataType: "money" }))).toBe("money");
    expect(editorFor(pt({ dataType: "richText" }))).toBe("multiline");
    expect(editorFor(pt({ dataType: "objectRef" }))).toBe("objectRef");
    expect(editorFor(pt({ dataType: "person" }))).toBe("text");
    expect(editorFor(pt({ dataType: "calculated" }))).toBe("calculated");
  });

  it("follows a property type's editor hint where it fits the data type", () => {
    expect(editorFor(pt({ dataType: "list", editor: "dropdown" }), short)).toBe("dropdown");
    expect(editorFor(pt({ dataType: "list", editor: "radio" }), list("lifecycleStatus"))).toBe("segmented");
    expect(editorFor(pt({ dataType: "list", editor: "rating" }), short)).toBe("rating");
    expect(editorFor(pt({ dataType: "boolean", editor: "checkbox" }))).toBe("checkbox");
    // A hint that does not fit the data type is ignored.
    expect(editorFor(pt({ dataType: "number", editor: "segmented" }))).toBe("number");
  });

  it("treats lists keyed 1..n as ratings", () => {
    expect(isRatingList(list("fit"))).toBe(true);
    expect(isRatingList(short)).toBe(false);
    expect(isRatingList({ key: "one", values: [{ key: "1", label: "1" }] })).toBe(false);
  });

  it("shows values in the reader's words", () => {
    expect(displayValue("phaseOut", list("lifecycleStatus"))).toBe("Phase out");
    expect(displayValue({ amount: 1200, currency: "EUR" })).toBe("1200 EUR");
    expect(displayValue(["cloud", "saas"], short)).toBe("Cloud, SaaS");
    expect(displayValue(null)).toBe("");
  });
});

describe("the properties panel's fields", () => {
  const keys = ["lifecycle.status", "lifecycle.activeFrom", "assessment.businessFit", "cost.totalCost"];
  const values = { "lifecycle.status": "active", "assessment.businessFit": "4" };

  it("groups fields in the type's order and counts how complete each group is", () => {
    const { groups, hidden } = fieldGroups(metamodel, keys, values);
    expect(groups.map((g) => [g.name, g.filled, g.total])).toEqual([
      ["Lifecycle", 1, 2],
      ["Assessment", 1, 1],
      ["Cost", 1, 1], // a calculated value is never empty
    ]);
    expect(groups[0]!.fields.map((f) => f.editor)).toEqual(["dropdown", "date"]);
    expect(hidden).toBe(0);
  });

  it("hides empty fields and says how many", () => {
    const { groups, hidden } = fieldGroups(metamodel, keys, values, { hideEmpty: true });
    expect(groups[0]!.fields.map((f) => f.pt.key)).toEqual(["lifecycle.status"]);
    expect(groups[0]!.total).toBe(2);
    expect(hidden).toBe(1);
  });

  it("filters by name, key or the value a reader sees, and drops groups left empty", () => {
    const byValue = fieldGroups(metamodel, keys, values, { filter: "ACTIVE" }).groups;
    expect(byValue.flatMap((g) => g.fields.map((f) => f.pt.key))).toEqual(["lifecycle.status", "lifecycle.activeFrom"]);
    expect(fieldGroups(metamodel, keys, values, { filter: "fit" }).groups.map((g) => g.name)).toEqual(["Assessment"]);
    expect(fieldGroups(metamodel, keys, values, { filter: "zzz" }).groups).toEqual([]);
  });
});
