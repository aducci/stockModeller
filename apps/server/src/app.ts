// The HTTP application (role "web" in ADR-002). The web app uses this same public API.
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import websocket from "@fastify/websocket";
import { ZodError } from "zod";
import type { Connection } from "@connectome/db";
import type { Authenticate, Principal } from "./auth";
import { ApiError } from "./problems";
import { ModelService } from "./service";
import { changeRoutes } from "./routes/changes";
import { metamodelRoutes } from "./routes/metamodel";
import { modelRoutes } from "./routes/model";
import { repositoryRoutes } from "./routes/repositories";
import { LiveHub } from "./live/hub";
import { liveRoutes } from "./live/routes";
import { Tickets } from "./live/tickets";

export interface AppOptions {
  conn: Connection;
  authenticate: Authenticate;
  logger?: boolean | { level: string };
  /** Enables live updates: the LISTEN connection needs its own connection string. */
  live?: { connectionString: string; ticketSecret?: string };
}

/** What every route module receives. */
export interface Routes {
  conn: Connection;
  service: ModelService;
  principal: (req: FastifyRequest) => Principal;
}

declare module "fastify" {
  interface FastifyRequest {
    principal?: Principal;
  }
}

export function buildApp(options: AppOptions): FastifyInstance & { service: ModelService; hub: LiveHub | undefined } {
  const app = Fastify({ logger: options.logger ?? false, bodyLimit: 20 * 1024 * 1024 });
  const service = new ModelService(options.conn);
  const tickets = new Tickets(options.live?.ticketSecret);
  const hub = options.live
    ? new LiveHub({ conn: options.conn, service, connectionString: options.live.connectionString, log: app.log })
    : undefined;
  if (hub) {
    app.addHook("onReady", () => hub.start());
    app.addHook("onClose", () => hub.stop());
  }
  app.register(websocket, { options: { maxPayload: 20 * 1024 * 1024 } });

  app.setErrorHandler((error, req, reply) => {
    const problem =
      error instanceof ApiError
        ? error
        : error instanceof ZodError
          ? new ApiError(
              422,
              "invalid",
              "The request is invalid",
              error.issues.slice(0, 20).map((i) => ({ property: i.path.join("."), message: i.message })),
            )
          : (error as { statusCode?: number }).statusCode && (error as { statusCode: number }).statusCode < 500
            ? new ApiError((error as { statusCode: number }).statusCode, "invalid", (error as Error).message)
            : null;
    if (!problem) {
      req.log.error(error);
      return reply
        .code(500)
        .type("application/problem+json")
        .send({ type: "about:blank", title: "Internal error", status: 500 });
    }
    return reply.code(problem.status).type("application/problem+json").send(problem.toProblem());
  });

  app.setNotFoundHandler((req, reply) =>
    reply
      .code(404)
      .type("application/problem+json")
      .send(new ApiError(404, "notFound", `No route ${req.method} ${req.url}`).toProblem()),
  );

  app.get("/healthz", async () => ({ ok: true }));

  app.register(
    async (api) => {
      api.addHook("onRequest", async (req) => {
        // Browsers cannot set headers on a WebSocket: they sign in with a short-lived ticket instead.
        const ticket = (req.query as { ticket?: unknown }).ticket;
        const principal = options.authenticate(req) ?? (typeof ticket === "string" ? tickets.verify(ticket) : null);
        if (!principal) throw new ApiError(401, "unauthenticated", "Sign in to use the API");
        req.principal = principal;
      });
      const routes: Routes = { conn: options.conn, service, principal: (req) => req.principal! };
      repositoryRoutes(api, routes);
      modelRoutes(api, routes);
      changeRoutes(api, routes);
      metamodelRoutes(api, routes);
      if (hub) liveRoutes(api, routes, hub, tickets);
    },
    { prefix: "/api/v1" },
  );

  return Object.assign(app, { service, hub });
}
