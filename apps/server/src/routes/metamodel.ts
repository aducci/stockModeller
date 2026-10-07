// Metamodel administration (design/02-model/notation-and-metamodel-admin.md §10): publishing relationship rules.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Routes } from "../app";

const typeRef = z.string().min(1).max(200);
const rulesBody = z.strictObject({
  baseVersion: z.string().min(1).max(50),
  relationshipRules: z
    .array(
      z.strictObject({
        relationshipType: typeRef,
        sourceType: typeRef,
        targetType: typeRef,
        cardinality: z.enum(["0..1", "0..*", "1..1", "1..*"]).optional(),
        enforcement: z.enum(["block", "warn"]).optional(),
      }),
    )
    .max(5000),
});
const rulesQuery = z.object({ preview: z.enum(["true", "false"]).optional() });

export function metamodelRoutes(app: FastifyInstance, { service, principal }: Routes) {
  app.put<{ Params: { repo: string } }>("/repositories/:repo/metamodel/relationship-rules", async (req) => {
    const body = rulesBody.parse(req.body);
    const { preview } = rulesQuery.parse(req.query);
    return service.publishRelationshipRules(principal(req), req.params.repo, body, preview === "true");
  });
}
