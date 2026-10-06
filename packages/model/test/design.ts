// Helpers for tests that check code against the design pack (the source of truth).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const designDir = fileURLToPath(new URL("../../../design/", import.meta.url));

export function readDesign(path: string): string {
  return readFileSync(designDir + path, "utf8");
}

export function readDesignJson<T = unknown>(path: string): T {
  return JSON.parse(readDesign(path)) as T;
}
