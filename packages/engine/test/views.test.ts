// Views beyond the canvas (design/02-model/views-and-design-artifacts.md): a definition patched key by key, and
// views that hold no occurrences.
import { describe, expect, it } from "vitest";
import { essentials } from "@connectome/content";
import { Metamodel, MetamodelError } from "../src";
import { apply, applyOk, dana, exampleState, lee, occurrence } from "./fixtures";

const matrix = (state = exampleState()) => {
  applyOk(state, [
    { edit: "createDiagram", id: "D-MX", name: "Matrix", diagramType: "capabilityMatrix", folderId: "F06" },
  ]);
  return state;
};

describe("view definitions", () => {
  it("are patched key by key, and null removes a key", () => {
    const state = matrix();
    const v = () => state.diagrams.get("D-MX")!;
    applyOk(state, [
      { edit: "setViewDefinition", diagramId: "D-MX", baseVersion: v().version, set: { hideEmpty: true } },
    ]);
    applyOk(state, [
      { edit: "setViewDefinition", diagramId: "D-MX", baseVersion: v().version, set: { groupRows: false } },
    ]);
    expect(v().definition).toEqual({ hideEmpty: true, groupRows: false });
    applyOk(state, [
      {
        edit: "setViewDefinition",
        diagramId: "D-MX",
        baseVersion: v().version,
        set: { hideEmpty: null, groupRows: null },
      },
    ]);
    expect(v().definition).toBeUndefined();
  });

  it("conflict only when the same key changed meanwhile", () => {
    const state = matrix();
    const base = state.diagrams.get("D-MX")!.version;
    applyOk(state, [{ edit: "setViewDefinition", diagramId: "D-MX", baseVersion: base, set: { hideEmpty: true } }], {
      actor: dana,
    });
    const other = { edit: "setViewDefinition" as const, diagramId: "D-MX", baseVersion: base };
    applyOk(state, [{ ...other, set: { groupRows: false } }], { actor: lee });
    expect(apply(state, [{ ...other, set: { hideEmpty: false } }], { actor: lee })).toMatchObject({
      ok: false,
      reasons: [{ code: "conflict", property: "definition.hideEmpty", changedBy: dana.id }],
    });
  });

  it("survive deleting and restoring the view", () => {
    const state = matrix();
    const v = state.diagrams.get("D-MX")!;
    applyOk(state, [
      { edit: "setViewDefinition", diagramId: "D-MX", baseVersion: v.version, set: { hideEmpty: true } },
    ]);
    const deleted = applyOk(state, [{ edit: "deleteDiagram", id: "D-MX" }]);
    const restore = deleted.log.flatMap((e) => e.inverse).reverse();
    applyOk(state, restore);
    expect(state.diagrams.get("D-MX")!.definition).toEqual({ hideEmpty: true });
  });
});

describe("matrix views", () => {
  it("hold no symbols", () => {
    const state = matrix();
    expect(
      apply(state, [{ edit: "addObjectOccurrence", diagramId: "D-MX", occurrence: occurrence("OC-X", "O-APP-1") }]),
    ).toMatchObject({ ok: false, reasons: [{ code: "invalid", property: "diagramId" }] });
  });

  it("cannot become canvases, nor canvases matrices", () => {
    const state = matrix();
    const v = state.diagrams.get("D-MX")!;
    expect(
      apply(state, [
        { edit: "updateDiagram", id: "D-MX", baseVersion: v.version, set: { diagramType: "applicationLandscape" } },
      ]),
    ).toMatchObject({ ok: false, reasons: [{ code: "invalid", property: "set.diagramType" }] });
  });

  it("must name types and relationship types that exist", () => {
    const broken = {
      ...essentials.diagramTypes[1]!,
      matrix: { ...essentials.diagramTypes[1]!.matrix!, create: "nope" },
    };
    expect(() => Metamodel.compile(essentials.metamodel, [broken])).toThrow(MetamodelError);
  });
});
