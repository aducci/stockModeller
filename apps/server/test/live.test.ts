// Live updates over WebSocket (M0 slice 0.6): two clients see each other's commits, through one or two
// server instances, with catch-up, scenario filtering, presence and rejections.
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import WebSocket from "ws";
import type { AddressInfo } from "node:net";
import type { ServerMessage } from "@connectome/model";
import { buildApp, devAuthenticate } from "../src";
import { BASELINE, DANA, REPO, TARGET, describeDb, setup, token } from "./helpers";

const LEE = "lee@example.com";

/** A test client: collects server messages and waits for the ones it needs. */
class LiveClient {
  readonly messages: ServerMessage[] = [];
  private waiters: { match: (m: ServerMessage) => boolean; resolve: (m: ServerMessage) => void }[] = [];
  closed: { code: number; reason: string } | null = null;

  private constructor(readonly socket: WebSocket) {
    socket.on("message", (data) => {
      const message = JSON.parse(data.toString()) as ServerMessage;
      this.messages.push(message);
      this.waiters = this.waiters.filter((w) => (w.match(message) ? (w.resolve(message), false) : true));
    });
    socket.on("close", (code, reason) => (this.closed = { code, reason: reason.toString() }));
  }

  static async open(base: string, query: string, headers: Record<string, string> = { authorization: token() }) {
    const socket = new WebSocket(`${base}/api/v1/live?${query}`, { headers });
    const client = new LiveClient(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once("open", () => resolve());
      socket.once("error", reject);
      socket.once("unexpected-response", (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
    });
    return client;
  }

  /** Waits for a message matching `match` (also one already received after `fromIndex`). */
  next<T extends ServerMessage["type"]>(
    type: T,
    match: (m: Extract<ServerMessage, { type: T }>) => boolean = () => true,
    timeoutMs = 3000,
  ): Promise<Extract<ServerMessage, { type: T }>> {
    const test = (m: ServerMessage) => m.type === type && match(m as Extract<ServerMessage, { type: T }>);
    const seen = this.messages.find(test);
    if (seen) return Promise.resolve(seen as Extract<ServerMessage, { type: T }>);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no ${type} message within ${timeoutMs} ms`)), timeoutMs);
      this.waiters.push({
        match: test,
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m as Extract<ServerMessage, { type: T }>);
        },
      });
    });
  }

  /** Ready once the server has announced this client's presence (it does so after catching up). */
  ready(userId = DANA) {
    return this.next("presence", (m) => m.users.some((u) => u.id === userId));
  }

  send(message: unknown) {
    this.socket.send(JSON.stringify(message));
  }

  committedSeqs() {
    return this.messages.flatMap((m) => (m.type === "committed" ? [m.change.seq] : []));
  }

  close() {
    this.socket.close();
  }
}

const rename = (id: string, name: string, baseVersion: number, scenarioId = BASELINE) => ({
  id: `C-${name.replace(/\W/g, "")}-${Math.random().toString(36).slice(2, 8)}`,
  scenarioId,
  label: `Rename to ${name}`,
  edits: [{ edit: "renameObject", id, baseVersion, name }],
});

describeDb("live updates", () => {
  let api: Awaited<ReturnType<typeof setup>>;
  let base: string;
  const clients: LiveClient[] = [];
  const open = async (query: string, headers?: Record<string, string>) => {
    const c = await LiveClient.open(base, query, headers);
    clients.push(c);
    return c;
  };

  beforeAll(async () => {
    api = await setup();
    await api.app.listen({ port: 0, host: "127.0.0.1" });
    base = `ws://127.0.0.1:${(api.app.server.address() as AddressInfo).port}`;
  });
  afterEach(() => {
    for (const c of clients.splice(0)) c.close();
  });
  afterAll(() => api?.close());

  let version = 1; // O-SRV-1's version, advanced by each test that renames it

