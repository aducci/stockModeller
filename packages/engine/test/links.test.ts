// Links as records (slice DOC-R2, design/02-model/views-and-design-artifacts.md §13): kinds from the metamodel,
// exactly one target of a kind the link kind allows, and deletes that take links with them and undo exactly.
import { describe, expect, it } from "vitest";
import { invertLog } from "../src";
import { apply, applyOk, exampleState, snapshot } from "./fixtures";

const v = (state: ReturnType<typeof exampleState>, id: string) => state.objects.get(id)!.version;

describe("links", () => {
  it("are loaded from the example: documents, drill-downs, a web page and a related element", () => {
    const state = exampleState();
    expect(state.links.find("bySource", "O-APP-1").map((l) => [l.kind, l.target])).toEqual([
      ["web", { url: "https://wiki.example.com/claims-manager" }],
      ["document", { diagramId: "D-04" }],
      ["drillDown", { diagramId: "D-03" }],
      ["related", { objectId: "O-APP-2" }],
    ]);
    expect(state.links.find("byObject", "O-APP-2").map((l) => l.id)).toEqual(["L-04"]);
    expect(state.links.find("byDiagram", "D-05").map((l) => l.sourceId)).toEqual(["O-FN-1"]);
  });

  it("point at one thing their kind allows, once", () => {
    const state = exampleState();
    const link = (id: string, kind: string, target: object, label?: string) =>
      apply(state, [
        { edit: "createLink", id, sourceId: "O-APP-3", kind, target: target as never, ...(label ? { label } : {}) },
      ]);
    expect(link("L-A", "document", { diagramId: "D-04" }).ok).toBe(true);
    expect(link("L-B", "document", { diagramId: "D-03" })).toMatchObject({
      ok: false,
      reasons: [{ code: "invalid", property: "target", message: "This kind of link cannot point at a diagram" }],
    });
    expect(link("L-B", "document", { diagramId: "D-04" })).toMatchObject({
      ok: false,
      reasons: [{ property: "target", message: "Payments Hub already has this link" }],
    });
    expect(link("L-B", "nope", { url: "https://x.example" })).toMatchObject({
      ok: false,
      reasons: [{ property: "kind" }],
    });
    expect(link("L-B", "web", { url: "ftp://x" })).toMatchObject({ ok: false, reasons: [{ property: "target.url" }] });
    expect(link("L-B", "web", { url: "https://x.example", diagramId: "D-04" })).toMatchObject({ ok: false });
    expect(link("L-B", "related", { objectId: "O-APP-3" })).toMatchObject({
      ok: false,
      reasons: [{ property: "target.objectId" }],
    });
    expect(link("L-B", "related", { objectId: "O-GONE" })).toMatchObject({ ok: false });
    expect(link("L-B", "web", { url: "https://x.example" }, " ")).toMatchObject({ ok: false });
    expect(link("L-B", "web", { url: "https://x.example" }, "Runbook").ok).toBe(true);
    expect(state.links.get("L-B")).toMatchObject({ kind: "web", label: "Runbook" });
  });

  it("change label and kind, and the inverse puts them back", () => {
    const state = exampleState();
    const before = snapshot(state);
    const result = applyOk(state, [
      { edit: "updateLink", id: "L-01", set: { label: null } },
      { edit: "updateLink", id: "L-04", set: { label: "Replaced by it" } },
    ]);
    expect(state.links.get("L-01")!.label).toBeUndefined();
    expect(state.links.get("L-04")!.label).toBe("Replaced by it");
    expect(apply(state, [{ edit: "updateLink", id: "L-04", set: { kind: "web" } }])).toMatchObject({
      ok: false,
      reasons: [{ property: "set.kind" }],
    });
    applyOk(state, JSON.parse(JSON.stringify(invertLog(result.log))));
    expect(snapshot(state)).toEqual(before);
  });

  it("go with the element they are on, the element they point at, and the diagram they point at", () => {
    const state = exampleState();
    const before = snapshot(state);
    const deleted = applyOk(state, [
      { edit: "deleteObject", id: "O-APP-2", baseVersion: v(state, "O-APP-2") },
      { edit: "deleteDiagram", id: "D-04" },
      { edit: "deleteObject", id: "O-FN-1", baseVersion: v(state, "O-FN-1") },
    ]);
    expect(state.links.get("L-04")).toBeUndefined(); // to Legacy CRM
    expect(state.links.get("L-02")).toBeUndefined(); // to the high-level design
    expect(state.links.get("L-08")).toBeUndefined(); // from Pay a claim
    expect(state.links.find("bySource", "O-APP-1").map((l) => l.id)).toEqual(["L-01", "L-03"]);
    applyOk(state, JSON.parse(JSON.stringify(invertLog(deleted.log))));
    expect(snapshot(state)).toEqual(before);
  });
});
