// Live updates (design/03-platform/collaboration-and-changes.md §2, api.md §4).
//
// - Committed changes: every commit NOTIFYs `connectome_changes`. Each web instance LISTENs, reads the new
//   changes once per repository, and forwards them, in sequence order, to its connections viewing that
//   repository in a scenario the change affects (the change's scenario or one of its descendants).
// - Catch-up: a connection opened with ?since=<seq> first receives what it missed, then live changes.
//   Too far behind (more than MAX_BACKLOG changes), it gets `resync` and reloads.
// - Presence: ephemeral, never stored. Shared between instances through NOTIFY `connectome_presence`,
//   re-announced every HEARTBEAT_MS and dropped when not refreshed for PRESENCE_TTL_MS.
import type { WebSocket } from "ws";
import {
  CHANGES_CHANNEL,
  committedChanges,
  listen,
  notify,
  scenarioAncestry,
  withWorkspace,
  type ChangeNotice,
  type Connection,
  type Listener,
} from "@connectome/db";
import { clientMessageSchema, ulid, type CommittedChange, type Rejection, type ServerMessage } from "@connectome/model";
import type { FastifyBaseLogger } from "fastify";
import type { Principal } from "../auth";
import { Mutex } from "../cache";
import { ApiError } from "../problems";
import type { ModelService } from "../service";

export const PRESENCE_CHANNEL = "connectome_presence";
export const MAX_BACKLOG = 1000;
export const HEARTBEAT_MS = 15_000;
export const PRESENCE_TTL_MS = 45_000;
const PRESENCE_THROTTLE_MS = 50;
const MAX_SELECTION_SHARED = 100; // keeps presence notices well under the 8 kB NOTIFY limit

const COLORS = ["#2c5d98", "#c2410c", "#15803d", "#9333ea", "#b91c1c", "#0e7490", "#a16207", "#be185d"];

/** A stable colour per user. */
export function colorFor(userId: string): string {
  let h = 0;
  for (const c of userId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length]!;
}

interface Client {
  id: string;
  socket: WebSocket;
  principal: Principal;
  repositoryId: string;
  scenarioId: string;
  /** The client's scenario and its ancestors: changes in any of them affect what it shows. */
  ancestry: Set<string>;
  /** Changes up to this sequence number have been sent (or were irrelevant). */
  lastSeq: number;
  /** False while catching up; live changes are buffered meanwhile. */
  ready: boolean;
  buffer: CommittedChange[];
  presence: { diagramId?: string; selection: string[]; cursor?: { x: number; y: number } };
  presenceTimer?: NodeJS.Timeout;
  alive: boolean;
}

interface PresenceNotice {
  repositoryId: string;
  connectionId: string;
  gone?: true;
  scenarioId?: string;
  user?: { id: string; name: string; color: string };
  diagramId?: string;
  selection?: string[];
  cursor?: { x: number; y: number };
}

interface RepositoryFeed {
  workspaceId: string;
  /** Last sequence number read from the database for this repository. */
  lastSeq: number;
  queue: Mutex;
}

export interface LiveHubOptions {
  conn: Connection;
  service: ModelService;
  connectionString: string;
  log: FastifyBaseLogger;
}

export class LiveHub {
  private readonly clients = new Map<string, Set<Client>>();
  private readonly feeds = new Map<string, RepositoryFeed>();
  private readonly presence = new Map<string, Map<string, PresenceNotice & { at: number }>>();
  private readonly broadcastTimers = new Map<string, NodeJS.Timeout>();
  private listener: Listener | undefined;
  private heartbeat: NodeJS.Timeout | undefined;

  constructor(private readonly options: LiveHubOptions) {}

