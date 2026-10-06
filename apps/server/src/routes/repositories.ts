import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { essentials } from "@connectome/content";
import { createRepository, getRepository, listRepositories, listScenarios, withWorkspace } from "@connectome/db";
import { ulid } from "@connectome/model";
import type { Routes } from "../app";
import { notFound } from "../problems";

const createBody = z.strictObject({
  id: z.string().min(1).max(64).optional(),
  name: z.string().trim().min(1).max(200),
  description: z.string().max(10_000).optional(),
});

export function repositoryRoutes(app: FastifyInstance, { conn, principal }: Routes) {
  app.get("/repositories", async (req) =>
    withWorkspace(conn, principal(req).workspaceId, (tx) => listRepositories(tx)),
  );

  /** Creates a repository with the Essentials package and a baseline scenario. */
  app.post("/repositories", async (req, reply) => {
    const body = createBody.parse(req.body);
    const { workspaceId } = principal(req);
    const id = body.id ?? ulid();
    const repository = await withWorkspace(conn, workspaceId, async (tx) => {
      await createRepository(tx, { id, workspaceId, name: body.name, baselineScenarioId: ulid(), ...essentials });
      if (body.description)
        await tx.updateTable("repository").set({ description: body.description }).where("id", "=", id).execute();
      return getRepository(tx, id);
    });
    return reply.code(201).send(repository);
  });

  app.get<{ Params: { repo: string } }>("/repositories/:repo", async (req) =>
    withWorkspace(conn, principal(req).workspaceId, async (tx) => {
      const repository = await getRepository(tx, req.params.repo);
      if (!repository) throw notFound(`Repository ${req.params.repo}`);
      return { ...repository, scenarios: await listScenarios(tx, req.params.repo) };
    }),
  );

  app.get<{ Params: { repo: string } }>("/repositories/:repo/scenarios", async (req) =>
    withWorkspace(conn, principal(req).workspaceId, async (tx) => {
      if (!(await getRepository(tx, req.params.repo))) throw notFound(`Repository ${req.params.repo}`);
      return listScenarios(tx, req.params.repo);
    }),
  );
}
