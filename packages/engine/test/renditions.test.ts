// Renditions (design/02-model/notation-and-metamodel-admin.md §4): an occurrence's rendition is part of its style,
// and a diagram type may name a default and semantic zoom levels.
import { describe, expect, it } from "vitest";
import { essentials } from "@connectome/content";
import { Metamodel, MetamodelError } from "../src";
import { apply, applyOk, exampleState } from "./fixtures";

describe("renditions", () => {
  it("are set and cleared on an occurrence's style", () => {
    const state = exampleState();
    const occ = [...state.objectOccurrences.live()][0]!;
    const style = (rendition: string | null) => ({
      edit: "styleOccurrence" as const,
      diagramId: occ.diagramId,
      occurrenceId: occ.id,
      style: { rendition },
    });
    applyOk(state, [style("card")]);
    expect(state.objectOccurrences.get(occ.id)?.style.rendition).toBe("card");
    applyOk(state, [style(null)]);
    expect(state.objectOccurrences.get(occ.id)?.style.rendition).toBeUndefined();
    expect(apply(state, [style("hologram")])).toMatchObject({
      ok: false,
      reasons: [{ code: "invalid", property: "style.rendition" }],
    });
  });

  it("must be known when a diagram type names them", () => {
    const [dt] = essentials.diagramTypes;
    const compile = (renditions: object) =>
      Metamodel.compile(essentials.metamodel, [{ ...dt!, renditions } as typeof dt & object]);
    expect(() => compile({ default: "card", semanticZoom: [{ below: 0.4, rendition: "chip" }] })).not.toThrow();
    expect(() => compile({ semanticZoom: [{ below: 0.4, rendition: "blob" }] })).toThrow(MetamodelError);
  });
});
