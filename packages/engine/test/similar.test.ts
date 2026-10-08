// Finding similar objects (design/02-model/duplicates-and-identity.md §6).
import { describe, expect, it } from "vitest";
import { findSimilarObjects, kinshipOf, nameSimilarity, normaliseName } from "../src";
import { applyOk, exampleState, metamodel } from "./fixtures";

describe("normaliseName", () => {
  it("folds case, accents and separators but keeps symbols that change meaning", () => {
    expect(normaliseName("  Claims-Manager_v2 ")).toBe("claims manager v2");
    expect(normaliseName("Café (Paris)")).toBe("cafe paris");
    expect(normaliseName("C++")).not.toBe(normaliseName("C"));
    expect(normaliseName("Ｃｌａｉｍｓ")).toBe("claims");
  });
});

describe("nameSimilarity", () => {
  it("scores the same name once normalised as 1", () => {
    expect(nameSimilarity("claims manager", "Claims-Manager")).toEqual({ score: 1, reason: "Same name" });
  });

  it("recognises reordered words, acronyms, prefixes and typos", () => {
    expect(nameSimilarity("Manager Claims", "Claims Manager").score).toBe(0.95);
    expect(nameSimilarity("CRM", "Customer Relationship Management")).toMatchObject({
      score: 0.85,
      reason: "CRM stands for Customer Relationship Management",
    });
    expect(nameSimilarity("Order to Cash", "OTC").score).toBe(0.85);
    expect(nameSimilarity("claims man", "Claims Manager").score).toBeGreaterThan(0.8);
    expect(nameSimilarity("cla man", "Claims Manager").reason).toBe("Matches its words");
    expect(nameSimilarity("Claims Manger", "Claims Manager").score).toBeGreaterThan(0.6);
  });

  it("keeps unrelated names apart", () => {
    expect(nameSimilarity("Payments Hub", "Claims Manager").score).toBeLessThan(0.3);
    expect(nameSimilarity("", "Claims Manager").score).toBe(0);
  });
});

describe("kinshipOf", () => {
  it("relates a type to itself, its parents, children and siblings", () => {
    expect(kinshipOf(metamodel, "application", "application")).toBe("same");
    expect(kinshipOf(metamodel, "application", "saasApplication")).toBe("family");
    expect(kinshipOf(metamodel, "saasApplication", "application")).toBe("family");
    expect(kinshipOf(metamodel, "application", "capability")).toBe("other");
  });
});

describe("findSimilarObjects", () => {
  it("puts an exact match of the same type first", () => {
    const state = exampleState();
    const found = findSimilarObjects(state, metamodel, { name: "claims-manager", type: "application" });
    expect(found[0]).toMatchObject({ exact: true, kinship: "same", score: 1 });
    expect(found[0]!.object.name).toBe("Claims Manager");
  });

  it("finds partial names while typing, ranking the same type above an equally good other type", () => {
    const state = exampleState();
    const found = findSimilarObjects(state, metamodel, { name: "claim", type: "capability" });
    expect(found.map((f) => f.object.name)).toContain("Claim Intake");
    expect(found[0]!.kinship).toBe("same");
    expect(found.every((f) => !f.exact)).toBe(true);
    // Unrelated types appear only when they are close.
    const strong = findSimilarObjects(state, metamodel, { name: "Claims Manager", type: "capability" });
    expect(strong[0]).toMatchObject({ kinship: "other", exact: false, score: 1 });
  });

  it("shows related types as family and hides weak matches of unrelated types", () => {
    const state = exampleState();
    applyOk(state, [{ edit: "createObject", id: "N1", type: "saasApplication", name: "Claims Hub", folderId: "F04" }]);
    const found = findSimilarObjects(state, metamodel, { name: "Claims Hub", type: "application" });
    expect(found[0]).toMatchObject({ kinship: "family", exact: false, score: 1 });
    // "Claims Management" (a capability) is only a little like "Claims Hub": not suggested.
    expect(found.some((f) => f.object.name === "Claims Management")).toBe(false);
  });

  it("leaves out excluded and deleted objects", () => {
    const state = exampleState();
    const id = findSimilarObjects(state, metamodel, { name: "Payments Hub" })[0]!.object.id;
    expect(findSimilarObjects(state, metamodel, { name: "Payments Hub", exclude: new Set([id]) })).toEqual([]);
  });
});
