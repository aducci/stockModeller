// The document projection (views-and-design-artifacts.md §7–§8) with the Essentials High-level design template.
import { describe, expect, it } from "vitest";
import { essentials, insuranceGroup } from "@connectome/content";
import { applyChange, Metamodel, ModelState } from "@connectome/engine";
import type { Edit } from "@connectome/model";
import { proseFromMarkup, proseToMarkup, projectDocument, tableAddOptions, type RelationTableModel } from "../src";

const metamodel = Metamodel.compile(essentials.metamodel, essentials.diagramTypes);
const hld = metamodel.diagramType("hld")!.definition;
let n = 0;

function exampleState() {
  const state = new ModelState();
  apply(state, insuranceGroup.baselineChange().edits);
  return state;
}

function apply(state: ModelState, edits: Edit[]) {
  const change = { id: `C-${++n}`, scenarioId: insuranceGroup.baselineScenarioId, label: "test", edits };
  const result = applyChange(state, change, {
    metamodel,
    actor: { kind: "user", id: "U-DANA" },
    scenario: { id: insuranceGroup.baselineScenarioId, isBaseline: true },
    now: "2026-10-07T12:00:00.000Z",
  });
  if (!result.ok) throw new Error(JSON.stringify(result.reasons));
}

const place = (id: string, objectId: string) => ({
  id,
  objectId,
  parentOccurrenceId: null,
  x: 0,
  y: 0,
  w: 100,
  h: 40,
  z: 0,
  style: {},
  drillDownDiagramId: null,
  pinned: false,
});

/** Claims Manager's context: itself and Payments Hub, with the flow between them drawn. */
function withContext() {
  const state = exampleState();
  apply(state, [
    { edit: "createDiagram", id: "D-CTX", name: "Context", diagramType: "context", folderId: "F06" },
    { edit: "addObjectOccurrence", diagramId: "D-CTX", occurrence: place("OC-1", "O-APP-1") },
    { edit: "addObjectOccurrence", diagramId: "D-CTX", occurrence: place("OC-2", "O-APP-3") },
    {
      edit: "addRelationshipOccurrence",
      diagramId: "D-CTX",
      occurrence: {
        id: "RO-X",
        relationshipId: "R-08",
        sourceOccurrenceId: "OC-1",
        targetOccurrenceId: "OC-2",
        shownAs: "line",
        route: { mode: "auto" },
        labelPosition: 0.5,
        style: {},
      },
    },
  ]);
  return state;
}

const table = (doc: ReturnType<typeof projectDocument>) =>
  doc.sections.find((s) => s.definition.key === "integrations") as RelationTableModel & { findings: string[] };

describe("documents", () => {
  it("without a subject or content, list what is missing", () => {
    const doc = projectDocument(exampleState(), metamodel, hld, {});
    expect(doc.sections.map((s) => s.definition.key)).toEqual(["summary", "facts", "context", "integrations", "risks"]);
    expect(doc.findings).toEqual(["Summary is empty", "Context: no diagram yet", "Integrations: none yet"]);
    expect([doc.complete, doc.total]).toEqual([2, 5]);
  });

  it("show the subject's facts that its type has", () => {
    const doc = projectDocument(exampleState(), metamodel, hld, { subject: "O-APP-1" });
    const facts = doc.sections.find((s) => s.component === "facts");
    expect(facts?.component === "facts" && facts.facts.map((f) => f.key)).toEqual([
      "lifecycle.status",
      "ownership.businessOwner",
      "ownership.technicalOwner",
      "assessment.criticality",
      "cost.runCost",
    ]);
  });

  it("take a table's rows from the linked diagram's connectors, and warn about the rest", () => {
    const state = withContext();
    const definition = { subject: "O-APP-1", context: { diagramId: "D-CTX" } };
    const t = table(projectDocument(state, metamodel, hld, definition));
    expect(t.rows.map((r) => [r.counterpart?.name, r.direction, r.cells.protocol!.value])).toEqual([
      ["Payments Hub", "out", "REST"],
    ]);
    // A flow has no interaction pattern: not applicable, so not required either.
    expect(t.rows[0]!.cells["interaction.pattern"]!.applicable).toBe(false);
    // Legacy CRM flows to Claims Manager in the model, but is not on the context.
    expect(t.missing.map((r) => r.id)).toEqual(["R-09"]);
    expect(t.findings).toEqual(["Integrations: 1 relationship is not on the context"]);
    const ignored = table(
      projectDocument(state, metamodel, hld, { ...definition, integrations: { ignored: ["R-09"] } }),
    );
    expect(ignored.missing).toEqual([]);
  });

  it("mark rows without their required columns as to describe", () => {
    const state = withContext();
    apply(state, [
      {
        edit: "setProperties",
        id: "R-08",
        baseVersion: state.relationships.get("R-08")!.version,
        set: { "flow.protocol": null },
      },
    ]);
    const t = table(projectDocument(state, metamodel, hld, { subject: "O-APP-1", context: { diagramId: "D-CTX" } }));
    expect(t.rows[0]!.toDescribe).toEqual(["Protocol"]);
    expect(t.findings[0]).toBe("Integrations: Payments Hub has no protocol");
  });

  it("say when the linked diagram was deleted", () => {
    const state = withContext();
    apply(state, [{ edit: "deleteDiagram", id: "D-CTX" }]);
    const doc = projectDocument(state, metamodel, hld, { subject: "O-APP-1", context: { diagramId: "D-CTX" } });
    expect(doc.findings).toContain("Context: the linked diagram was deleted");
  });

  it("offer the flow and interaction types the rules allow, either way round", () => {
    const state = exampleState();
    const config = table(projectDocument(state, metamodel, hld, {})).config;
    const options = tableAddOptions(metamodel, config, state.objects.get("O-APP-1")!, state.objects.get("O-APP-2")!);
    expect(options.map((o) => `${o.sourceId} ${o.type} ${o.targetId}`)).toEqual(
      expect.arrayContaining(["O-APP-1 flowsTo O-APP-2", "O-APP-2 flowsTo O-APP-1"]),
    );
    expect(options.every((o) => ["flowsTo", "calls"].includes(o.type))).toBe(true);
  });
});

describe("prose", () => {
  it("round-trips through the text an author edits, mentions by id", () => {
    const prose = proseFromMarkup("Replaces @[Legacy CRM](O-APP-2) for intake.\n\nThen @[x](O-APP-3)");
    expect(prose).toEqual({
      paragraphs: [
        ["Replaces ", { mention: "O-APP-2" }, " for intake."],
        ["Then ", { mention: "O-APP-3" }],
      ],
    });
    expect(proseToMarkup(prose, (id) => (id === "O-APP-3" ? "Payments Hub" : "Legacy CRM"))).toBe(
      "Replaces @[Legacy CRM](O-APP-2) for intake.\n\nThen @[Payments Hub](O-APP-3)",
    );
  });
});