  it("exit criterion: two clients see each other's commits in under 300 ms", async () => {
    const a = await open(`repository=${REPO}`);
    const b = await open(`repository=${REPO}`, { authorization: token(LEE) });
    await Promise.all([a.ready(), b.ready(LEE)]);

    const change = rename("O-SRV-1", "SRV-A", version++);
    const started = performance.now();
    a.send({ type: "submit", change });
    const atB = await b.next("committed", (m) => m.change.id === change.id);
    const elapsed = performance.now() - started;
    expect(elapsed).toBeLessThan(300);
    expect(atB.change).toMatchObject({ label: "Rename to SRV-A", actor: { kind: "user", id: DANA }, source: "api" });
    expect(atB.change.versions).toEqual({ "O-SRV-1": version });

    // The sender learns of its own commit the same way, with the new versions.
    const atA = await a.next("committed", (m) => m.change.id === change.id);
    expect(atA.change.seq).toBe(atB.change.seq);

    // And the other way round.
    const back = rename("O-SRV-1", "SRV-B", version++);
    b.send({ type: "submit", change: back });
    await a.next("committed", (m) => m.change.id === back.id);
  });

  it("streams changes committed over REST too", async () => {
    const a = await open(`repository=${REPO}`);
    await a.ready();
    const change = rename("O-SRV-1", "SRV-REST", version++);
    const { scenarioId: _s, ...body } = change;
    expect((await api.post(`/repositories/${REPO}/changes`, body)).status).toBe(201);
    await a.next("committed", (m) => m.change.id === change.id);
  });

  it("fans out between server instances through PostgreSQL NOTIFY", async () => {
    const second = buildApp({
      conn: api.db.conn,
      authenticate: devAuthenticate,
      live: { connectionString: api.db.url },
    });
    await second.listen({ port: 0, host: "127.0.0.1" });
    try {
      const otherBase = `ws://127.0.0.1:${(second.server.address() as AddressInfo).port}`;
      const a = await open(`repository=${REPO}`);
      const b = await LiveClient.open(otherBase, `repository=${REPO}`, { authorization: token(LEE) });
      clients.push(b);
      await Promise.all([a.ready(), b.ready(LEE)]);
      // Presence crosses instances as well.
      await a.ready(LEE);

      const change = rename("O-SRV-1", "SRV-X", version++);
      const started = performance.now();
      a.send({ type: "submit", change });
      await b.next("committed", (m) => m.change.id === change.id);
      expect(performance.now() - started).toBeLessThan(300);
    } finally {
      for (const c of clients.splice(0)) c.close();
      await second.close();
    }
  });

  it("catches up from ?since= before streaming, in order and without duplicates", async () => {
    const { seq } = (await api.get(`/repositories/${REPO}`)).body as { seq: number };
    for (let i = 0; i < 3; i++) {
      const { scenarioId: _s, ...body } = rename("O-SRV-1", `SRV-CATCHUP-${i}`, version++);
      await api.post(`/repositories/${REPO}/changes`, body);
    }
    const a = await open(`repository=${REPO}&since=${seq}`);
    await a.ready();
    const live = rename("O-SRV-1", "SRV-LIVE", version++);
    a.send({ type: "submit", change: live });
    await a.next("committed", (m) => m.change.id === live.id);
    expect(a.committedSeqs()).toEqual([seq + 1, seq + 2, seq + 3, seq + 4]);
  });

  it("asks a client that is too far behind to reload (resync)", async () => {
    const { seq } = (await api.get(`/repositories/${REPO}`)).body as { seq: number };
    const ahead = await open(`repository=${REPO}&since=${seq + 50}`);
    expect(await ahead.next("resync")).toEqual({ type: "resync", fromSeq: seq });
  });

