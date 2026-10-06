// A live editing session: loads a snapshot into a ModelStore, keeps it current over the live connection
// (design/03-platform/api.md §4) and sends the user's changes.
//
// Connectivity (collaboration-and-changes.md §2): short drops are tolerated. Changes made meanwhile stay
// pending and are sent when the connection is back (resending is safe: the server is idempotent on the change
// id). After two minutes offline, editing pauses until the connection returns.
import type { Change, ClientMessage, Id, Rejection, ServerMessage } from "@connectome/model";
import { ApiClient, ApiProblem, type ApiOptions } from "./http";
import { ModelStore, type EditResult, type StoreEvent } from "./store";

/** The part of the browser's WebSocket the session uses (Node 22 has the same global). */
export interface SocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number; reason: string }) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

export type SessionStatus = "connecting" | "live" | "reconnecting" | "paused" | "closed";

export type PresenceUser = Extract<ServerMessage, { type: "presence" }>["users"][number];

export type SessionEvent =
  | StoreEvent
  | { type: "status"; status: SessionStatus }
  | { type: "presence"; users: PresenceUser[] }
  /** The session cannot continue (e.g. the repository is gone or access was lost). */
  | { type: "error"; message: string };

export interface SessionOptions extends ApiOptions {
  repositoryId: Id;
  /** Defaults to the baseline. */
  scenarioId?: Id;
  /** The signed-in user (stamped on optimistic edits until the server confirms them). */
  userId: Id;
  /** Opens a WebSocket; defaults to the global WebSocket. */
  socket?: (url: string) => SocketLike;
  /** Waits between reconnect attempts; the last one repeats. */
  reconnectDelaysMs?: number[];
  /** Editing pauses after this long offline. */
  pauseAfterMs?: number;
}

const OPEN = 1;
const PAUSED: Rejection = { code: "forbidden", editIndex: 0, scope: "offline" };
/** Close codes the server uses for requests that will never succeed (bad query, unknown repository). */
const FATAL_CLOSE = new Set([4400, 4401, 4403, 4404]);

export class LiveSession {
  status: SessionStatus = "connecting";
  presence: PresenceUser[] = [];

  private socket: SocketLike | undefined;
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private pauseTimer: ReturnType<typeof setTimeout> | undefined;
  /** Messages that arrive while a snapshot is reloading wait here. */
  private held: ServerMessage[] | null = null;
  /** A reload is needed and has not succeeded yet (retried when the connection opens). */
  private stale = false;
  private readonly listeners = new Set<(event: SessionEvent) => void>();

  private constructor(
    readonly store: ModelStore,
    readonly api: ApiClient,
    private readonly options: SessionOptions,
  ) {
    store.subscribe((event) => this.emit(event));
  }

  /** Loads the scenario and opens the live connection. */
  static async open(options: SessionOptions): Promise<LiveSession> {
    const api = new ApiClient(options);
    const snapshot = await api.snapshot(options.repositoryId, options.scenarioId);
    const store = new ModelStore(snapshot, { user: { kind: "user", id: options.userId } });
    const session = new LiveSession(store, api, options);
    session.connect();
    return session;
  }

