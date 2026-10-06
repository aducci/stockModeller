import { describe, expect, it } from "vitest";
import { essentials } from "@connectome/content";
import { Metamodel, type DiagramRow, type ObjectRow } from "@connectome/engine";
import { cardRows, fitText, renditionFor, renditionSize, stepZoom } from "../src/diagram";

const metamodel = Metamodel.compile(essentials.metamodel, essentials.diagramTypes);
const landscape = { diagramType: essentials.diagramTypes[0]!.key } as DiagramRow;

function withRenditions(renditions: object) {
  const dt = { ...essentials.diagramTypes[0]!, key: "custom", renditions };
  return {
    metamodel: Metamodel.compile(essentials.metamodel, [...essentials.diagramTypes, dt]),
    diagram: { diagramType: "custom" } as DiagramRow,
  };
}

describe("renditionFor", () => {
  it("draws a box unless something says otherwise", () => {
    expect(renditionFor(metamodel, landscape, {})).toMatchObject({ key: "box", form: "box" });
  });

  it("uses the occurrence's own rendition", () => {
    expect(renditionFor(metamodel, landscape, { rendition: "card" })).toMatchObject({ key: "card", rows: 3 });
  });

  it("falls back to the diagram type's default", () => {
    const { metamodel: mm, diagram } = withRenditions({ default: "chip" });
    expect(renditionFor(mm, diagram, {}).key).toBe("chip");
    expect(renditionFor(mm, diagram, { rendition: "card" }).key).toBe("card");
  });

  it("switches to the glyph below 40% unless the diagram type sets its own levels", () => {
    expect(renditionFor(metamodel, landscape, { rendition: "card" }, 0.39).key).toBe("glyph");
    expect(renditionFor(metamodel, landscape, { rendition: "card" }, 0.4).key).toBe("card");
    const { metamodel: mm, diagram } = withRenditions({
      semanticZoom: [
        { below: 0.3, rendition: "glyph" },
        { below: 0.6, rendition: "chip" },
      ],
    });
    expect(renditionFor(mm, diagram, {}, 0.5).key).toBe("chip");
    expect(renditionFor(mm, diagram, {}, 0.25).key).toBe("glyph");
    expect(renditionFor(mm, diagram, {}, 0.35).key).toBe("chip");
  });

  it("ignores an unknown rendition", () => {
    expect(renditionFor(metamodel, landscape, { rendition: "hologram" }).key).toBe("box");
  });
});

describe("renditionSize", () => {
  it("is the rendition's own size, or the type's for a box", () => {
    expect(renditionSize({ form: "card", width: 180, height: 96 }, { width: 120, height: 48 })).toEqual({
      w: 180,
      h: 96,
    });
    expect(renditionSize({ form: "box" }, { width: 140, height: 56 })).toEqual({ w: 140, h: 56 });
  });
});

describe("stepZoom", () => {
  it("steps through the zoom levels and stops at the ends", () => {
    expect(stepZoom(1, 1)).toBe(1.25);
    expect(stepZoom(1, -1)).toBe(0.8);
    expect(stepZoom(0.9, -1)).toBe(0.8);
    expect(stepZoom(2, 1)).toBe(2);
    expect(stepZoom(0.25, -1)).toBe(0.25);
  });
});

describe("cardRows", () => {
  const object = (properties: Record<string, unknown>) =>
    ({ id: "o", type: "application", name: "CRM", properties }) as unknown as ObjectRow;

  it("shows set values in the type's order, list values by label with their colour", () => {
    const rows = cardRows(metamodel, object({ "lifecycle.status": "active", "technical.hosting": "AWS" }), 3);
    const status = metamodel.valueList("lifecycleStatus")!.values.find((v) => v.key === "active")!;
    expect(rows).toContainEqual({ label: expect.any(String), text: status.label, colour: status.color });
    expect(rows.map((r) => r.text)).toContain("AWS");
  });

  it("leaves out empty values and stops at the row limit", () => {
    expect(cardRows(metamodel, object({ "technical.hosting": "" }), 3)).toEqual([]);
    const many = object({
      "lifecycle.status": "active",
      "technical.hosting": "AWS",
      "ownership.businessOwner": "Dana",
    });
    expect(cardRows(metamodel, many, 2)).toHaveLength(2);
  });
});

describe("fitText", () => {
  it("shortens long text with an ellipsis", () => {
    expect(fitText("Claims", 100)).toBe("Claims");
    expect(fitText("Claims Management Platform", 66)).toBe("Claims Ma…");
  });
});
