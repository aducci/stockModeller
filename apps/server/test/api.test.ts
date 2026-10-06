import { afterAll, beforeAll, expect, it } from "vitest";
import { Metamodel, stateFromSnapshot, type RepositorySnapshot } from "@connectome/engine";
import { buildApp, devAuthenticate } from "../src";
import { BASELINE, DANA, PROBLEM, REPO, TARGET, describeDb, expectContract, schema, setup, token } from "./helpers";

describeDb("API", () => {
  let api: Awaited<ReturnType<typeof setup>>;
  beforeAll(async () => (api = await setup()));
  afterAll(() => api?.close());

  // The example from design/03-platform/api.md §3, against the example repository.
  const replaceCrm = {
    id: "01J9Z3K2Q7V6B5N4M3L2K1J0HG",
    label: "Replace Legacy CRM with Cloud CRM",
    edits: [
      {
        edit: "createObject",
        id: "01J-NEW",
        type: "saasApplication",
        name: "Cloud CRM",
        folderId: "F04",
        properties: { "lifecycle.status": "planned", "lifecycle.activeFrom": "2026-07-01" },
      },
      {
        edit: "setProperties",
        id: "O-APP-2",
        baseVersion: 1,
        set: { "lifecycle.status": "phaseOut", "lifecycle.retiredFrom": "2027-03-31" },
      },
      { edit: "createRelationship", id: "01J-REL", type: "serves", sourceId: "01J-NEW", targetId: "O-PRC-1" },
    ],
  };

  it("checks responses against the OpenAPI contract (and the check can fail)", () => {
    expect(() => expectContract({ id: "X" }, schema("ModelObject"))).toThrow();
  });

  it("answers health checks without signing in, and refuses the API without a token", async () => {
    const health = await api.app.inject({ method: "GET", url: "/healthz" });
    expect(health.statusCode).toBe(200);
    const res = await api.get("/repositories", "");
    expect(res.status).toBe(401);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    expect(res.body).toMatchObject({ status: 401, code: "unauthenticated" });
  });

  it("lists repositories and their scenarios", async () => {
    const list = await api.get("/repositories");
    expect(list.body).toEqual([expect.objectContaining({ id: REPO, seq: 1, baselineScenarioId: BASELINE })]);
    const one = await api.get(`/repositories/${REPO}`);
    expect(one.body).toMatchObject({
      scenarios: [
        { id: BASELINE, parentId: null },
        { id: TARGET, parentId: BASELINE },
      ],
    });
    for (const r of list.body as unknown[]) expectContract(r, schema("Repository"));
    for (const sc of (one.body as { scenarios: unknown[] }).scenarios) expectContract(sc, schema("Scenario"));
  });

  it("commits the api.md example in a scenario: 201 with seq and versions", async () => {
    const res = await api.post(`/repositories/${REPO}/changes?scenario=${TARGET}`, replaceCrm);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      seq: 2,
      changeId: replaceCrm.id,
      versions: { "01J-NEW": 1, "O-APP-2": 2, "01J-REL": 1 },
      findings: [],
      heldInChangeRequest: null,
    });
    expectContract(res.body, schema("ChangeResult"));
  });

  it("returns the original outcome when a change is resent", async () => {
    const res = await api.post(`/repositories/${REPO}/changes?scenario=${TARGET}`, replaceCrm);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ seq: 2, versions: { "O-APP-2": 2 } });
    const changes = await api.get(`/repositories/${REPO}/changes?since=1`);
    expect(changes.body).toHaveLength(1);
  });

  it("keeps the scenario's edits out of the baseline", async () => {
    const inScenario = await api.get(`/repositories/${REPO}/objects/O-APP-2?scenario=${TARGET}`);
    expect(inScenario.body).toMatchObject({ version: 2, properties: { "lifecycle.status": "phaseOut" } });
    expectContract(inScenario.body, schema("ModelObject"));
    const inBaseline = await api.get(`/repositories/${REPO}/objects/O-APP-2`);
    expect(inBaseline.body).toMatchObject({ version: 1, properties: { "lifecycle.status": "active" } });
    expect((await api.get(`/repositories/${REPO}/objects/01J-NEW`)).status).toBe(404);
  });

  it("rejects a conflicting edit with 409 and says who changed it", async () => {
    const res = await api.post(`/repositories/${REPO}/changes?scenario=${TARGET}`, {
      id: "C-STALE",
      label: "Stale",
      edits: [{ edit: "setProperties", id: "O-APP-2", baseVersion: 1, set: { "lifecycle.status": "retired" } }],
    });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      code: "conflict",
      details: [{ editIndex: 0, property: "properties.lifecycle.status", changedBy: DANA }],
    });
    expectContract(res.body, PROBLEM);
  });

  it("rejects rule violations and malformed changes with 422", async () => {
    const rule = await api.post(`/repositories/${REPO}/changes`, {
      id: "C-RULE",
      label: "Bad",
      edits: [{ edit: "createRelationship", id: "X", type: "serves", sourceId: "O-APP-1", targetId: "O-SRV-1" }],
    });
    expect(rule.status).toBe(422);
    expect(rule.body).toMatchObject({ code: "ruleViolation", details: [{ rule: "serves:allowedPairs" }] });
    expectContract(rule.body, PROBLEM);

    const malformed = await api.post(`/repositories/${REPO}/changes`, {
      id: "C-BAD",
      label: "Bad",
      edits: [{ edit: "renameObject", id: "O-APP-1", name: "No base version" }],
    });
    expect(malformed.status).toBe(422);
    expect(malformed.body).toMatchObject({ code: "invalid", details: [expect.objectContaining({ editIndex: 0 })] });
    expectContract(malformed.body, PROBLEM);
  });

  it("previews a change without committing it", async () => {
    const before = await api.get(`/repositories/${REPO}`);
    const res = await api.post(`/repositories/${REPO}/changes?preview=true`, {
      id: "C-PREVIEW",
      label: "Preview",
      edits: [{ edit: "renameObject", id: "O-APP-1", baseVersion: 1, name: "Claims Hub" }],
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ preview: true, seq: null, versions: { "O-APP-1": 2 } });
    expectContract(res.body, schema("ChangeResult"));
    expect((await api.get(`/repositories/${REPO}/objects/O-APP-1`)).body).toMatchObject({
      name: "Claims Manager",
      version: 1,
    });
    expect((await api.get(`/repositories/${REPO}`)).body).toMatchObject({ seq: (before.body as { seq: number }).seq });
  });

  it("reads folders, objects with a query and paging, relationships and occurrences", async () => {
    const folders = await api.get(`/repositories/${REPO}/folders`);
    expect(folders.body).toHaveLength(7);
    for (const f of folders.body as unknown[]) expectContract(f, schema("Folder"));

    const apps = await api.get(`/repositories/${REPO}/objects?q=${encodeURIComponent("type:applicationBase")}&limit=2`);
    expect(apps.body).toMatchObject({ seq: 2, hidden: 0 });
    const page1 = apps.body as { items: { id: string }[]; nextCursor: string };
    expect(page1.items.map((o) => o.id)).toEqual(["O-APP-1", "O-APP-2"]);
    const page2 = await api.get(
      `/repositories/${REPO}/objects?q=type:applicationBase&limit=2&cursor=${page1.nextCursor}`,
    );
    expect(page2.body).toMatchObject({ items: [{ id: "O-APP-3" }], nextCursor: null });

    const inFolder = await api.get(
      `/repositories/${REPO}/objects?q=${encodeURIComponent('folder:"Business" AND type:capability')}`,
    );
    expect((inFolder.body as { items: unknown[] }).items).toHaveLength(3);

    const unsupported = await api.get(
      `/repositories/${REPO}/objects?q=${encodeURIComponent("lifecycle.status = active")}`,
    );
    expect(unsupported.status).toBe(422);

    const rels = await api.get(`/repositories/${REPO}/relationships?source=O-APP-1&type=flowsTo`);
    expect((rels.body as { id: string }[]).map((r) => r.id)).toEqual(["R-08"]);
    expectContract((rels.body as unknown[])[0], schema("Relationship"));

    const occurrences = await api.get(`/repositories/${REPO}/objects/O-APP-1/occurrences`);
    expect(occurrences.body).toEqual([
      { diagramId: "D-01", diagramName: "Claims landscape", occurrenceId: "OO-4" },
      { diagramId: "D-01", diagramName: "Claims landscape", occurrenceId: "OO-6" },
    ]);
  });

  it("traces by meaning and filters objects by category and level", async () => {
    const upstream = await api.get(`/repositories/${REPO}/objects/O-APP-3/trace?kind=flow&direction=backward`);
    expect(upstream.status).toBe(200);
    expectContract(upstream.body, schema("Trace"));
    expect((upstream.body as { steps: { name: string; depth: number }[] }).steps).toMatchObject([
      { name: "Claims Manager", depth: 1, relationshipId: "R-08" },
      { name: "Legacy CRM", depth: 2, relationshipId: "R-09" },
    ]);
    const down = await api.get(`/repositories/${REPO}/objects/O-CAP-2/trace?kind=levels&depth=1`);
    expect((down.body as { steps: { objectId: string; level: string }[] }).steps).toEqual([
      expect.objectContaining({ objectId: "O-APP-1", level: "implementation" }),
    ]);
    expect((await api.get(`/repositories/${REPO}/objects/O-APP-3/trace?kind=sideways`)).status).toBe(422);
    expect((await api.get(`/repositories/${REPO}/objects/NOPE/trace?kind=flow`)).status).toBe(404);

    const components = await api.get(`/repositories/${REPO}/objects?q=${encodeURIComponent("category:component")}`);
    expect((components.body as { items: { id: string }[] }).items.map((o) => o.id)).toEqual([
      "O-APP-1",
      "O-APP-2",
      "O-APP-3",
    ]);
    const conceptual = await api.get(
      `/repositories/${REPO}/objects?q=${encodeURIComponent("level:conceptual AND type:process")}`,
    );
    expect((conceptual.body as { items: { id: string }[] }).items.map((o) => o.id)).toEqual(["O-PRC-1"]);
  });

  it("reads a diagram with its occurrences and annotations", async () => {
    const res = await api.get(`/repositories/${REPO}/diagrams/D-01`);
    expect(res.status).toBe(200);
    const diagram = res.body as {
      objectOccurrences: unknown[];
      relationshipOccurrences: unknown[];
      annotations: unknown[];
    };
    expect(diagram.objectOccurrences).toHaveLength(6);
    expect(diagram.relationshipOccurrences).toHaveLength(4);
    expect(diagram.annotations).toHaveLength(1);
    expectContract(res.body, schema("Diagram"));
  });

  it("returns a scenario's whole state as engine rows in a snapshot", async () => {
    const res = await api.get(`/repositories/${REPO}/snapshot?scenario=${TARGET}`);
    expect(res.status).toBe(200);
    expectContract(res.body, schema("Snapshot"));
    const snap = res.body as RepositorySnapshot;
    expect(snap).toMatchObject({ seq: 2, repository: { id: REPO, seq: 2 }, scenario: { id: TARGET } });
    // The metamodel compiles as the browser will compile it.
    expect(
      Metamodel.compile(snap.metamodel.package, snap.metamodel.diagramTypes).objectType("application"),
    ).toBeDefined();
    const state = stateFromSnapshot(snap.rows);
    expect(state.objects.get("O-APP-2")).toMatchObject({ version: 2, properties: { "lifecycle.status": "phaseOut" } });
    expect(state.objects.get("01J-NEW")).toBeDefined();
    expect(snap.rows.objects.every((o) => !("scenarioId" in o) && !("baseVersion" in o))).toBe(true);
    // The rows carry the change's commit time, so a browser replaying the change gets identical rows.
    const changes = (await api.get(`/repositories/${REPO}/changes?since=1`)).body as { committedAt: string }[];
    expect(state.objects.get("01J-NEW")!.updatedAt).toBe(changes[0]!.committedAt);

    const baseline = (await api.get(`/repositories/${REPO}/snapshot`)).body as RepositorySnapshot;
    expect(baseline.scenario.id).toBe(BASELINE);
    expect(stateFromSnapshot(baseline.rows).objects.get("O-APP-2")).toMatchObject({ version: 1 });
    expect((await api.get(`/repositories/${REPO}/snapshot?scenario=nope`)).status).toBe(404);
  });

  it("lists committed changes since a sequence number", async () => {
    const res = await api.get(`/repositories/${REPO}/changes?since=0`);
    const changes = res.body as { seq: number; edits: unknown[] }[];
    expect(changes.map((c) => c.seq)).toEqual([1, 2]);
    expect(changes[1]).toMatchObject({ changeId: replaceCrm.id, actor: DANA, source: "api", scenarioId: TARGET });
    expect(changes[1]!.edits).toHaveLength(3);
    for (const c of changes) expectContract(c, schema("ChangeSummary"));
  });

  it("shows an object's history", async () => {
    const res = await api.get(`/repositories/${REPO}/objects/O-APP-2/history?scenario=${TARGET}`);
    expect((res.body as { seq: number }[]).map((h) => h.seq)).toEqual([2, 1]);
  });

  it("undoes your own change, once, and not other people's", async () => {
    const other = await api.post(`/repositories/${REPO}/changes/${replaceCrm.id}/undo`, {}, token("lee@example.com"));
    expect(other.status).toBe(403);

    const undo = await api.post(`/repositories/${REPO}/changes/${replaceCrm.id}/undo`, { id: "C-UNDO-1" });
    expect(undo.status).toBe(201);
    expect(undo.body).toMatchObject({ changeId: "C-UNDO-1", versions: { "O-APP-2": 3 } });
    expect((await api.get(`/repositories/${REPO}/objects/01J-NEW?scenario=${TARGET}`)).status).toBe(404);
    expect((await api.get(`/repositories/${REPO}/objects/O-APP-2?scenario=${TARGET}`)).body).toMatchObject({
      properties: { "lifecycle.status": "active" },
    });

    const again = await api.post(`/repositories/${REPO}/changes/${replaceCrm.id}/undo`, {});
    expect(again.status).toBe(422);
    const summaries = (await api.get(`/repositories/${REPO}/changes?since=2`)).body as {
      source: string;
      label: string;
    }[];
    expect(summaries).toEqual([expect.objectContaining({ source: "undo", label: `Undo: ${replaceCrm.label}` })]);
  });

  it("never shows another workspace's repository", async () => {
    const res = await api.get(`/repositories/${REPO}`, token("eve@example.com", "W2"));
    expect(res.status).toBe(404);
    const write = await api.post(`/repositories/${REPO}/changes`, replaceCrm, token("eve@example.com", "W2"));
    expect(write.status).toBe(404);
    expect((await api.get("/repositories", token("eve@example.com", "W2"))).body).toEqual([]);
  });

  it("sees writes made through another server instance", async () => {
    // Warm this instance's cache, then write through a second instance (as another web container would).
    await api.get(`/repositories/${REPO}/objects/O-SRV-1`);
    const other = buildApp({ conn: api.db.conn, authenticate: devAuthenticate });
    const write = await other.inject({
      method: "POST",
      url: `/api/v1/repositories/${REPO}/changes`,
      headers: { authorization: token() },
      payload: {
        id: "C-OTHER",
        label: "Rename",
        edits: [{ edit: "renameObject", id: "O-SRV-1", baseVersion: 1, name: "SRV-02" }],
      },
    });
    expect(write.statusCode).toBe(201);
    await other.close();
    expect((await api.get(`/repositories/${REPO}/objects/O-SRV-1`)).body).toMatchObject({ name: "SRV-02", version: 2 });
  });

  it("creates a repository with the Essentials package", async () => {
    const res = await api.post("/repositories", { name: "Sandbox" });
    expect(res.status).toBe(201);
    const repo = res.body as { id: string; baselineScenarioId: string; seq: number };
    expect(repo.seq).toBe(0);
    const created = await api.post(`/repositories/${repo.id}/changes`, {
      id: "C-SANDBOX",
      label: "First folder",
      edits: [{ edit: "createFolder", id: "F-1", parentId: null, name: "Applications" }],
    });
    expect(created.body).toMatchObject({ seq: 1 });
  });

  it("stores explorer ranks and returns them with folders, objects and diagrams", async () => {
    const res = await api.post(`/repositories/${REPO}/changes`, {
      id: "C-RANK",
      label: "Reorder",
      edits: [
        { edit: "setRank", item: "folder", id: "F06", rank: "a0" },
        { edit: "setRank", item: "object", id: "O-APP-2", rank: "a1" },
        { edit: "setRank", item: "diagram", id: "D-01", rank: "a2" },
      ],
    });
    expect(res.status).toBe(201);
    const folders = (await api.get(`/repositories/${REPO}/folders`)).body as { id: string; rank?: string }[];
    expect(folders.find((f) => f.id === "F06")).toMatchObject({ rank: "a0" });
    expect(folders.find((f) => f.id === "F04")).not.toHaveProperty("rank");
    for (const f of folders) expectContract(f, schema("Folder"));
    const crm = await api.get(`/repositories/${REPO}/objects/O-APP-2`);
    expect(crm.body).toMatchObject({ rank: "a1" });
    expectContract(crm.body, schema("ModelObject"));
    const diagram = await api.get(`/repositories/${REPO}/diagrams/D-01`);
    expect(diagram.body).toMatchObject({ rank: "a2" });
    expectContract(diagram.body, schema("Diagram"));
  });

  it("returns problem+json for unknown repositories, scenarios and routes", async () => {
    expect((await api.get("/repositories/NOPE/folders")).status).toBe(404);
    expect((await api.get(`/repositories/${REPO}/folders?scenario=NOPE`)).status).toBe(404);
    const route = await api.get("/nothing-here");
    expect(route.status).toBe(404);
    expectContract(route.body, PROBLEM);
  });
});
