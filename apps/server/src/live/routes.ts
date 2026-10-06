import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Routes } from "../app";
import type { LiveHub } from "./hub";
import type { Tickets } from "./tickets";

const liveQuery = z.object({
  repository: z.string().min(1),
  scenario: z.string().min(1).optional(),
  since: z.coerce.number().int().min(0).optional(),
  ticket: z.string().optional(),
});

/** `GET /api/v1/live?repository=&scenario=&since=` (WebSocket) and `POST /api/v1/live/tickets`. */
export function liveRoutes(app: FastifyInstance, { principal }: Routes, hub: LiveHub, tickets: Tickets) {
  app.post("/live/tickets", async (req) => tickets.issue(principal(req)));

  app.get("/live", { websocket: true }, (socket, req) => {
    const query = liveQuery.safeParse(req.query);
    if (!query.success) {
      socket.close(4400, "Give ?repository= and optionally ?scenario= and ?since=");
      return;
    }
    void hub.attach(socket, principal(req), query.data.repository, query.data.scenario, query.data.since);
  });
}
