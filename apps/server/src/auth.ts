// Who is calling. M0 has development sign-in only; OIDC arrives in M1 (design/03-platform/security.md).
import type { FastifyRequest } from "fastify";

export interface Principal {
  userId: string;
  workspaceId: string;
}

export type Authenticate = (request: FastifyRequest) => Principal | null;

const DEV_TOKEN = /^Bearer dev:([A-Za-z0-9_-]{1,64}):([A-Za-z0-9_@.-]{1,128})$/;

/** Accepts `Authorization: Bearer dev:<workspaceId>:<userId>`. For local development and tests only. */
export const devAuthenticate: Authenticate = (request) => {
  const match = DEV_TOKEN.exec(request.headers.authorization ?? "");
  return match ? { workspaceId: match[1]!, userId: match[2]! } : null;
};

/** Refuses everyone: the default until a real sign-in method is configured. */
export const noAuthenticate: Authenticate = () => null;
