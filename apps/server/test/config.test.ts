import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import { devAuthenticate, loadConfig } from "../src";

describe("configuration", () => {
  it("requires a database URL", () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });

  it("never allows development sign-in in production", () => {
    expect(() =>
      loadConfig({ DATABASE_URL: "postgres://x", CONNECTOME_DEV_AUTH: "1", NODE_ENV: "production" }),
    ).toThrow();
    expect(loadConfig({ DATABASE_URL: "postgres://x", CONNECTOME_DEV_AUTH: "1" }).devAuth).toBe(true);
    expect(loadConfig({ DATABASE_URL: "postgres://x" })).toMatchObject({ devAuth: false, port: 3000 });
  });
});

describe("development sign-in", () => {
  it("reads the workspace and user from a dev token, and nothing else", async () => {
    const app = Fastify();
    app.get("/", async (req) => devAuthenticate(req));
    const call = async (authorization?: string) =>
      (await app.inject({ method: "GET", url: "/", headers: authorization ? { authorization } : {} })).body;
    expect(JSON.parse(await call("Bearer dev:W1:dana@example.com"))).toEqual({
      workspaceId: "W1",
      userId: "dana@example.com",
    });
    expect(await call("Bearer something-else")).toBe("null");
    expect(await call("Bearer dev:W1:dana:extra")).toBe("null");
    expect(await call()).toBe("null");
  });
});