  async start(): Promise<void> {
    this.listener = await listen({
      connectionString: this.options.connectionString,
      channels: [CHANGES_CHANNEL, PRESENCE_CHANNEL],
      onNotify: (channel, payload) => this.onNotify(channel, payload),
      onReconnect: () => {
        // Notices sent while disconnected are lost: read whatever each followed repository missed.
        for (const [repositoryId, feed] of this.feeds)
          void this.deliver(repositoryId, feed.workspaceId, Number.MAX_SAFE_INTEGER);
      },
      onError: (error) => this.options.log.warn({ err: error }, "live listener error; reconnecting"),
    });
    this.heartbeat = setInterval(() => this.beat(), HEARTBEAT_MS);
  }

  async stop(): Promise<void> {
    clearInterval(this.heartbeat);
    for (const timer of this.broadcastTimers.values()) clearTimeout(timer);
    for (const set of this.clients.values()) {
      for (const client of set) {
        clearTimeout(client.presenceTimer);
        client.socket.close(1001, "Server shutting down");
      }
    }
    this.clients.clear();
    await this.listener?.close();
  }

  /** Number of open live connections (for tests and metrics). */
  get connectionCount(): number {
    let n = 0;
    for (const set of this.clients.values()) n += set.size;
    return n;
  }

  /** Takes over a new WebSocket: checks access, catches it up, then streams changes and presence. */
  async attach(socket: WebSocket, principal: Principal, repositoryId: string, scenarioId?: string, since?: number) {
    const client: Client = {
      id: ulid(),
      socket,
      principal,
      repositoryId,
      scenarioId: "",
      ancestry: new Set(),
      lastSeq: 0,
      ready: false,
      buffer: [],
      presence: { selection: [] },
      alive: true,
    };
    // Messages may arrive while catching up; they are handled once the client is ready.
    const early: string[] = [];
    socket.on("message", (data) =>
      client.ready ? this.onMessage(client, data.toString()) : early.push(data.toString()),
    );
    socket.on("pong", () => (client.alive = true));
    socket.on("close", () => this.detach(client));

    let seq: number;
    try {
      const view = await this.options.service.read(
        principal,
        repositoryId,
        scenarioId,
        async ({ scenario, seq }, tx) => ({
          scenarioId: scenario.id,
          seq,
          ancestry: await scenarioAncestry(tx, scenario.id),
        }),
      );
      client.scenarioId = view.scenarioId;
      client.ancestry = new Set(view.ancestry);
      seq = view.seq;
    } catch (error) {
      const message = error instanceof ApiError ? error.title : "Cannot open the live connection";
      socket.close(error instanceof ApiError && error.status === 404 ? 4404 : 4500, message);
      return;
    }
    if (socket.readyState !== socket.OPEN) return;

    // Register before catching up so no live change is missed; live changes are buffered until ready.
    let set = this.clients.get(repositoryId);
    if (!set) this.clients.set(repositoryId, (set = new Set()));
    set.add(client);
    if (!this.feeds.has(repositoryId)) {
      this.feeds.set(repositoryId, { workspaceId: principal.workspaceId, lastSeq: seq, queue: new Mutex() });
      // A change committed after `seq` was read but before this feed existed sent a notice nobody followed.
      void this.deliver(repositoryId, principal.workspaceId, Number.MAX_SAFE_INTEGER);
    }

    client.lastSeq = since ?? seq;
    if (since !== undefined && since !== seq) {
      const backlog =
        since > seq
          ? null
          : await withWorkspace(this.options.conn, principal.workspaceId, (tx) =>
              committedChanges(tx, repositoryId, since, seq, MAX_BACKLOG + 1),
            );
      if (!backlog || backlog.length > MAX_BACKLOG) {
        this.send(client, { type: "resync", fromSeq: seq });
      } else {
        for (const change of backlog)
          if (client.ancestry.has(change.scenarioId)) this.send(client, { type: "committed", change });
      }
      client.lastSeq = seq;
    }
    client.ready = true;
    for (const change of client.buffer) this.forward(client, change);
    client.buffer = [];
    this.announce(client);
    for (const data of early) this.onMessage(client, data);
  }

