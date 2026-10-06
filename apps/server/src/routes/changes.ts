// The only write path: POST …/changes (design/03-platform/api.md §1, §3).
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Routes } from "../app";

const postQuery = z.object({
  scenario: z.string().min(1).optional(),
  preview: z.enum(["true", "false"]).optional(),
});
const sinceQuery = z.object({
  since: z.coerce.number().int().min(0),
  limit: z.coerce.number().int().min(1).max(1000).default(500),
});
const undoBody = z.strictObject({ id: z.string().min(1).max(64).optional() }).optional();

export function changeRoutes(app: FastifyInstance, { service, principal }: Routes) {
  app.post<{ Params: { repo: string } }>("/repositories/:repo/changes", async (req, reply) => {
    const query = postQuery.parse(req.query);
    const { status, result } = await service.submit(principal(req), req.params.repo, query.scenario, req.body, {
      preview: query.preview === "true",
    });
    return reply.code(status).send(result);
  });

  app.get<{ Params: { repo: string } }>("/repositories/:repo/changes", async (req) => {
    const { since, limit } = sinceQuery.parse(req.query);
    return service.changesSince(principal(req), req.params.repo, since, limit);
  });

  app.post<{ Params: { repo: string; changeId: string } }>(
    "/repositories/:repo/changes/:changeId/undo",
    async (req, reply) => {
      const body = undoBody.parse(req.body ?? undefined);
      const { status, result } = await service.undo(principal(req), req.params.repo, req.params.changeId, body?.id);
      return reply.code(status).send(result);
    },
  );
}
