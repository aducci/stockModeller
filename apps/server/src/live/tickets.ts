// Short-lived tickets for the live connection (security.md §1: "live connections use short-lived tokens").
// Browsers cannot set headers on a WebSocket, so a signed-in client first asks for a ticket over HTTP
// and passes it as ?ticket=. A ticket names its workspace and user and expires after a minute.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Principal } from "../auth";

export const TICKET_TTL_MS = 60_000;

export class Tickets {
  private readonly secret: Buffer;

  constructor(secret?: string) {
    this.secret = secret ? Buffer.from(secret) : randomBytes(32);
  }

  issue(principal: Principal, now = Date.now()): { ticket: string; expiresAt: string } {
    const exp = now + TICKET_TTL_MS;
    const body = Buffer.from(JSON.stringify({ w: principal.workspaceId, u: principal.userId, exp })).toString(
      "base64url",
    );
    return { ticket: `${body}.${this.sign(body)}`, expiresAt: new Date(exp).toISOString() };
  }

  verify(ticket: string, now = Date.now()): Principal | null {
    const [body, signature] = ticket.split(".");
    if (!body || !signature) return null;
    const expected = Buffer.from(this.sign(body));
    const given = Buffer.from(signature);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    try {
      const { w, u, exp } = JSON.parse(Buffer.from(body, "base64url").toString()) as {
        w: string;
        u: string;
        exp: number;
      };
      return exp > now ? { workspaceId: w, userId: u } : null;
    } catch {
      return null;
    }
  }

  private sign(body: string): string {
    return createHmac("sha256", this.secret).update(body).digest("base64url");
  }
}
