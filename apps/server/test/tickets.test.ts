import { describe, expect, it } from "vitest";
import { TICKET_TTL_MS, Tickets } from "../src/live/tickets";

describe("live tickets", () => {
  const principal = { workspaceId: "W1", userId: "dana@example.com" };

  it("round-trips the principal until it expires", () => {
    const tickets = new Tickets("secret");
    const { ticket } = tickets.issue(principal, 1000);
    expect(tickets.verify(ticket, 1000 + TICKET_TTL_MS - 1)).toEqual(principal);
    expect(tickets.verify(ticket, 1000 + TICKET_TTL_MS)).toBeNull();
  });

  it("rejects tampered tickets and tickets signed with another secret", () => {
    const { ticket } = new Tickets("secret").issue(principal);
    const [body, signature] = ticket.split(".");
    const forged = Buffer.from(JSON.stringify({ w: "W2", u: "eve", exp: Date.now() + 60_000 })).toString("base64url");
    expect(new Tickets("secret").verify(`${forged}.${signature}`)).toBeNull();
    expect(new Tickets("other").verify(ticket)).toBeNull();
    expect(new Tickets("secret").verify(`${body}`)).toBeNull();
    expect(new Tickets("secret").verify("garbage")).toBeNull();
  });
});
