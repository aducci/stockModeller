import { describe, expect, it } from "vitest";
import { validateDiagramType, validatePackage } from "@connectome/model";
import { essentials } from "../src";
import { readDesignJson } from "../../model/test/design";

describe("Essentials", () => {
  it("is the package from the design pack, unchanged", () => {
    expect(essentials.metamodel).toEqual(readDesignJson("05-structures/example-metamodel.json"));
    expect(essentials.diagramTypes).toEqual([
      readDesignJson("05-structures/example-diagram-type.json"),
      readDesignJson("05-structures/example-matrix-type.json"),
      readDesignJson("05-structures/example-context-type.json"),
      readDesignJson("05-structures/example-sequence-type.json"),
      readDesignJson("05-structures/example-hld-type.json"),
    ]);
  });

  it("is valid against the schemas", () => {
    expect(validatePackage(essentials.metamodel).ok).toBe(true);
    for (const t of essentials.diagramTypes) expect(validateDiagramType(t).ok).toBe(true);
  });
});

describe("example repository", () => {
  it("is the design pack's example, unchanged", async () => {
    const { insuranceGroup } = await import("../src");
    expect(insuranceGroup.data).toEqual(readDesignJson("05-structures/example-repository.json"));
  });
});
