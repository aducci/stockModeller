// The browser store: optimistic edits, confirmation, rebase over other people's changes, and the rows of the
// concurrency table in design/03-platform/collaboration-and-changes.md §2.
import { describe, expect, it } from "vitest";
import type { CommittedChange, Rejection } from "@connectome/model";
import type { ModelStore, StoreEvent } from "../src";
import { FakeServer, change, dana, lee, rowsOf } from "./fake-server";

/** A store with its events recorded. */
function watch(store: ModelStore) {
  const events: StoreEvent[] = [];
  store.subscribe((e) => events.push(e));
  return events;
}

/** Sends a store's pending change to the server and returns what the server would send back. */
function submit(server: FakeServer, store: ModelStore, index = 0, actor = dana) {
  const pending = store.pendingChanges[index]!;
  return server.commit(pending, actor);
}

const committed = (result: CommittedChange | { reasons: Rejection[] }) => {
  if ("reasons" in result) throw new Error(`rejected: ${JSON.stringify(result.reasons)}`);
  return result;
};

const rename = (id: string, name: string, baseVersion: number) =>
  change(`rename ${name}`, [{ edit: "renameObject", id, baseVersion, name }]);

describe("ModelStore", () => {
  it("shows an edit at once, and the confirmed state once the server commits it", () => {
    const server = new FakeServer();
    const store = server.store(dana);
    const events = watch(store);

    expect(store.edit(rename("O-APP-1", "Claims Hub", 1))).toMatchObject({ ok: true });
    expect(store.state.objects.get("O-APP-1")).toMatchObject({ name: "Claims Hub", version: 2 });
    expect(store.pendingChanges).toHaveLength(1);

    const c = committed(submit(server, store));
    expect(store.commit(c)).toBe("applied");
    expect(store.pendingChanges).toHaveLength(0);
    expect(store.seq).toBe(c.seq);
    expect(rowsOf(store.state)).toEqual(server.rows()); // exact: versions, stamps and timestamps
    expect(events.map((e) => e.type)).toEqual(["changed", "confirmed", "changed"]);
  });

  it("refuses an edit the engine refuses, and keeps nothing", () => {
    const server = new FakeServer();
    const store = server.store(dana);
    const before = rowsOf(store.state);
    // processStep is not a valid target of "serves" (only process is).
    const result = store.edit(
      change("bad", [
        { edit: "createRelationship", id: "R-X", type: "serves", sourceId: "O-APP-1", targetId: "O-STP-1" },
      ]),
    );
    expect(result).toMatchObject({ ok: false, reasons: [{ code: "ruleViolation" }] });
    expect(store.pendingChanges).toHaveLength(0);
    expect(rowsOf(store.state)).toEqual(before);
  });

  it("ignores a committed change it has already applied", () => {
    const server = new FakeServer();
    const store = server.store(dana);
    store.edit(rename("O-APP-1", "Claims Hub", 1));
    const c = committed(submit(server, store));
    expect(store.commit(c)).toBe("applied");
    expect(store.commit(c)).toBe("ignored");
    expect(rowsOf(store.state)).toEqual(server.rows());
  });

  it("needs a snapshot for a change from another (ancestor) scenario, and re-applies pending edits on it", () => {
    const server = new FakeServer();
    const store = server.store(dana);
    store.edit(rename("O-APP-1", "Claims Hub", 1));
    const other = committed(server.commit(rename("O-APP-2", "Old CRM", 1), lee));
    expect(store.commit({ ...other, scenarioId: "S-ELSEWHERE" })).toBe("stale");

    store.reset(server.snapshot());
    expect(store.seq).toBe(server.seq);
    expect(store.state.objects.get("O-APP-2")!.name).toBe("Old CRM");
    expect(store.state.objects.get("O-APP-1")!.name).toBe("Claims Hub");
    expect(store.pendingChanges).toHaveLength(1);
  });

  it("is stale when a change does not reproduce the server's versions", () => {
    const server = new FakeServer();
    const store = server.store(dana);
    const c = committed(server.commit(rename("O-APP-1", "Claims Hub", 1), lee));
    expect(store.commit({ ...c, versions: { "O-APP-1": 7 } })).toBe("stale");
  });

  describe("concurrent edits (collaboration §2)", () => {
    it("someone else changed other properties of the item: both survive", () => {
      const server = new FakeServer();
      const a = server.store(dana);
      const b = server.store(lee);
      a.edit(rename("O-APP-1", "Claims Hub", 1));
      b.edit(
        change("status", [
          { edit: "setProperties", id: "O-APP-1", baseVersion: 1, set: { "lifecycle.status": "phaseOut" } },
        ]),
      );
      const fromB = committed(submit(server, b, 0, lee));
      a.commit(fromB);
      b.commit(fromB);
      // A sees B's change under its own pending rename.
      expect(a.state.objects.get("O-APP-1")).toMatchObject({
        name: "Claims Hub",
        properties: { "lifecycle.status": "phaseOut" },
      });
      const fromA = committed(submit(server, a));
      a.commit(fromA);
      b.commit(fromA);
      expect(rowsOf(a.state)).toEqual(server.rows());
      expect(rowsOf(b.state)).toEqual(server.rows());
    });

    it("someone else changed the same property: the edit leaves the view, and the server's rejection says who", () => {
      const server = new FakeServer();
      const a = server.store(dana);
      const b = server.store(lee);
      const events = watch(a);
      a.edit(rename("O-APP-1", "Claims Hub", 1));
      b.edit(rename("O-APP-1", "Claims Central", 1));
      const fromB = committed(submit(server, b, 0, lee));
      a.commit(fromB);
      expect(a.state.objects.get("O-APP-1")!.name).toBe("Claims Central"); // rebase: A's rename no longer applies
      expect(a.pendingChanges).toHaveLength(1); // until the server answers

      const answer = submit(server, a);
      expect(answer).toMatchObject({ reasons: [{ code: "conflict", property: "name", changedBy: "lee" }] });
      expect(a.reject(a.pendingChanges[0]!.id, (answer as { reasons: Rejection[] }).reasons)).toBe(true);
      expect(a.pendingChanges).toHaveLength(0);
      expect(rowsOf(a.state)).toEqual(server.rows());
      expect(events.find((e) => e.type === "rejected")).toMatchObject({
        change: { label: "rename Claims Hub" },
        reasons: [{ code: "conflict" }],
      });
    });

    it("the item was deleted meanwhile: the pending edit is rolled back", () => {
      const server = new FakeServer();
      const a = server.store(dana);
      const b = server.store(lee);
      a.edit(
        change("status", [
          { edit: "setProperties", id: "O-APP-2", baseVersion: 1, set: { "lifecycle.status": "phaseOut" } },
        ]),
      );
      b.edit(change("delete", [{ edit: "deleteObject", id: "O-APP-2", baseVersion: 1 }]));
      a.commit(committed(submit(server, b, 0, lee)));
      expect(a.state.objects.get("O-APP-2")).toBeUndefined();
      const answer = submit(server, a) as { reasons: Rejection[] };
      expect(answer.reasons[0]).toMatchObject({ code: "gone", itemId: "O-APP-2" });
      a.reject(a.pendingChanges[0]!.id, answer.reasons);
      expect(rowsOf(a.state)).toEqual(server.rows());
    });

    it("a block rule would be broken after someone else's change: the edit leaves the view", () => {
      const server = new FakeServer();
      const create = change("new process", [
        { edit: "createObject", id: "O-NEW", type: "process", name: "Onboard Customer", folderId: "F03" },
      ]);
      committed(server.commit(create, lee));
      const a = server.store(dana);
      const b = server.store(lee);
      a.edit(
        change("serves", [
          { edit: "createRelationship", id: "R-NEW", type: "serves", sourceId: "O-APP-2", targetId: "O-NEW" },
        ]),
      );
      expect(a.state.relationships.get("R-NEW")).toBeDefined();
      b.edit(change("retype", [{ edit: "changeObjectType", id: "O-NEW", baseVersion: 1, type: "processStep" }]));
      a.commit(committed(submit(server, b, 0, lee)));
      expect(a.state.relationships.get("R-NEW")).toBeUndefined();
      const answer = submit(server, a) as { reasons: Rejection[] };
      expect(answer.reasons[0]).toMatchObject({ code: "ruleViolation" });
      a.reject(a.pendingChanges[0]!.id, answer.reasons);
      expect(rowsOf(a.state)).toEqual(server.rows());
    });

    it("diagram layout: the last writer wins, with no prompt", () => {
      const server = new FakeServer();
      const a = server.store(dana);
      const b = server.store(lee);
      const move = (x: number) =>
        change(`move ${x}`, [{ edit: "moveObjectOccurrence", diagramId: "D-01", occurrenceId: "OO-4", x, y: x }]);
      a.edit(move(500));
      b.edit(move(900));
      const fromB = committed(submit(server, b, 0, lee));
      a.commit(fromB);
      b.commit(fromB);
      expect(a.state.objectOccurrences.get("OO-4")).toMatchObject({ x: 500 }); // A's own move stays on top
      const fromA = committed(submit(server, a));
      a.commit(fromA);
      b.commit(fromA);
      expect(b.state.objectOccurrences.get("OO-4")).toMatchObject({ x: 500, y: 500 });
      expect(rowsOf(a.state)).toEqual(server.rows());
      expect(rowsOf(b.state)).toEqual(server.rows());
    });
  });

  it("keeps several pending changes in order, including ones that build on each other", () => {
    const server = new FakeServer();
    const a = server.store(dana);
    const b = server.store(lee);
    a.edit(
      change("create", [{ edit: "createObject", id: "O-X", type: "application", name: "Ledger", folderId: "F04" }]),
    );
    a.edit(rename("O-X", "General Ledger", 1));
    a.edit(
      change("link", [
        { edit: "createRelationship", id: "R-X", type: "flowsTo", sourceId: "O-X", targetId: "O-APP-1" },
      ]),
    );
    b.edit(rename("O-APP-2", "Old CRM", 1));
    a.commit(committed(submit(server, b, 0, lee)));
    expect(a.state.objects.get("O-X")).toMatchObject({ name: "General Ledger", version: 2 });
    expect(a.state.relationships.get("R-X")).toBeDefined();
    for (let i = 0; i < 3; i++) a.commit(committed(submit(server, a)));
    expect(a.pendingChanges).toHaveLength(0);
    expect(rowsOf(a.state)).toEqual(server.rows());
  });

  it("drops a pending change that depended on one the server rejected", () => {
    const server = new FakeServer();
    const a = server.store(dana);
    // Application names are unique in the repository, and B creates "Ledger" first.
    const b = server.store(lee);
    b.edit(
      change("create", [{ edit: "createObject", id: "O-B", type: "application", name: "Ledger", folderId: "F04" }]),
    );
    a.edit(
      change("create", [{ edit: "createObject", id: "O-A", type: "application", name: "Ledger", folderId: "F04" }]),
    );
    a.edit(rename("O-A", "Ledger 2", 1));
    expect(a.state.objects.get("O-A")!.name).toBe("Ledger 2");
    a.commit(committed(submit(server, b, 0, lee)));
    expect(a.state.objects.get("O-A")).toBeUndefined(); // neither applies on top of B's Ledger
    for (const id of a.pendingChanges.map((c) => c.id)) {
      const answer = server.commit(
        a.pendingChanges.find((c) => c.id === id)!,
        dana,
      ) as { reasons: Rejection[] };
      expect(answer.reasons).toBeDefined();
      a.reject(id, answer.reasons);
    }
    expect(rowsOf(a.state)).toEqual(server.rows());
  });
});

