// LiveSession connectivity with a fake server and fake sockets: pausing after a long drop, and reloading on
// `resync` without applying a pending change twice.
import { describe, expect, it } from "vitest";
import type { Change, ServerMessage } from "@connectome/model";
import { LiveSession, type SocketLike } from "../src";
import { FakeServer, change, dana } from "./fake-server";

class FakeSocket implements SocketLike {
  readyState = 0;
  sent: unknown[] = [];
  onopen: SocketLike["onopen"] = null;
  onmessage: SocketLike["onmessage"] = null;
  onclose: SocketLike["onclose"] = null;
  onerror: SocketLike["onerror"] = null;

  constructor(readonly url: string) {}
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  receive(message: ServerMessage) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close(code = 1006) {
    this.readyState = 3;
    this.onclose?.({ code, reason: "" });
  }
}

/** A session wired to an in-memory server; `online` decides whether new sockets connect. */
async function harness(server = new FakeServer()) {
  const sockets: FakeSocket[] = [];
  const posted: Change[] = [];
  let online = true;
  const fetch = (async (url: string, init?: RequestInit) => {
    if (!online) throw new TypeError("fetch failed");
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
    if (url.endsWith("/live/tickets")) return json(200, { ticket: "t", expiresAt: "" });
    if (url.includes("/snapshot")) return json(200, server.snapshot());
    if (url.includes("/changes")) {
      const c = JSON.parse(String(init!.body)) as Change;
      posted.push(c);
      return json(201, { seq: server.seq, versions: {} });
    }
    return json(404, { title: "Not found" });
  }) as typeof globalThis.fetch;
  const session = await LiveSession.open({
    baseUrl: "http://server",
    authorization: "Bearer dev:W:dana",
    repositoryId: "R",
    userId: dana.id,
    fetch,
    socket: (url) => {
      const s = new FakeSocket(url);
      sockets.push(s);
      if (online) queueMicrotask(() => s.open());
      else queueMicrotask(() => s.close());
      return s;
    },
    reconnectDelaysMs: [5],
    pauseAfterMs: 40,
  });
  const settle = (ms = 0) => new Promise((r) => setTimeout(r, ms));
  await settle();
  return {
    server,
    session,
    sockets,
    posted,
    settle,
    get socket() {
      return sockets.at(-1)!;
    },
    setOnline(value: boolean) {
      online = value;
    },
  };
}

const rename = (name: string, baseVersion = 1) =>
  change(name, [{ edit: "renameObject", id: "O-APP-1", baseVersion, name }]);

describe("LiveSession", () => {
  it("opens the live connection from the snapshot's sequence with a ticket", async () => {
    const h = await harness();
    expect(h.session.status).toBe("live");
    const url = new URL(h.socket.url);
    expect(url.protocol).toBe("ws:");
    expect(url.pathname).toBe("/api/v1/live");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ repository: "R", since: "1", ticket: "t" });
  });

  it("pauses editing after a long drop, and resumes (sending what was queued) when the connection returns", async () => {
    const h = await harness();
    h.setOnline(false);
    h.socket.close();
    expect(h.session.status).toBe("reconnecting");
    expect(h.session.edit(rename("Queued")).ok).toBe(true); // short drops: edits queue

    await h.settle(60);
    expect(h.session.status).toBe("paused");
    expect(h.session.edit(rename("Refused", 2))).toEqual({
      ok: false,
      reasons: [{ code: "forbidden", editIndex: 0, scope: "offline" }],
    });

    h.setOnline(true);
    await h.settle(30);
    expect(h.session.status).toBe("live");
    expect(h.socket.sent).toEqual([{ type: "submit", change: expect.objectContaining({ label: "Queued" }) }]);
    expect(h.session.edit(rename("Allowed", 2)).ok).toBe(true);
    h.session.close();
  });

  it("on resync, settles pending changes over HTTP before loading the snapshot, so none applies twice", async () => {
    const h = await harness();
    h.session.edit(rename("Mine"));
    const mine = h.session.store.pendingChanges[0]!;
    // The server committed it, but the connection fell too far behind to hear about it.
    h.server.commit(mine, dana);
    h.socket.receive({ type: "resync", fromSeq: h.server.seq });
    await h.settle(10);

    expect(h.posted.map((c) => c.id)).toEqual([mine.id]);
    expect(h.session.store.pendingChanges).toEqual([]);
    expect(h.session.store.seq).toBe(h.server.seq);
    expect(h.session.store.state.objects.get("O-APP-1")).toMatchObject({ name: "Mine", version: 2 });
    h.session.close();
  });

  it("stops for good when the server says the repository is not there", async () => {
    const h = await harness();
    const errors: string[] = [];
    h.session.subscribe((e) => e.type === "error" && errors.push(e.message));
    h.socket.close(4404);
    expect(h.session.status).toBe("closed");
    expect(errors).toHaveLength(1);
  });
});