  subscribe(listener: (event: SessionEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Applies a change at once and sends it. Refused changes are neither kept nor sent. */
  edit(change: Omit<Change, "scenarioId"> & { scenarioId?: Id }): EditResult {
    if (this.status === "paused" || this.status === "closed") return { ok: false, reasons: [PAUSED] };
    const full: Change = { ...change, scenarioId: this.store.scenario.id };
    const result = this.store.edit(full);
    if (result.ok) this.send({ type: "submit", change: full });
    return result;
  }

  /** Shares where the user is and what they have selected (ephemeral, never stored). */
  setPresence(presence: Omit<Extract<ClientMessage, { type: "presence" }>, "type">): void {
    this.send({ type: "presence", ...presence });
  }

  close(): void {
    this.setStatus("closed");
    clearTimeout(this.reconnectTimer);
    clearTimeout(this.pauseTimer);
    this.socket?.close(1000, "Closed");
    this.socket = undefined;
  }

  // ------------------------------------------------------------------ the connection

  private connect(): void {
    void this.openSocket().catch((error: unknown) => {
      if (error instanceof ApiProblem && (error.status === 401 || error.status === 403 || error.status === 404)) {
        return this.fail(error.message);
      }
      this.scheduleReconnect();
    });
  }

  private async openSocket(): Promise<void> {
    const { ticket } = await this.api.ticket();
    if (this.status === "closed") return;
    const query = new URLSearchParams({ repository: this.options.repositoryId, scenario: this.store.scenario.id });
    query.set("since", String(this.store.seq));
    query.set("ticket", ticket);
    const url = `${this.api.liveUrl}?${query}`;
    const socket = (this.options.socket ?? defaultSocket)(url);
    this.socket = socket;

    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.attempt = 0;
      clearTimeout(this.pauseTimer);
      this.pauseTimer = undefined;
      this.setStatus("live");
      if (this.stale) return void this.reload();
      // The server catches this connection up before reading these, so already-committed ones are no-ops.
      for (const change of this.store.pendingChanges) this.send({ type: "submit", change });
    };
    socket.onmessage = (event) => {
      if (this.socket !== socket) return;
      const message = JSON.parse(String(event.data)) as ServerMessage;
      if (this.held) this.held.push(message);
      else this.handle(message);
    };
    socket.onclose = (event) => {
      if (this.socket !== socket) return;
      this.socket = undefined;
      if (this.status === "closed") return;
      if (FATAL_CLOSE.has(event.code)) return this.fail(event.reason || `Closed with code ${event.code}`);
      this.scheduleReconnect();
    };
    socket.onerror = () => {}; // onclose follows
  }

  private scheduleReconnect(): void {
    if (this.status === "closed") return;
    if (this.status !== "paused") this.setStatus("reconnecting");
    this.pauseTimer ??= setTimeout(() => this.setStatus("paused"), this.options.pauseAfterMs ?? 120_000);
    const delays = this.options.reconnectDelaysMs ?? [250, 1000, 2000, 5000];
    const delay = delays[Math.min(this.attempt++, delays.length - 1)]!;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private fail(message: string): void {
    this.close();
    this.emit({ type: "error", message });
  }

  private handle(message: ServerMessage): void {
    switch (message.type) {
      case "committed":
        if (this.store.commit(message.change) === "stale") void this.reload();
        return;
      case "rejected":
        this.store.reject(message.changeId, message.reasons);
        return;
      case "presence":
        this.presence = message.users;
        this.emit({ type: "presence", users: message.users });
        return;
      case "resync":
        void this.reload();
        return;
      case "held":
        // Change requests come after launch (collaboration §4); nothing is held yet.
        return;
    }
  }

  /**
   * Reloads the scenario when the stream can't be applied locally. Pending changes are settled first over HTTP
   * (idempotent: a change committed earlier returns its original outcome), so none is applied twice on top of a
   * snapshot that already holds it. Live messages wait meanwhile and are applied after the snapshot.
   */
  private async reload(): Promise<void> {
    if (this.held) return;
    this.held = [];
    this.stale = true;
    try {
      for (const change of [...this.store.pendingChanges]) {
        try {
          await this.api.submit(this.options.repositoryId, change);
          this.store.forget(change.id);
        } catch (error) {
          if (!(error instanceof ApiProblem) || error.status >= 500) throw error;
          this.store.reject(change.id, error.reasons());
        }
      }
      const snapshot = await this.api.snapshot(this.options.repositoryId, this.store.scenario.id);
      this.store.reset(snapshot);
      this.stale = false;
    } catch {
      // Offline or failing: drop the connection; reconnecting catches up from the last applied change.
      this.held = null;
      this.socket?.close(4000, "Reload failed");
      return;
    }
    const held = this.held;
    this.held = null;
    for (const message of held) this.handle(message);
    // Changes made during the reload were applied to the old view only; the server still needs them.
    for (const change of this.store.pendingChanges) this.send({ type: "submit", change });
  }

  private send(message: ClientMessage): void {
    if (this.socket?.readyState === OPEN) this.socket.send(JSON.stringify(message));
  }

  private setStatus(status: SessionStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.emit({ type: "status", status });
  }

  private emit(event: SessionEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

function defaultSocket(url: string): SocketLike {
  const WebSocketCtor = (globalThis as { WebSocket?: new (url: string) => SocketLike }).WebSocket;
  if (!WebSocketCtor) throw new Error("No WebSocket available: pass options.socket");
  return new WebSocketCtor(url);
}
