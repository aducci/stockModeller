// Scenario-aware reads of the model: folders, objects, relationships, diagrams.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { itemHistory, loadMetamodelPackage } from "@connectome/db";
import { snapshotRows, type RepositorySnapshot } from "@connectome/engine";
import { trace, TRACE_KINDS } from "@connectome/semantics";
import type { Routes } from "../app";
import { compileQuery } from "../queries";
import { notFound } from "../problems";
import { diagramJson, objectJson, relationshipJson } from "../serialize";

type RepoParams = { Params: { repo: string } };
type ItemParams = { Params: { repo: string; id: string } };

const scenarioQuery = z.object({ scenario: z.string().min(1).optional() });
const objectsQuery = scenarioQuery.extend({
  q: z.string().max(2000).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  cursor: z.string().max(200).optional(),
});
const relationshipsQuery = scenarioQuery.extend({
  type: z.string().optional(),
  source: z.string().optional(),
  target: z.string().optional(),
});

const traceQuery = scenarioQuery.extend({
  kind: z.enum(TRACE_KINDS),
  direction: z.enum(["forward", "backward"]).default("forward"),
  depth: z.coerce.number().int().min(1).max(20).default(6),
  contents: z.enum(["true", "false"]).default("false"),
});

const encodeCursor = (id: string) => Buffer.from(id).toString("base64url");
const decodeCursor = (cursor: string) => Buffer.from(cursor, "base64url").toString();

