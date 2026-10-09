// Publishing relationship rules (design/02-model/notation-and-metamodel-admin.md §10): preview, publish, version
// conflicts, invalid rules, and open sessions reloading.
import { afterAll, beforeAll, expect, it } from "vitest";
import WebSocket from "ws";
import type { AddressInfo } from "node:net";
import type { RepositorySnapshot } from "@connectome/engine";
import type { ServerMessage } from "@connectome/model";
import { PROBLEM, REPO, describeDb, expectContract, schema, setup, token } from "./helpers";

const RULES = `/repositories/${REPO}/metamodel/relationship-rules`;

describeDb("metamodel administration", () => {
  let api: Awaited<ReturnType<typeof setup>>;
  let base: string;
  beforeAll(async () => {
    api = await setup();
    await api.app.listen({ port: 0, host: "127.0.0.1" });
    base = `ws://127.0.0.1:${(api.app.server.address() as AddressInfo).port}`;
  });
  afterAll(() => api?.close());

  const snapshot = async () => (await api.get(`/repositories/${REPO}/snapshot`)).body as RepositorySnapshot;
  type Rules = NonNullable<RepositorySnapshot["metamodel"]["package"]["relationshipRules"]>;
  const withoutFlows = (rules: Rules) => rules.filter((r) => r.relationshipType !== "flowsTo");

  it("previews what new rules would refuse, without publishing", async () => {
    const before = await snapshot();
    const version = before.metamodel.package.version;
    const res = await api.put(`${RULES}?preview=true`, {
      baseVersion: version,
      relationshipRules: withoutFlows(before.metamodel.package.relationshipRules!),
    });
    expect(res.status).toBe(200);
    expectContract(res.body, schema("RulesResult"));
    expect(res.body).toMatchObject({ preview: true, version: "1.11.1" });
    const refused = (res.body as { newlyRefused: { relationshipType: string; count: number }[] }).newlyRefused;
    expect(refused.every((c) => c.relationshipType === "flowsTo")).toBe(true);
    expect(refused.reduce((n, c) => n + c.count, 0)).toBe(6); // three flows and three messages
    expect((await snapshot()).metamodel.package.version).toBe(version);
  });

  it("refuses rules edited from an older version, and rules that do not fit the metamodel", async () => {
    const { package: pkg } = (await snapshot()).metamodel;
    const stale = await api.put(RULES, { baseVersion: "0.9.0", relationshipRules: pkg.relationshipRules });
    expect(stale.status).toBe(409);
    expectContract(stale.body, PROBLEM);
    const unknown = await api.put(RULES, {
      baseVersion: pkg.version,
      relationshipRules: [{ relationshipType: "teleports", sourceType: "application", targetType: "*" }],
    });
    expect(unknown.status).toBe(422);
    expect(JSON.stringify(unknown.body)).toContain("teleports");
  });

  it("publishes the next version: open sessions reload, and the new rules apply to new edits", async () => {
    const socket = new WebSocket(`${base}/api/v1/live?repository=${REPO}`, { headers: { authorization: token() } });
    const messages: ServerMessage[] = [];
    socket.on("message", (data) => messages.push(JSON.parse(data.toString()) as ServerMessage));
    await new Promise((resolve) => socket.once("open", resolve));
    await expect.poll(() => messages.some((m) => m.type === "presence")).toBe(true);

    const before = await snapshot();
    const res = await api.put(RULES, {
      baseVersion: before.metamodel.package.version,
      relationshipRules: withoutFlows(before.metamodel.package.relationshipRules!),
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ preview: false, version: "1.11.1" });
    await expect.poll(() => messages.some((m) => m.type === "resync")).toBe(true);
    socket.close();

    const after = await snapshot();
    expect(after.metamodel.package.version).toBe("1.11.1");
    expect(after.metamodel.package.relationshipRules!.some((r) => r.relationshipType === "flowsTo")).toBe(false);
    // Existing flows stay; a new one is refused by the published rules.
    expect(after.rows.relationships.filter((r) => r.type === "flowsTo")).toHaveLength(6);
    const flow = await api.post(`/repositories/${REPO}/changes`, {
      id: "C-NEW-FLOW",
      label: "New flow",
      edits: [{ edit: "createRelationship", id: "R-NEW", type: "flowsTo", sourceId: "O-APP-3", targetId: "O-APP-2" }],
    });
    expect(flow.status).toBe(422);
  });
});
