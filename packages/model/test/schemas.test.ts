import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";
import { readFileSync } from "node:fs";
import type { changeSchema, editSchema } from "../src";
import { parseChange, validateDiagramType, validatePackage, type Change, type Edit } from "../src";
import { readDesign, readDesignJson } from "./design";

describe("JSON Schemas", () => {
  it.each(["metamodel.schema.json", "diagram-type.schema.json"])("%s matches the design pack", (file) => {
    const copy = readFileSync(new URL(`../schemas/${file}`, import.meta.url), "utf8");
    expect(JSON.parse(copy)).toEqual(JSON.parse(readDesign(`05-structures/${file}`)));
  });

  it("accepts the Essentials example package", () => {
    const result = validatePackage(readDesignJson("05-structures/example-metamodel.json"));
    expect(result).toMatchObject({ ok: true });
  });

  it("accepts the example diagram type", () => {
    const result = validateDiagramType(readDesignJson("05-structures/example-diagram-type.json"));
    expect(result).toMatchObject({ ok: true });
  });

  it("reports where a package is wrong", () => {
    const result = validatePackage({ name: "Broken", version: "1", objectTypes: [], relationshipTypes: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join("\n")).toContain("/version");
  });
});

describe("change schema", () => {
  it("infers exactly the hand-written edit and change types", () => {
    expectTypeOf<z.output<typeof editSchema>>().toExtend<Edit>();
    expectTypeOf<Edit>().toExtend<z.input<typeof editSchema>>();
    expectTypeOf<z.output<typeof changeSchema>>().toExtend<Change>();
    expectTypeOf<Change>().toExtend<z.input<typeof changeSchema>>();
  });

  it("parses the API example from api.md and fills occurrence defaults", () => {
    const change = parseChange({
      id: "01J9Z3K2Q7V6B5N4M3L2K1J0HG",
      scenarioId: "S1",
      label: "Replace Legacy CRM with Cloud CRM",
      edits: [
        {
          edit: "createObject",
          id: "NEW",
          type: "saasApplication",
          name: "Cloud CRM",
          folderId: "APPS",
          properties: { "lifecycle.status": "planned", "lifecycle.activeFrom": "2026-07-01" },
        },
        { edit: "setProperties", id: "OLD", baseVersion: 12, set: { "lifecycle.status": "phaseOut" } },
        {
          edit: "addObjectOccurrence",
          diagramId: "D1",
          occurrence: { id: "OO", objectId: "NEW", x: 0, y: 0, w: 10, h: 10 },
        },
      ],
    });
    expect(change.edits[2]).toMatchObject({
      occurrence: { parentOccurrenceId: null, z: 0, style: {}, drillDownDiagramId: null, pinned: false },
    });
  });

  it("rejects unknown fields, unknown edits and empty changes", () => {
    const base = { id: "C", scenarioId: "S", label: "x" };
    expect(() => parseChange({ ...base, edits: [] })).toThrow();
    expect(() => parseChange({ ...base, edits: [{ edit: "teleport", id: "A" }] })).toThrow();
    expect(() =>
      parseChange({ ...base, edits: [{ edit: "renameObject", id: "A", baseVersion: 1, name: "B", nmae: "C" }] }),
    ).toThrow();
    expect(() =>
      parseChange({ ...base, edits: [{ edit: "renameObject", id: "A", baseVersion: 0, name: "B" }] }),
    ).toThrow();
  });
});
