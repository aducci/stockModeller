import { describe, expect, it } from "vitest";
import { ULID_PATTERN, ulid, ulidTime } from "../src";

describe("ulid", () => {
  it("makes 26-character Crockford ids that sort in creation order", () => {
    const ids = Array.from({ length: 1000 }, () => ulid());
    for (const id of ids) expect(id).toMatch(ULID_PATTERN);
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("encodes the time in the first 10 characters", () => {
    const before = Date.now();
    const time = ulidTime(ulid());
    expect(time).toBeGreaterThanOrEqual(before);
    expect(time).toBeLessThanOrEqual(Date.now());
  });
});