  it("sends a scenario's viewers baseline changes, but keeps scenario changes from baseline viewers", async () => {
    const inBaseline = await open(`repository=${REPO}`);
    const inTarget = await open(`repository=${REPO}&scenario=${TARGET}`);
    await Promise.all([inBaseline.ready(), inTarget.ready()]);

    const scenarioChange = {
      id: "C-LIVE-T",
      scenarioId: TARGET,
      label: "Rename in Target 2027",
      edits: [{ edit: "renameObject", id: "O-APP-3", baseVersion: 1, name: "Payments Hub 2" }],
    };
    inTarget.send({ type: "submit", change: scenarioChange });
    await inTarget.next("committed", (m) => m.change.id === scenarioChange.id);

    const baselineChange = rename("O-SRV-1", "SRV-BOTH", version++);
    inBaseline.send({ type: "submit", change: baselineChange });
    await inTarget.next("committed", (m) => m.change.id === baselineChange.id);
    await inBaseline.next("committed", (m) => m.change.id === baselineChange.id);
    expect(inBaseline.messages.some((m) => m.type === "committed" && m.change.id === scenarioChange.id)).toBe(false);
  });

  it("tells only the sender why a change was rejected", async () => {
    const a = await open(`repository=${REPO}`);
    const b = await open(`repository=${REPO}`, { authorization: token(LEE) });
    await Promise.all([a.ready(), b.ready(LEE)]);

    const stale = rename("O-SRV-1", "SRV-STALE", 1);
    a.send({ type: "submit", change: stale });
    const rejected = await a.next("rejected");
    expect(rejected).toMatchObject({
      changeId: stale.id,
      reasons: [{ code: "conflict", property: "name", changedBy: DANA }],
    });

    a.send({ type: "submit", change: { ...rename("O-SRV-1", "X", version), scenarioId: TARGET } });
    expect(
      (await a.next("rejected", (m) => m.reasons.some((r) => "property" in r && r.property === "scenarioId")))
        .reasons[0],
    ).toMatchObject({
      code: "invalid",
    });

    a.send({ type: "submit", change: { id: "C-MALFORMED", scenarioId: BASELINE, label: "x", edits: [] } });
    expect(await a.next("rejected", (m) => m.changeId === "C-MALFORMED")).toMatchObject({
      reasons: [{ code: "invalid" }],
    });

    await new Promise((r) => setTimeout(r, 100));
    expect(b.messages.some((m) => m.type === "rejected")).toBe(false);
  });

  it("shares presence: who is here, on which diagram, with what selected", async () => {
    const a = await open(`repository=${REPO}`);
    const b = await open(`repository=${REPO}`, { authorization: token(LEE) });
    await Promise.all([a.ready(), b.ready(LEE)]);

    a.send({ type: "presence", diagramId: "D-01", selection: ["OO-4"], cursor: { x: 10, y: 20 } });
    const seen = await b.next("presence", (m) => m.users.some((u) => u.id === DANA && u.diagramId === "D-01"));
    expect(seen.users.find((u) => u.id === DANA)).toMatchObject({
      selection: ["OO-4"],
      cursor: { x: 10, y: 20 },
      color: expect.stringMatching(/^#/),
    });

    a.close();
    await b.next("presence", (m) => !m.users.some((u) => u.id === DANA));
  });

  it("refuses connections without sign-in, and to repositories of other workspaces", async () => {
    await expect(LiveClient.open(base, `repository=${REPO}`, {})).rejects.toThrow("HTTP 401");
    const outsider = await open(`repository=${REPO}`, { authorization: token("eve@example.com", "W2") });
    await expect.poll(() => outsider.closed?.code).toBe(4404);
  });

  it("lets browsers sign in with a short-lived ticket", async () => {
    const { ticket } = (await api.post("/live/tickets")).body as { ticket: string };
    const a = await open(`repository=${REPO}&ticket=${encodeURIComponent(ticket)}`, {});
    await a.ready();
    await expect(
      LiveClient.open(base, `repository=${REPO}&ticket=${encodeURIComponent(ticket.slice(0, -2))}xx`, {}),
    ).rejects.toThrow("HTTP 401");
  });
});
