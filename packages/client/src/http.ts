// The HTTP calls the web app makes (design/03-platform/openapi.yaml).
import type { RepositorySnapshot } from "@connectome/engine";
import type { Change, Id, Rejection } from "@connectome/model";

export interface ApiOptions {
  /** Where the server is, e.g. "http://localhost:3000" or "" for the page's own origin. */
  baseUrl: string;
  /** The Authorization header, e.g. "Bearer dev:W1:dana@example.com". */
  authorization: string;
  fetch?: typeof fetch;
}

interface ProblemBody {
  title?: string;
  code?: string;
  details?: {
    editIndex?: number;
    property?: string;
    rule?: string;
    message?: string;
    itemId?: string;
    changedBy?: string;
  }[];
}

/** An RFC 9457 problem returned by the server. */
export class ApiProblem extends Error {
  constructor(
    readonly status: number,
    readonly body: ProblemBody,
  ) {
    super(body.title ?? `HTTP ${status}`);
  }

  /** The problem as change rejections (the inverse of the server's rejectionProblem). */
  reasons(): Rejection[] {
    const details = this.body.details?.length ? this.body.details : [{}];
    return details.map((d): Rejection => {
      const editIndex = d.editIndex ?? 0;
      switch (this.body.code) {
        case "conflict":
          return { code: "conflict", editIndex, property: d.property ?? "", changedBy: d.changedBy ?? "" };
        case "gone":
          return { code: "gone", editIndex, itemId: d.itemId ?? "" };
        case "ruleViolation":
          return { code: "ruleViolation", editIndex, rule: d.rule ?? "", message: d.message ?? this.message };
        case "forbidden":
          return { code: "forbidden", editIndex, scope: d.message ?? this.message };
        default:
          return { code: "invalid", editIndex, property: d.property ?? "", message: d.message ?? this.message };
      }
    });
  }
}

export class ApiClient {
  private readonly base: string;
  private readonly fetch: typeof fetch;

  constructor(private readonly options: ApiOptions) {
    this.base = `${options.baseUrl.replace(/\/$/, "")}/api/v1`;
    this.fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  }

  /** The WebSocket URL of the live connection. */
  get liveUrl(): string {
    const absolute = new URL(`${this.base}/live`, (globalThis as { location?: { href: string } }).location?.href);
    absolute.protocol = absolute.protocol === "https:" ? "wss:" : "ws:";
    return absolute.toString();
  }

  snapshot(repositoryId: Id, scenarioId?: Id): Promise<RepositorySnapshot> {
    const query = scenarioId ? `?scenario=${encodeURIComponent(scenarioId)}` : "";
    return this.request("GET", `/repositories/${encodeURIComponent(repositoryId)}/snapshot${query}`);
  }

  ticket(): Promise<{ ticket: string; expiresAt: string }> {
    return this.request("POST", "/live/tickets");
  }

  /** Submits a change (idempotent on its id: a change committed before returns its original outcome). */
  submit(repositoryId: Id, change: Change): Promise<{ seq: number; versions: Record<Id, number> }> {
    const query = `?scenario=${encodeURIComponent(change.scenarioId)}`;
    return this.request("POST", `/repositories/${encodeURIComponent(repositoryId)}/changes${query}`, change);
  }

  private async request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { authorization: this.options.authorization };
    if (body !== undefined) headers["content-type"] = "application/json";
    const res = await this.fetch(`${this.base}${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    const json = text ? (JSON.parse(text) as unknown) : undefined;
    if (!res.ok) throw new ApiProblem(res.status, (json ?? {}) as ProblemBody);
    return json as T;
  }
}