  // ------------------------------------------------------------------ committed changes

  private onNotify(channel: string, payload: string): void {
    try {
      if (channel === CHANGES_CHANNEL) {
        const notice = JSON.parse(payload) as ChangeNotice;
        if (this.feeds.has(notice.repositoryId)) void this.deliver(notice.repositoryId, notice.workspaceId, notice.seq);
      } else if (channel === PRESENCE_CHANNEL) {
        this.onPresence(JSON.parse(payload) as PresenceNotice);
      }
    } catch (error) {
      this.options.log.warn({ err: error, channel }, "ignoring a malformed notification");
    }
  }

  /** Reads a repository's new changes up to `seq` (once per instance) and forwards them, in order. */
  private deliver(repositoryId: string, workspaceId: string, seq: number): Promise<void> {
    const feed = this.feeds.get(repositoryId);
    if (!feed) return Promise.resolve();
    return feed.queue
      .run(async () => {
        while (feed.lastSeq < seq && this.feeds.get(repositoryId) === feed) {
          const changes = await withWorkspace(this.options.conn, workspaceId, (tx) =>
            committedChanges(tx, repositoryId, feed.lastSeq, seq, MAX_BACKLOG),
          );
          if (changes.length === 0) break;
          for (const change of changes) {
            feed.lastSeq = change.seq;
            for (const client of this.clients.get(repositoryId) ?? []) {
              if (client.ready) this.forward(client, change);
              else client.buffer.push(change);
            }
          }
        }
      })
      .catch((error) => this.options.log.error({ err: error, repositoryId }, "failed to deliver changes"));
  }

  private forward(client: Client, change: CommittedChange): void {
    if (change.seq <= client.lastSeq) return;
    client.lastSeq = change.seq;
    if (client.ancestry.has(change.scenarioId)) this.send(client, { type: "committed", change });
  }

  // ------------------------------------------------------------------ messages from the browser

  private onMessage(client: Client, data: string): void {
    let raw: unknown;
    try {
      raw = JSON.parse(data);
    } catch {
      return this.reject(client, "", [{ code: "invalid", editIndex: 0, property: "", message: "Messages are JSON" }]);
    }
    const parsed = clientMessageSchema.safeParse(raw);
    if (!parsed.success) {
      const changeId = (raw as { change?: { id?: unknown } })?.change?.id;
      const reasons: Rejection[] = parsed.error.issues.slice(0, 20).map((i) => ({
        code: "invalid",
        editIndex: i.path[1] === "edits" && typeof i.path[2] === "number" ? i.path[2] : 0,
        property: i.path.join("."),
        message: i.message,
      }));
      return this.reject(client, typeof changeId === "string" ? changeId : "", reasons);
    }
    const message = parsed.data;
    switch (message.type) {
      case "submit": {
        const { change } = message;
        if (change.scenarioId !== client.scenarioId) {
          const reason = "The change is for another scenario than this connection";
          return this.reject(client, change.id, [
            { code: "invalid", editIndex: 0, property: "scenarioId", message: reason },
          ]);
        }
        // On success the change comes back to every viewer, this one included, as `committed`.
        this.options.service.submit(client.principal, client.repositoryId, client.scenarioId, change).catch((error) => {
          if (error instanceof ApiError) return this.reject(client, change.id, error.toRejections());
          this.options.log.error({ err: error }, "live submit failed");
          this.reject(client, change.id, [{ code: "invalid", editIndex: 0, property: "", message: "Internal error" }]);
        });
        return;
      }
      case "presence": {
        client.presence = {
          ...(message.diagramId !== undefined ? { diagramId: message.diagramId } : {}),
          selection: message.selection ?? [],
          ...(message.cursor ? { cursor: message.cursor } : {}),
        };
        // Cursor moves come fast: share at most one presence update per client every 50 ms.
        client.presenceTimer ??= setTimeout(() => {
          client.presenceTimer = undefined;
          this.announce(client);
        }, PRESENCE_THROTTLE_MS);
        return;
      }
      case "interest":
        // Accepted; item-level subscriptions narrow the stream later (large repositories).
        return;
    }
  }

