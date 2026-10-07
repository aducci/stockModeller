// Test setup: a throwaway database, a workspace, the example repository, and the app.
import { expect } from "vitest";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { Ajv2020 } from "ajv/dist/2020.js";
import { essentials, insuranceGroup } from "@connectome/content";
import { createRepository, createScenario, createWorkspace, withWorkspace } from "@connectome/db";
import { buildApp, devAuthenticate } from "../src";
import { createTestDatabase, type TestDatabase } from "../../../packages/db/test/testdb";
import { designDir } from "../../../packages/model/test/design";

export { describeDb } from "../../../packages/db/test/testdb";

export const WS = "W1";
export const DANA = "dana@example.com";
export const REPO = insuranceGroup.repository.id;
export const BASELINE = insuranceGroup.baselineScenarioId;
export const TARGET = insuranceGroup.targetScenario.id;
export const token = (userId = DANA, workspaceId = WS) => `Bearer dev:${workspaceId}:${userId}`;

export async function setup() {
  const db: TestDatabase = await createTestDatabase();
  for (const ws of [WS, "W2"]) {
    await withWorkspace(db.conn, ws, (tx) => createWorkspace(tx, { id: ws, name: ws }));
  }
  await withWorkspace(db.conn, WS, (tx) =>
    createRepository(tx, {
      id: REPO,
      workspaceId: WS,
      name: insuranceGroup.repository.name,
      baselineScenarioId: BASELINE,
      ...essentials,
    }),
  );
  const app = buildApp({ conn: db.conn, authenticate: devAuthenticate, live: { connectionString: db.url } });
  await app.service.submit({ workspaceId: WS, userId: DANA }, REPO, undefined, insuranceGroup.baselineChange());
  await withWorkspace(db.conn, WS, (tx) =>
    createScenario(tx, { id: TARGET, workspaceId: WS, repositoryId: REPO, parentId: BASELINE, name: "Target 2027" }),
  );

  const request = async (method: "GET" | "POST" | "PUT", url: string, body?: unknown, auth = token()) => {
    const res = await app.inject({
      method,
      url: `/api/v1${url}`,
      headers: auth ? { authorization: auth } : {},
      ...(body !== undefined ? { payload: body as object } : {}),
    });
    return {
      status: res.statusCode,
      body: res.body ? (res.json() as never) : (undefined as never),
      headers: res.headers,
    };
  };

  return {
    db,
    app,
    request,
    get: (url: string, auth?: string) => request("GET", url, undefined, auth),
    post: (url: string, body?: unknown, auth?: string) => request("POST", url, body, auth),
    put: (url: string, body?: unknown, auth?: string) => request("PUT", url, body, auth),
    async close() {
      await app.close();
      await db.drop();
    },
  };
}

// ------------------------------------------------------------------ the OpenAPI contract

const openapi = parse(readFileSync(designDir + "03-platform/openapi.yaml", "utf8"));
const ajv = new Ajv2020({ strict: false, allErrors: true });
ajv.addSchema(openapi, "openapi");

/** Asserts a response body matches a schema in design/03-platform/openapi.yaml. */
export function expectContract(body: unknown, pointer: string) {
  const validate = ajv.getSchema(`openapi#${pointer}`);
  if (!validate) throw new Error(`No schema at ${pointer}`);
  const ok = validate(body);
  expect(ok ? [] : validate.errors, `response matches ${pointer}`).toEqual([]);
}

export const schema = (name: string) => `/components/schemas/${name}`;
export const PROBLEM = "/components/responses/Problem/content/application~1problem+json/schema";