describe("convergence (random interleavings)", () => {
  /** Small deterministic PRNG (mulberry32), so failures can be replayed from the seed. */
  function random(seed: number) {
    return () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  type Message = { committed: CommittedChange } | { rejected: string; reasons: Rejection[] };

  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])("every store ends with exactly the server's state (seed %i)", (seed) => {
    const next = random(seed);
    const pick = <T>(items: T[]): T => items[Math.floor(next() * items.length)]!;
    const server = new FakeServer();
    const users = [dana, lee, { kind: "user" as const, id: "kim" }].map((actor) => ({
      actor,
      store: server.store(actor),
      outbox: [] as string[], // change ids sent, not yet processed by the server
      inbox: [] as Message[],
    }));
    let n = 0;
    let rejected = 0;
    let committedCount = 0;

    const edit = (u: (typeof users)[number]) => {
      const s = u.store.state;
      const objects = [...s.objects.live()];
      const o = pick(objects);
      const o2 = pick(objects);
      const occ = pick([...s.objectOccurrences.live()]);
      const id = `G${++n}`;
      const options = [
        change("rename", [
          { edit: "renameObject", id: o.id, baseVersion: o.version, name: `${o.name.slice(0, 20)} ${n}` },
        ]),
        change("status", [
          {
            edit: "setProperties",
            id: o.id,
            baseVersion: o.version,
            set: { "lifecycle.status": pick(["planned", "active", "phaseOut"]) },
          },
        ]),
        change("tags", [{ edit: "setTags", id: o.id, baseVersion: o.version, tags: [`t${n}`] }]),
        change("create", [
          {
            edit: "createObject",
            id,
            type: pick(["application", "capability", "server"]),
            name: `Gen ${n % 7}`,
            folderId: "F04",
          },
        ]),
        change("flow", [{ edit: "createRelationship", id, type: "flowsTo", sourceId: o.id, targetId: o2.id }]),
        ...(occ
          ? [
              change("move", [
                { edit: "moveObjectOccurrence", diagramId: occ.diagramId, occurrenceId: occ.id, x: n, y: n },
              ]),
            ]
          : []),
        ...(next() < 0.15 ? [change("delete", [{ edit: "deleteObject", id: o.id, baseVersion: o.version }])] : []),
      ];
      const c = pick(options);
      if (u.store.edit(c).ok) u.outbox.push(c.id);
    };

    const process = (u: (typeof users)[number]) => {
      const id = u.outbox.shift()!;
      const pending = u.store.pendingChanges.find((c) => c.id === id);
      if (!pending) return; // already answered
      const result = server.commit(pending, u.actor);
      if ("reasons" in result) {
        rejected++;
        u.inbox.push({ rejected: id, reasons: result.reasons });
      } else {
        committedCount++;
        for (const v of users) v.inbox.push({ committed: result });
      }
    };

    const deliver = (u: (typeof users)[number]) => {
      const m = u.inbox.shift()!;
      if ("committed" in m) expect(u.store.commit(m.committed)).not.toBe("stale");
      else u.store.reject(m.rejected, m.reasons);
    };

    for (let step = 0; step < 600; step++) {
      const u = pick(users);
      const r = next();
      if (r < 0.4) edit(u);
      else if (r < 0.7 && u.outbox.length > 0) process(u);
      else if (u.inbox.length > 0) deliver(u);
    }
    // Drain: the server answers everything sent, then every store reads its messages.
    while (users.some((u) => u.outbox.length > 0)) for (const u of users) if (u.outbox.length) process(u);
    for (const u of users) while (u.inbox.length) deliver(u);

    for (const u of users) {
      expect(u.store.pendingChanges).toEqual([]);
      expect(u.store.seq).toBe(server.seq);
      expect(rowsOf(u.store.state)).toEqual(server.rows());
    }
    expect(committedCount).toBeGreaterThan(50);
    expect(rejected).toBeGreaterThan(0);
  });
});