export function modelRoutes(app: FastifyInstance, { service, principal }: Routes) {
  app.get<RepoParams>("/repositories/:repo/folders", async (req) => {
    const { scenario } = scenarioQuery.parse(req.query);
    return service.read(principal(req), req.params.repo, scenario, ({ state }) =>
      [...state.folders.live()]
        .map((f) => ({ id: f.id, parentId: f.parentId, name: f.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
  });

  app.get<RepoParams>("/repositories/:repo/objects", async (req) => {
    const query = objectsQuery.parse(req.query);
    return service.read(principal(req), req.params.repo, query.scenario, ({ state, metamodel, seq }) => {
      const matches = query.q ? compileQuery(query.q, state, metamodel) : () => true;
      const after = query.cursor ? decodeCursor(query.cursor) : "";
      const all = [...state.objects.live()]
        .filter((o) => o.id > after && matches(o))
        .sort((a, b) => a.id.localeCompare(b.id));
      const items = all.slice(0, query.limit);
      const nextCursor = all.length > query.limit ? encodeCursor(items.at(-1)!.id) : null;
      return { seq, items: items.map(objectJson), hidden: 0, nextCursor };
    });
  });

  app.get<ItemParams>("/repositories/:repo/objects/:id", async (req) => {
    const { scenario } = scenarioQuery.parse(req.query);
    return service.read(principal(req), req.params.repo, scenario, ({ state }) => {
      const obj = state.objects.get(req.params.id);
      if (!obj) throw notFound(`Object ${req.params.id}`);
      return objectJson(obj);
    });
  });

  app.get<ItemParams>("/repositories/:repo/objects/:id/relationships", async (req) => {
    const { scenario } = scenarioQuery.parse(req.query);
    return service.read(principal(req), req.params.repo, scenario, ({ state }) => {
      if (!state.objects.get(req.params.id)) throw notFound(`Object ${req.params.id}`);
      return [
        ...state.relationships.find("bySource", req.params.id),
        ...state.relationships.find("byTarget", req.params.id),
      ].map(relationshipJson);
    });
  });

  app.get<ItemParams>("/repositories/:repo/objects/:id/occurrences", async (req) => {
    const { scenario } = scenarioQuery.parse(req.query);
    return service.read(principal(req), req.params.repo, scenario, ({ state }) => {
      if (!state.objects.get(req.params.id)) throw notFound(`Object ${req.params.id}`);
      return state.objectOccurrences.find("byObject", req.params.id).map((o) => ({
        diagramId: o.diagramId,
        diagramName: state.diagrams.get(o.diagramId)!.name,
        occurrenceId: o.id,
      }));
    });
  });

  // Traces by meaning (design/02-model/semantics.md §9.3): levels, flow, payload and dependency.
  app.get<ItemParams>("/repositories/:repo/objects/:id/trace", async (req) => {
    const query = traceQuery.parse(req.query);
    return service.read(principal(req), req.params.repo, query.scenario, ({ state, metamodel }) => {
      if (!state.objects.get(req.params.id)) throw notFound(`Object ${req.params.id}`);
      const result = trace(state, metamodel, req.params.id, query.kind, query.direction, {
        depth: query.depth,
        contents: query.contents === "true",
      });
      return {
        ...result,
        steps: result.steps.map((s) => {
          const o = state.objects.get(s.objectId)!;
          return { ...s, name: o.name, type: o.type, level: metamodel.objectLevel(o) ?? null };
        }),
      };
    });
  });

  app.get<ItemParams>("/repositories/:repo/objects/:id/history", async (req) => {
    const { scenario } = scenarioQuery.parse(req.query);
    return service.read(principal(req), req.params.repo, scenario, async ({ state }, tx) => {
      if (!state.objects.getAny(req.params.id)) throw notFound(`Object ${req.params.id}`);
      const rows = await itemHistory(tx, req.params.repo, req.params.id);
      return rows.map((r) => ({
        seq: r.seq,
        changeId: r.change_id,
        label: r.label,
        actor: r.actor_id,
        source: r.source,
        scenarioId: r.scenario_id,
        committedAt: r.committed_at.toISOString(),
        edit: r.edit,
      }));
    });
  });

  app.get<RepoParams>("/repositories/:repo/relationships", async (req) => {
    const query = relationshipsQuery.parse(req.query);
    return service.read(principal(req), req.params.repo, query.scenario, ({ state }) => {
      const candidates = query.source
        ? state.relationships.find("bySource", query.source)
        : query.target
          ? state.relationships.find("byTarget", query.target)
          : [...state.relationships.live()];
      return candidates
        .filter((r) => (!query.type || r.type === query.type) && (!query.target || r.targetId === query.target))
        .sort((a, b) => a.id.localeCompare(b.id))
        .map(relationshipJson);
    });
  });

  app.get<ItemParams>("/repositories/:repo/relationships/:id", async (req) => {
    const { scenario } = scenarioQuery.parse(req.query);
    return service.read(principal(req), req.params.repo, scenario, ({ state }) => {
      const rel = state.relationships.get(req.params.id);
      if (!rel) throw notFound(`Relationship ${req.params.id}`);
      return relationshipJson(rel);
    });
  });

  app.get<ItemParams>("/repositories/:repo/diagrams/:id", async (req) => {
    const { scenario } = scenarioQuery.parse(req.query);
    return service.read(principal(req), req.params.repo, scenario, ({ state }) => {
      const diagram = diagramJson(state, req.params.id);
      if (!diagram) throw notFound(`Diagram ${req.params.id}`);
      return diagram;
    });
  });

  // The whole scenario as engine rows, for the browser's optimistic store (decision B16).
  app.get<RepoParams>("/repositories/:repo/snapshot", async (req) => {
    const { scenario: scenarioId } = scenarioQuery.parse(req.query);
    return service.read(
      principal(req),
      req.params.repo,
      scenarioId,
      async ({ repository, scenario, state, seq }, tx): Promise<RepositorySnapshot> => {
        // Serialise now: the cached state may change as soon as the read lets go of it.
        const rows = snapshotRows(state);
        const { metamodel, diagramTypes } = await loadMetamodelPackage(tx, repository.id);
        return {
          repository: { ...repository, seq },
          scenario,
          seq,
          metamodel: { package: metamodel, diagramTypes },
          rows,
        };
      },
    );
  });
}
