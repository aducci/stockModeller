// Publishing a whole edited metamodel (slice A-1b; design/02-model/metamodel.md §7): new property types and where
// they apply, values kept when a type stops carrying them, refusals that would break stored data, and the new
// properties on relationships and diagrams.
import { afterAll, beforeAll, expect, it } from "vitest";
import type { RepositorySnapshot } from "@connectome/engine";
import type { DiagramType, MetamodelPackage } from "@connectome/model";
import { PROBLEM, REPO, describeDb, expectContract, schema, setup } from "./helpers";

const PUBLISH = `/repositories/${REPO}/metamodel`;

describeDb("publishing a metamodel", () => {
  let api: Awaited<ReturnType<typeof setup>>;
  beforeAll(async () => {
    api = await setup();
  });
  afterAll(() => api?.close());

  const snapshot = async () => (await api.get(`/repositories/${REPO}/snapshot`)).body as RepositorySnapshot;
  /** The current metamodel with `change` applied, as the admin screens send it. */
  const draft = async (change: (pkg: MetamodelPackage, diagramTypes: DiagramType[]) => void) => {
    const { metamodel } = await snapshot();
    const pkg = structuredClone(metamodel.package);
    const diagramTypes = structuredClone(metamodel.diagramTypes);
    change(pkg, diagramTypes);
    const { version, ...rest } = pkg;
    return { baseVersion: version, metamodel: rest, diagramTypes };
  };

  it("previews the values a type stops carrying, without publishing", async () => {
    const body = await draft((pkg) => {
      const server = pkg.objectTypes.find((t) => t.key === "server")!;
      server.properties = server.properties!.filter((p) => p !== "lifecycle.status");
    });
    const res = await api.put(`${PUBLISH}?preview=true`, body);
    expect(res.status).toBe(200);
    expectContract(res.body, schema("MetamodelResult"));
    expect(res.body).toMatchObject({
      preview: true,
      version: "1.6.1",
      stranded: [{ propertyType: "lifecycle.status", count: 1 }],
    });
    expect((await snapshot()).metamodel.package.version).toBe("1.6.0");
  });

  it("refuses drafts that would break stored values or do not compile", async () => {
    const retype = await api.put(
      PUBLISH,
      await draft((pkg) => {
        const status = pkg.propertyTypes!.find((p) => p.key === "lifecycle.status")!;
        status.dataType = "text";
        delete status.valueList;
      }),
    );
    expect(retype.status).toBe(422);
    expectContract(retype.body, PROBLEM);
    expect(JSON.stringify(retype.body)).toContain("data type cannot change");

    const dropValue = await api.put(
      PUBLISH,
      await draft((pkg) => {
        const list = pkg.valueLists!.find((l) => l.key === "lifecycleStatus")!;
        list.values = list.values.filter((v) => v.key !== "active");
      }),
    );
    expect(dropValue.status).toBe(422);
    expect(JSON.stringify(dropValue.body)).toContain('value \\"active\\" is removed');

    const unknown = await api.put(
      PUBLISH,
      await draft((pkg) => pkg.objectTypes.find((t) => t.key === "server")!.properties!.push("risk.nothing")),
    );
    expect(unknown.status).toBe(422);
    expect(JSON.stringify(unknown.body)).toContain("risk.nothing");

    const stale = await api.put(PUBLISH, { ...(await draft(() => {})), baseVersion: "0.9.0" });
    expect(stale.status).toBe(409);
  });

  it("publishes new properties for objects, relationships and diagrams, keeping removed values", async () => {
    const body = await draft((pkg, diagramTypes) => {
      pkg.propertyTypes!.push(
        { key: "risk.notes", name: "Risk notes", group: "risk", dataType: "text" },
        { key: "flow.volume", name: "Volume", group: "flow", dataType: "number", unit: "per day" },
        { key: "review.state", name: "Review state", group: "review", dataType: "list", valueList: "reviewState" },
      );
      pkg.valueLists!.push({
        key: "reviewState",
        values: [
          { key: "draft", label: "Draft" },
          { key: "approved", label: "Approved" },
        ],
      });
      pkg.objectTypes.find((t) => t.key === "application")!.properties!.push("risk.notes");
      const server = pkg.objectTypes.find((t) => t.key === "server")!;
      server.properties = server.properties!.filter((p) => p !== "lifecycle.status");
      const flows = pkg.relationshipTypes.find((t) => t.key === "flowsTo")!;
      flows.properties = [...(flows.properties ?? []), "flow.volume"];
      diagramTypes[0]!.properties = [...(diagramTypes[0]!.properties ?? []), "review.state"];
    });
    const res = await api.put(PUBLISH, body);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ preview: false, version: "1.6.1" });

    const after = await snapshot();
    expect(after.metamodel.package.version).toBe("1.6.1");
    expect(after.metamodel.package.propertyTypes!.map((p) => p.key)).toContain("risk.notes");
    // The server's status is kept although its type no longer carries it.
    expect(after.rows.objects.find((o) => o.id === "O-SRV-1")!.properties["lifecycle.status"]).toBeDefined();

    const flow = after.rows.relationships.find((r) => r.type === "flowsTo")!;
    const diagram = after.rows.diagrams.find((d) => d.id === "D-01")!;
    const app = after.rows.objects.find((o) => o.id === "O-APP-1")!;
    const change = await api.post(`/repositories/${REPO}/changes`, {
      id: "C-NEW-PROPS",
      label: "Use the new properties",
      edits: [
        { edit: "setProperties", id: app.id, baseVersion: app.version, set: { "risk.notes": "Single supplier" } },
        { edit: "setRelationshipProperties", id: flow.id, baseVersion: flow.version, set: { "flow.volume": 1200 } },
        {
          edit: "setDiagramProperties",
          id: diagram.id,
          baseVersion: diagram.version,
          set: { "review.state": "draft" },
        },
      ],
    });
    expect(change.status).toBe(201);
    const later = await snapshot();
    expect(later.rows.relationships.find((r) => r.id === flow.id)!.properties["flow.volume"]).toBe(1200);
    expect(later.rows.diagrams.find((d) => d.id === "D-01")!.properties).toEqual({ "review.state": "draft" });
    const read = await api.get(`/repositories/${REPO}/diagrams/D-01`);
    expect(read.body).toMatchObject({ properties: { "review.state": "draft" } });

    // A value the type no longer carries can be cleared, not set.
    const server = later.rows.objects.find((o) => o.id === "O-SRV-1")!;
    const set = await api.post(`/repositories/${REPO}/changes`, {
      id: "C-SET-STRANDED",
      label: "Set a removed property",
      edits: [
        { edit: "setProperties", id: server.id, baseVersion: server.version, set: { "lifecycle.status": "active" } },
      ],
    });
    expect(set.status).toBe(422);
    const clear = await api.post(`/repositories/${REPO}/changes`, {
      id: "C-CLEAR-STRANDED",
      label: "Clear a removed property",
      edits: [{ edit: "setProperties", id: server.id, baseVersion: server.version, set: { "lifecycle.status": null } }],
    });
    expect(clear.status).toBe(201);
  });
});
