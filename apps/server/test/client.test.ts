// The web app's store and live session (@connectome/client) against a real server: optimistic edits,
// confirmation, rebase, rejections, reconnects and scenario reloads. Sessions use the global WebSocket and a
// ticket, as a browser does.
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { LiveSession, type SessionEvent } from "@connectome/client";
import { snapshotRows, stateFromSnapshot, type ModelState, type RepositorySnapshot } from "@connectome/engine";
import { BASELINE, DANA, REPO, TARGET, describeDb, setup, token } from "./helpers";

const LEE = "lee@example.com";

/** Every row in a stable order, versions and tombstones included. */
function rows(state: ModelState) {
  const all = snapshotRows(state) as unknown as Record<string, { id: string }[]>;
  for (const list of Object.values(all)) list.sort((a, b) => a.id.localeCompare(b.id));
  return all;
}

/** Resolves when `test` holds, checking after every event of the session. */
function until(session: LiveSession, test: () => boolean, what: string, timeoutMs = 3000): Promise<void> {
  if (test()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      stop();
      reject(new Error(`timed out waiting for ${what}`));
    }, timeoutMs);
    const stop = session.subscribe(() => {
      if (!test()) return;
      clearTimeout(timer);
      stop();
      resolve();
    });
  });
}

describeDb("web client store and live session", () => {
  let api: Awaited<ReturnType<typeof setup>>;
  let baseUrl: string;
  const sessions: LiveSession[] = [];

  const open = async (userId = DANA, scenarioId?: string) => {
    const session = await LiveSession.open({
      baseUrl,
      authorization: token(userId),
      repositoryId: REPO,
      ...(scenarioId ? { scenarioId } : {}),
      userId,
      reconnectDelaysMs: [20],
    });
    sessions.push(session);
    const events: SessionEvent[] = [];
    session.subscribe((e) => events.push(e));
    await until(session, () => session.status === "live", "the live connection");
    return { session, events, store: session.store };
  };

  /** What the server has now, as a freshly loaded browser would see it. */
  const serverRows = async (scenarioId?: string) => {
    const query = scenarioId ? `?scenario=${scenarioId}` : "";
    const snap = (await api.get(`/repositories/${REPO}/snapshot${query}`)).body as RepositorySnapshot;
    return { seq: snap.seq, rows: rows(stateFromSnapshot(snap.rows)) };
  };

  const settled = (session: LiveSession, seq: number) =>
    until(session, () => session.store.seq >= seq && session.store.pendingChanges.length === 0, `seq ${seq}`);

  let n = 0;
  const rename = (store: LiveSession["store"], id: string, name: string) => ({
    id: `C-CLIENT-${++n}`,
    label: `Rename to ${name}`,
    edits: [{ edit: "renameObject" as const, id, baseVersion: store.state.objects.get(id)!.version, name }],
  });

  beforeAll(async () => {
    api = await setup();
    await api.app.listen({ port: 0, host: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${(api.app.server.address() as AddressInfo).port}`;
  });
  afterEach(() => {
    for (const s of sessions.splice(0)) s.close();
  });
  afterAll(() => api?.close());

  it("shows an edit at once, confirms it, and another user sees it; both match the server exactly", async () => {
    const a = await open();
    const b = await open(LEE);

    const started = performance.now();
    expect(a.session.edit(rename(a.store, "O-APP-1", "Claims Hub"))).toMatchObject({ ok: true });
    // Synchronously: no round trip before the edit shows.
    expect(a.store.state.objects.get("O-APP-1")!.name).toBe("Claims Hub");

    await until(b.session, () => b.store.state.objects.get("O-APP-1")!.name === "Claims Hub", "B to see the rename");
    expect(performance.now() - started).toBeLessThan(300);
    await until(a.session, () => a.store.pendingChanges.length === 0, "A's confirmation");
    expect(a.events.some((e) => e.type === "confirmed")).toBe(true);

    const server = await serverRows();
    await settled(b.session, server.seq);
    expect(rows(a.store.state)).toEqual(server.rows);
    expect(rows(b.store.state)).toEqual(server.rows);
  });

  it("survives a reload: a new session loads the confirmed edit", async () => {
    const a = await open();
    a.session.edit(rename(a.store, "O-APP-3", "Payments Platform"));
    await until(a.session, () => a.store.pendingChanges.length === 0, "confirmation");
    a.session.close();
    const again = await open();
    expect(again.store.state.objects.get("O-APP-3")!.name).toBe("Payments Platform");
  });

  it("when two users rename the same object at once, one wins, the other is told, and both converge", async () => {
    const a = await open();
    const b = await open(LEE);
    expect(a.session.edit(rename(a.store, "O-SRV-1", "SRV-DANA")).ok).toBe(true);
    expect(b.session.edit(rename(b.store, "O-SRV-1", "SRV-LEE")).ok).toBe(true);

    const rejected = () => [...a.events, ...b.events].filter((e) => e.type === "rejected");
    await until(a.session, () => rejected().length > 0 || a.store.pendingChanges.length === 0, "A's answer");
    await until(b.session, () => rejected().length > 0 || b.store.pendingChanges.length === 0, "B's answer");
    await until(a.session, () => a.store.pendingChanges.length === 0, "A settled");
    await until(b.session, () => b.store.pendingChanges.length === 0, "B settled");

    expect(rejected()).toHaveLength(1);
    expect(rejected()[0]).toMatchObject({ reasons: [{ code: "conflict", property: "name" }] });
    const server = await serverRows();
    await settled(a.session, server.seq);
    await settled(b.session, server.seq);
    expect(rows(a.store.state)).toEqual(server.rows);
    expect(rows(b.store.state)).toEqual(server.rows);
    expect(["SRV-DANA", "SRV-LEE"]).toContain(a.store.state.objects.get("O-SRV-1")!.name);
  });

  it("keeps edits made while disconnected, catches up on reconnect and sends them", async () => {
    const a = await open();
    const b = await open(LEE);
    const statuses: string[] = [];
    a.session.subscribe((e) => e.type === "status" && statuses.push(e.status));

    // Drop A's connection the way a network blip would.
    (a.session as unknown as { socket: { close(): void } }).socket.close();
    await until(a.session, () => a.session.status === "reconnecting", "A to notice");
    // Meanwhile B edits, and so does A (offline: it shows at once and waits).
    b.session.edit(rename(b.store, "O-CAP-1", "Claims"));
    expect(a.session.edit(rename(a.store, "O-CAP-2", "Intake")).ok).toBe(true);
    expect(a.store.state.objects.get("O-CAP-2")!.name).toBe("Intake");

    await until(a.session, () => a.session.status === "live", "A to reconnect");
    await until(a.session, () => a.store.pendingChanges.length === 0, "A's offline edit to be confirmed");
    await until(a.session, () => a.store.state.objects.get("O-CAP-1")!.name === "Claims", "A to catch up");
    expect(statuses).toEqual(["reconnecting", "live"]);

    const server = await serverRows();
    await settled(a.session, server.seq);
    await settled(b.session, server.seq);
    expect(rows(a.store.state)).toEqual(server.rows);
    expect(rows(b.store.state)).toEqual(server.rows);
  });

  it("in a scenario, reloads when the baseline changes and keeps its own pending edit", async () => {
    const a = await open(DANA, TARGET);
    const b = await open(LEE);
    expect(a.store.scenario.id).toBe(TARGET);

    // A's pending edit in the scenario, and a baseline edit by B that the scenario inherits.
    a.session.edit(rename(a.store, "O-STP-1", "Assess"));
    b.session.edit(rename(b.store, "O-STP-2", "Pay"));
    await until(a.session, () => a.store.state.objects.get("O-STP-2")!.name === "Pay", "the baseline edit in A");
    await until(a.session, () => a.store.pendingChanges.length === 0, "A's edit to be confirmed");
    expect(a.store.state.objects.get("O-STP-1")!.name).toBe("Assess");

    const scenario = await serverRows(TARGET);
    await settled(a.session, scenario.seq);
    expect(rows(a.store.state)).toEqual(scenario.rows);
    // The scenario's edit stayed out of the baseline.
    const baseline = await serverRows(BASELINE);
    await settled(b.session, baseline.seq);
    expect(rows(b.store.state)).toEqual(baseline.rows);
    expect(b.store.state.objects.get("O-STP-1")!.name).not.toBe("Assess");
  });

  it("refuses an edit the engine refuses without sending it", async () => {
    const a = await open();
    const seq = a.store.seq;
    const result = a.session.edit({
      id: "C-BAD",
      label: "bad",
      edits: [{ edit: "createRelationship", id: "R-BAD", type: "serves", sourceId: "O-APP-1", targetId: "O-STP-1" }],
    });
    expect(result).toMatchObject({ ok: false, reasons: [{ code: "ruleViolation" }] });
    expect(a.store.pendingChanges).toHaveLength(0);
    expect((await api.get(`/repositories/${REPO}/changes?since=${seq}`)).body).toEqual([]);
  });

  it("stops with an error for a repository it cannot see", async () => {
    await expect(
      LiveSession.open({ baseUrl, authorization: token(), repositoryId: "nope", userId: DANA }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
