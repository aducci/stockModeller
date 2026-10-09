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

describe("documents", () => {
  const hld = essentials.diagramTypes.find((t) => t.key === "hld")!;
  const compile = (document: unknown) => () =>
    Metamodel.compile(essentials.metamodel, [
      ...essentials.diagramTypes.filter((t) => t !== hld),
      { ...hld, document } as never,
    ]);

  it("have a subject that is an object", () => {
    const state = exampleState();
    applyOk(state, [{ edit: "createDiagram", id: "D-H", name: "HLD", diagramType: "hld", folderId: "F06" }]);
    const base = state.diagrams.get("D-H")!.version;
    expect(
      apply(state, [{ edit: "setViewDefinition", diagramId: "D-H", baseVersion: base, set: { subject: "R-08" } }]),
    ).toMatchObject({ ok: false, reasons: [{ code: "invalid", property: "set.subject" }] });
    applyOk(state, [{ edit: "setViewDefinition", diagramId: "D-H", baseVersion: base, set: { subject: "O-APP-3" } }]);
    expect(
      apply(state, [{ edit: "addObjectOccurrence", diagramId: "D-H", occurrence: occurrence("OC-X", "O-APP-1") }]),
    ).toMatchObject({ ok: false });
  });

  it("templates must name what exists", () => {
    expect(compile(hld.document)).not.toThrow();
    const sections = hld.document!.sections;
    expect(
      compile({ ...hld.document, sections: [...sections, { key: "subject", title: "S", component: "heading" }] }),
    ).toThrow(/reserved/);
    expect(compile({ ...hld.document, sections: [...sections, { key: "x", title: "X", component: "chart" }] })).toThrow(
      /unknown component/,
    );
    expect(
      compile({
        ...hld.document,
        sections: [...sections, { key: "x", title: "X", component: "diagramLink", config: { diagramType: "hld" } }],
      }),
    ).toThrow(/not a canvas/);
    expect(
      compile({
        ...hld.document,
        sections: [
          ...sections,
          {
            key: "x",
            title: "X",
            component: "relationTable",
            config: {
              source: { section: "summary", relationships: { kinds: ["flow"] } },
              columns: ["nope"],
              required: ["direction2"],
            },
          },
        ],
      }),
    ).toThrow(/not a linked diagram[\s\S]*unknown property "nope"[\s\S]*not one of its columns/);
  });

  it("resolve patterns and regions, and check what they add", () => {
    const mm = Metamodel.compile(essentials.metamodel, essentials.diagramTypes);
    const keys = (t: string) =>
      mm.diagramType(t)!.template!.entries.map((e) => ("region" in e ? `[${e.region}]` : e.key));
    expect(keys("hld")).toEqual(["summary", "facts", "context", "integrations", "risks", "[additional]"]);
    expect(keys("integrationSpec")).toEqual(["purpose", "context", "integrations", "details", "[additional]"]);
    const sections = hld.document!.sections;
    expect(compile({ ...hld.document, sections: [...sections, { use: "contextAndIntegrations" }] })).toThrow(
      /two sections "context" \(a pattern used twice needs a prefix\)/,
    );
    expect(
      compile({ ...hld.document, sections: [...sections, { use: "contextAndIntegrations", prefix: "data" }] }),
    ).not.toThrow();
    expect(
      compile({ ...hld.document, sections: [...sections, { key: "layout", title: "L", component: "heading" }] }),
    ).toThrow(/reserved/);
    expect(
      compile({ ...hld.document, sections: [...sections, { region: "more", title: "More", palette: ["repeater"] }] }),
    ).toThrow(/offers "repeater", which authors cannot add/);
    expect(
      compile({
        ...hld.document,
        sections: [
          ...sections,
          { key: "seq", title: "Seq", component: "sequenceLink", config: { diagramType: "sequence" } },
          {
            key: "rep",
            title: "Rep",
            component: "repeater",
            config: {
              source: { section: "summary" },
              sections: [{ key: "d", title: "D", component: "diagramLink", config: { diagramType: "context" } }],
            },
          },
        ],
      }),
    ).toThrow(/belongs in a repeater[\s\S]*not a relation table[\s\S]*not "diagramLink"/);
  });
});

describe("diagram subjects and documentation links (DOC-1)", () => {
  const app = (state: ReturnType<typeof exampleState>) => state.objects.get("O-APP-1")!;
  const setLinks = (state: ReturnType<typeof exampleState>, value: unknown) =>
    apply(state, [
      {
        edit: "setProperties",
        id: "O-APP-1",
        baseVersion: app(state).version,
        set: { "documentation.link": value as string[] },
      },
    ]);

  it("lets any diagram be about an object, and only an object", () => {
    const state = exampleState();
    applyOk(state, [
      {
        edit: "createDiagram",
        id: "D-ABOUT",
        name: "About",
        diagramType: "context",
        folderId: "F09",
        definition: { subject: "O-APP-1" },
      },
    ]);
    expect(state.diagrams.get("D-ABOUT")!.definition).toEqual({ subject: "O-APP-1" });
    expect(
      apply(state, [
        {
          edit: "createDiagram",
          id: "D-BAD",
          name: "Bad",
          diagramType: "context",
          folderId: "F09",
          definition: { subject: "O-NOPE" },
        },
      ]),
    ).toMatchObject({ ok: false, reasons: [{ code: "invalid", property: "definition.subject" }] });
  });

  it("keeps several links, web pages and diagrams, in a url property with many", () => {
    const state = exampleState();
    expect(setLinks(state, ["https://wiki.example.com/x", "diagram:D-01"]).ok).toBe(true);
    expect(app(state).properties["documentation.link"]).toEqual(["https://wiki.example.com/x", "diagram:D-01"]);
    // A single link stored before the type allowed many is still valid.
    expect(setLinks(state, "https://wiki.example.com/y").ok).toBe(true);
    expect(setLinks(state, ["ftp://x"])).toMatchObject({ ok: false });
    expect(setLinks(state, ["diagram:"])).toMatchObject({ ok: false });
    expect(setLinks(state, ["diagram:D-01", "diagram:D-01"])).toMatchObject({ ok: false });
    expect(setLinks(state, [1])).toMatchObject({ ok: false });
  });

  it("refuses a link property that is not a url with many, and many on anything but a url", () => {
    const types = essentials.diagramTypes.map((t) =>
      t.key === "context" ? { ...t, subject: { linkProperty: "ownership.businessOwner" } } : t,
    );
    expect(() => Metamodel.compile(essentials.metamodel, types)).toThrow(MetamodelError);
    const pkg = {
      ...essentials.metamodel,
      propertyTypes: essentials.metamodel.propertyTypes!.map((p) =>
        p.key === "technical.users" ? { ...p, many: true } : p,
      ),
    };
    expect(() => Metamodel.compile(pkg, essentials.diagramTypes)).toThrow(/only url properties/);
  });
});
