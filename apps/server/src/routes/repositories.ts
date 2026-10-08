import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { essentials } from "@connectome/content";
import { createRepository, getRepository, listRepositories, listScenarios, withWorkspace } from "@connectome/db";
import { Metamodel, MetamodelError } from "@connectome/engine";
import { ulid, validateDiagramType, validatePackage, type DiagramType, type MetamodelPackage } from "@connectome/model";
import type { Routes } from "../app";
import { invalid, notFound } from "../problems";

const createBody = z.strictObject({
  id: z.string().min(1).max(64).optional(),
  name: z.string().trim().min(1).max(200),
  description: z.string().max(10_000).optional(),
  /** The metamodel to start from (an exported one, or an empty one); Essentials when left out. */
  metamodel: z
    .strictObject({
      package: z.looseObject({ name: z.string().min(1).max(200) }),
      diagramTypes: z.array(z.looseObject({ key: z.string().min(1).max(200) })).max(1000),
    })
    .optional(),
});

/** Checks a metamodel sent to start a repository with, as publishing one does. */
function startingMetamodel(body: NonNullable<z.infer<typeof createBody>["metamodel"]>) {
  const pkg = { version: "1.0.0", ...body.package } as MetamodelPackage;
  const diagramTypes = body.diagramTypes as unknown as DiagramType[];
  const checked = validatePackage(pkg);
  const problems = [
    ...(checked.ok ? [] : checked.errors),
    ...diagramTypes.flatMap((d) => {
      const r = validateDiagramType(d);
      return r.ok ? [] : r.errors.map((e) => `Diagram type ${d.key}: ${e}`);
    }),
  ];
  if (problems.length === 0) {
    try {
      Metamodel.compile(pkg, diagramTypes);
    } catch (error) {
      if (!(error instanceof MetamodelError)) throw error;
      problems.push(...error.problems);
    }
  }
  if (problems.length > 0)
    throw invalid(
      "The metamodel cannot be used",
      problems.slice(0, 20).map((message) => ({ property: "metamodel", message })),
    );
  return { metamodel: pkg, diagramTypes };
}

export function repositoryRoutes(app: FastifyInstance, { conn, service, principal }: Routes) {
  app.get("/repositories", async (req) =>
    withWorkspace(conn, principal(req).workspaceId, (tx) => listRepositories(tx)),
  );

  /** Creates a repository with a metamodel (Essentials unless one is sent) and a baseline scenario. */
  app.post("/repositories", async (req, reply) => {
    const body = createBody.parse(req.body);
    const { workspaceId } = principal(req);
    const id = body.id ?? ulid();
    const start = body.metamodel ? startingMetamodel(body.metamodel) : essentials;
    const repository = await withWorkspace(conn, workspaceId, async (tx) => {
      await createRepository(tx, { id, workspaceId, name: body.name, baselineScenarioId: ulid(), ...start });
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

  /** Deletes a repository with its metamodel and everything modelled in it. */
  app.delete<{ Params: { repo: string } }>("/repositories/:repo", async (req, reply) => {
    const deleted = await service.deleteRepository(principal(req), req.params.repo);
    if (!deleted) throw notFound(`Repository ${req.params.repo}`);
    return reply.code(204).send();
  });

  app.get<{ Params: { repo: string } }>("/repositories/:repo/scenarios", async (req) =>
    withWorkspace(conn, principal(req).workspaceId, async (tx) => {
      if (!(await getRepository(tx, req.params.repo))) throw notFound(`Repository ${req.params.repo}`);
      return listScenarios(tx, req.params.repo);
    }),
  );
}