  private reject(client: Client, changeId: string, reasons: Rejection[]): void {
    this.send(client, { type: "rejected", changeId, reasons });
  }

  // ------------------------------------------------------------------ presence

  private announce(client: Client, gone = false): void {
    const notice: PresenceNotice = gone
      ? { repositoryId: client.repositoryId, connectionId: client.id, gone: true }
      : {
          repositoryId: client.repositoryId,
          connectionId: client.id,
          scenarioId: client.scenarioId,
          user: {
            id: client.principal.userId,
            name: client.principal.userId,
            color: colorFor(client.principal.userId),
          },
          ...(client.presence.diagramId !== undefined ? { diagramId: client.presence.diagramId } : {}),
          selection: client.presence.selection.slice(0, MAX_SELECTION_SHARED),
          ...(client.presence.cursor ? { cursor: client.presence.cursor } : {}),
        };
    notify(this.options.conn, PRESENCE_CHANNEL, JSON.stringify(notice)).catch((error) =>
      this.options.log.warn({ err: error }, "failed to share presence"),
    );
  }

  private onPresence(notice: PresenceNotice): void {
    let entries = this.presence.get(notice.repositoryId);
    if (notice.gone) {
      entries?.delete(notice.connectionId);
    } else {
      if (!entries) this.presence.set(notice.repositoryId, (entries = new Map()));
      entries.set(notice.connectionId, { ...notice, at: Date.now() });
    }
    if (this.clients.has(notice.repositoryId)) this.scheduleBroadcast(notice.repositoryId);
  }

  private scheduleBroadcast(repositoryId: string): void {
    if (this.broadcastTimers.has(repositoryId)) return;
    this.broadcastTimers.set(
      repositoryId,
      setTimeout(() => {
        this.broadcastTimers.delete(repositoryId);
        this.broadcastPresence(repositoryId);
      }, 10),
    );
  }

  private broadcastPresence(repositoryId: string): void {
    const now = Date.now();
    const entries = this.presence.get(repositoryId) ?? new Map();
    const users: Extract<ServerMessage, { type: "presence" }>["users"] = [];
    for (const [id, e] of entries) {
      if (now - e.at > PRESENCE_TTL_MS || !e.user) {
        entries.delete(id);
        continue;
      }
      users.push({
        id: e.user.id,
        name: e.user.name,
        color: e.user.color,
        ...(e.diagramId !== undefined ? { diagramId: e.diagramId } : {}),
        selection: e.selection ?? [],
        ...(e.cursor ? { cursor: e.cursor } : {}),
      });
    }
    for (const client of this.clients.get(repositoryId) ?? [])
      if (client.ready) this.send(client, { type: "presence", users });
  }

  // ------------------------------------------------------------------ lifecycle

  private detach(client: Client): void {
    clearTimeout(client.presenceTimer);
    const set = this.clients.get(client.repositoryId);
    if (!set?.delete(client)) return;
    if (set.size === 0) {
      this.clients.delete(client.repositoryId);
      this.feeds.delete(client.repositoryId);
    }
    this.announce(client, true);
  }

  /** Re-shares local presence (so it outlives other instances' TTL), drops stale entries, pings sockets. */
  private beat(): void {
    for (const set of this.clients.values()) {
      for (const client of set) {
        if (!client.alive) {
          client.socket.terminate();
          continue;
        }
        client.alive = false;
        client.socket.ping();
        if (client.ready) this.announce(client);
      }
    }
    for (const repositoryId of this.clients.keys()) this.broadcastPresence(repositoryId);
  }

  private send(client: Client, message: ServerMessage): void {
    if (client.socket.readyState === client.socket.OPEN) client.socket.send(JSON.stringify(message));
  }
}
