import { describe, expect, it } from "vitest";
import { essentials } from "@connectome/content";
import { Metamodel } from "@connectome/engine";
import { GLYPHS, GLYPH_MAX_BYTES, SEMANTIC_CATEGORIES, SEMANTIC_KINDS } from "@connectome/model";
import { lineFor, notationFor } from "../src/notation";

const metamodel = Metamodel.compile(essentials.metamodel, essentials.diagramTypes);

describe("glyphs", () => {
  it("are stroke-only paths that fit the budget", () => {
    for (const [key, d] of Object.entries(GLYPHS)) {
      expect(d.length, key).toBeLessThanOrEqual(GLYPH_MAX_BYTES);
      expect(d, key).toMatch(/^[MmLlHhVvCcSsQqTtAaZz0-9 .,-]+$/);
      expect(d.startsWith("M"), key).toBe(true);
    }
  });

  it("cover every semantic category", () => {
    for (const category of SEMANTIC_CATEGORIES) {
      const { glyph } = notationFor({ category } as never);
      expect(GLYPHS[glyph], category).toBeDefined();
    }
  });
});

describe("notationFor", () => {
  it("takes the glyph and hue from the object type's category", () => {
    expect(notationFor(metamodel.objectType("capability"))).toMatchObject({ glyph: "capability", hue: "sand" });
    expect(notationFor(metamodel.objectType("dataObject"))).toMatchObject({ glyph: "information", hue: "teal" });
  });

  it("lets a type's own icon win, including Essentials' older names", () => {
    // Essentials gives saasApplication icon "cloud" and organisationUnit "people".
    expect(notationFor(metamodel.objectType("saasApplication")).glyph).toBe("cloud");
    expect(notationFor(metamodel.objectType("organisationUnit")).glyph).toBe("actor");
  });

  it("falls back to the 'other' category for an unknown type", () => {
    expect(notationFor(undefined)).toMatchObject({ glyph: "other", hue: "slate" });
  });

  it("uses the type's own colours when it has them, else the hue", () => {
    expect(notationFor(metamodel.objectType("capability")).fill).toBe(
      metamodel.objectType("capability")!.symbol.fill ?? "var(--sand-fill)",
    );
    expect(notationFor(undefined).fill).toBe("var(--slate-fill)");
  });
});

describe("lineFor", () => {
  it("draws every kind's default", () => {
    for (const { kind } of SEMANTIC_KINDS) expect(kind).toBeTruthy();
    // Essentials gives no type its own line, so every one of them draws its kind's notation.
    expect(lineFor(metamodel, "realizes")).toMatchObject({ style: "dashed", end: "triangleOpen", dash: "6 4" });
    expect(lineFor(metamodel, "flowsTo")).toMatchObject({ style: "dashed", end: "arrow" });
    expect(lineFor(metamodel, "specialises")).toMatchObject({ style: "solid", end: "triangleOpen" });
    expect(lineFor(metamodel, "groups")).toMatchObject({ start: "diamondOpen", end: "none" });
    expect(lineFor(metamodel, "accesses")).toMatchObject({ style: "dotted", end: "arrowSmall", dash: "1.5 3" });
    expect(lineFor(metamodel, "calls")).toMatchObject({ width: 3, mid: "interaction" });
    expect(lineFor(metamodel, "contains")).toMatchObject({ start: "dot", end: "none" });
  });

  it("treats an unknown or missing type as an association", () => {
    expect(lineFor(metamodel, undefined)).toMatchObject({ style: "solid", start: "none", end: "none" });
    expect(lineFor(metamodel, "nope")).toMatchObject({ style: "solid" });
  });

  it("gives a solid line no dash array", () => {
    expect(lineFor(metamodel, "serves").dash).toBeUndefined();
  });
});
