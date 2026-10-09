// The document projection (views-and-design-artifacts.md §7–§8) with the Essentials High-level design template.
import { describe, expect, it } from "vitest";
import { essentials, insuranceGroup } from "@connectome/content";
import { applyChange, Metamodel, ModelState } from "@connectome/engine";
import type { Edit } from "@connectome/model";
import {
  proseFromMarkup,
  proseToMarkup,
  projectDocument,
  stateAt,
  tableAddOptions,
  withStateAt,
  type FactsModel,
  type RegisterModel,
  type RelationTableModel,
  type RepeaterModel,
} from "../src";

const metamodel = Metamodel.compile(essentials.metamodel, essentials.diagramTypes);
const hld = metamodel.diagramType("hld")!.definition;
const spec = metamodel.diagramType("integrationSpec")!.definition;
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
    expect(doc.sections.map((s) => s.definition.key)).toEqual([
      "summary",
      "facts",
      "context",
      "integrations",
      "raid",
      "risks",
    ]);
    expect(doc.findings).toEqual(["Summary is empty", "Context: no diagram yet", "Information flows: none yet"]);
    expect([doc.complete, doc.total]).toEqual([3, 6]);
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
    // Legacy CRM flows to Claims Manager in the model but not on the context. Claims Manager calls Payments API is
    // not missing: the conceptual flow to Payments Hub, which realises Payments API, stands for it (DOC-2).
    expect(t.missing.map((r) => r.id)).toEqual(["R-09"]);
    expect(t.findings).toEqual(["Information flows: 1 relationship is not on the context"]);
    const ignored = table(
      projectDocument(state, metamodel, hld, { ...definition, integrations: { ignored: ["R-09"] } }),
    );
    expect(ignored.missing).toEqual([]);
  });

  it("mark rows without their required columns as to describe", () => {
    const state = withContext();
    apply(state, [
      {
        edit: "setRelationshipProperties",
        id: "R-08",
        baseVersion: state.relationships.get("R-08")!.version,
        set: { "flow.protocol": null },
      },
    ]);
    const t = table(projectDocument(state, metamodel, hld, { subject: "O-APP-1", context: { diagramId: "D-CTX" } }));
    expect(t.rows[0]!.toDescribe).toEqual(["Protocol"]);
    expect(t.findings[0]).toBe("Information flows: Payments Hub has no protocol");
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

describe("what authors change (§8.2)", () => {
  const context = { subject: "O-APP-1", context: { diagramId: "D-CTX" } };

  it("hide sections and columns, add facts and columns, only where the lock allows", () => {
    const state = withContext();
    const doc = projectDocument(state, metamodel, hld, {
      ...context,
      layout: {
        sections: {
          // Risks allows hiding; Summary is fixed and required, so these are ignored.
          risks: { hidden: true },
          summary: { hidden: true, title: "Overview" },
          facts: { properties: ["technical.hosting", "nope.nope"] },
          integrations: { hiddenColumns: ["interaction.pattern", "protocol"], columns: ["flow.frequency"] },
        },
      },
    });
    const by = (key: string) => doc.sections.find((s) => s.definition.key === key)!;
    expect(by("risks").hidden).toBe(true);
    expect(by("summary")).toMatchObject({ hidden: false, title: "Summary", may: { hide: false, rename: false } });
    expect([doc.complete, doc.total]).toEqual([3, 5]);
    const facts = by("facts") as FactsModel & { findings: string[] };
    expect(facts.facts.map((f) => f.key)).toContain("technical.hosting");
    expect(facts.addable).not.toContain("technical.hosting");
    // A required column cannot be hidden.
    const t = table(doc);
    expect(t.columns.map((c) => c.key)).toEqual(["direction", "protocol", "payload", "flow.frequency"]);
    expect(t.hiddenColumns.map((c) => c.key)).toEqual(["interaction.pattern"]);
    expect(t.rows[0]!.cells["flow.frequency"]!.applicable).toBe(true);
  });

  it("add sections in a region from its palette, and report the ones that do not fit", () => {
    const doc = projectDocument(withContext(), metamodel, hld, {
      ...context,
      layout: {
        regions: {
          additional: [
            { key: "additional1", title: "Security", component: "prose" },
            { key: "additional2", title: "Bad", component: "facts", config: { properties: ["nope"] } },
            { key: "summary", title: "Clash", component: "prose" },
          ],
        },
      },
      additional1: { paragraphs: [["Single sign-on."]] },
    });
    const region = doc.blocks.find((b) => b.kind === "region");
    expect(region?.kind === "region" && region.region.sections.map((s) => [s.title, s.may.hide, s.may.rename])).toEqual(
      [["Security", true, true]],
    );
    expect(doc.sections.map((s) => s.definition.key)).toContain("additional1");
    expect(doc.findings).toEqual(
      expect.arrayContaining([
        'Additional sections, section "Bad" uses unknown property "nope"',
        'Additional sections, section "Clash" cannot be added here',
      ]),
    );
  });

  it("repeat a block per table row, with the row's facts, sequence and prose", () => {
    const state = withContext();
    const definition = {
      ...context,
      details: { rows: { "R-08": { errors: { paragraphs: [["Retry three times."]] } } } },
    };
    const doc = projectDocument(state, metamodel, spec, definition);
    const details = doc.sections.find((s) => s.definition.key === "details") as RepeaterModel & {
      findings: string[];
    };
    expect(details.rows.map((r) => r.counterpart?.name)).toEqual(["Payments Hub"]);
    const [facts, sequence, errors] = details.rows[0]!.sections;
    expect(facts).toMatchObject({ component: "facts", target: { kind: "relationship" } });
    expect((facts as FactsModel).facts.map((f) => f.key)).toEqual(["flow.protocol", "flow.frequency"]);
    // R-08 is a flow, not an interaction: no sequence.
    expect(sequence).toMatchObject({ component: "sequenceLink", interaction: null });
    expect(errors).toMatchObject({ component: "prose", empty: false, path: ["details", "rows", "R-08", "errors"] });
    expect(details.findings).toEqual([]);
    const empty = projectDocument(state, metamodel, spec, context).sections.find((s) => s.definition.key === "details");
    expect(empty?.findings).toEqual(["Integration details, Payments Hub: Error handling is empty"]);
  });

  it("in the example repository, the high-level design and the integration specification are complete", () => {
    const state = exampleState();
    const document = (id: string) => {
      const d = state.diagrams.get(id)!;
      return projectDocument(state, metamodel, metamodel.diagramType(d.diagramType)!.definition, d.definition ?? {});
    };
    const design = document("D-04");
    expect(design.findings).toEqual([]);
    expect(table(design).rows.map((r) => [r.counterpart?.name, r.sequence?.name ?? null])).toEqual([
      ["Legacy CRM", null],
      ["Payments API", "Pay a claim"],
      ["Payments Hub", null],
    ]);
    const specification = document("D-07");
    expect(specification.findings).toEqual([]);
    const details = specification.sections.find((s) => s.definition.key === "details") as RepeaterModel;
    expect(details.rows[0]!.sections[1]).toMatchObject({ component: "sequenceLink", diagram: { id: "D-05" } });
  });

  it("write a row's state through its repeater's key", () => {
    const definition = { details: { rows: { "R-1": { errors: { paragraphs: [] } } }, other: 1 } };
    const path = ["details", "rows", "R-2", "notes"];
    const { key, value } = withStateAt(definition, path, { paragraphs: [["x"]] });
    expect(key).toBe("details");
    expect(stateAt({ details: value }, path)).toEqual({ paragraphs: [["x"]] });
    expect(stateAt({ details: value }, ["details", "rows", "R-1", "errors"])).toEqual({ paragraphs: [] });
    expect(withStateAt(definition, ["summary"], null)).toEqual({ key: "summary", value: null });
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

describe("information flows (DOC-2)", () => {
  it("list under each connection what it stands for: listed flows, and those its ends' scopes imply", () => {
    const state = withContext();
    const t = table(projectDocument(state, metamodel, hld, { subject: "O-APP-1", context: { diagramId: "D-CTX" } }));
    const row = t.rows[0]!;
    // Claims Manager → Payments Hub is conceptual; Claims Manager calls Payments API (logical), which Payments Hub
    // realises, so the call and the Pay a claim function it lists come under the row with nothing linked by hand.
    expect(row.implied!.map((i) => [i.relationship.id, i.via.map((r) => r.id)])).toEqual([["R-16", ["R-15"]]]);
    expect(row.flows!.map((f) => [f.object.name, f.implied, f.through?.id, f.sequence?.id])).toEqual([
      ["Pay a claim", true, "R-16", "D-05"],
    ]);
  });

  it("leave out an implied flow the connection excludes, and list the ones it names", () => {
    const state = withContext();
    const r08 = () => state.relationships.get("R-08")!;
    apply(state, [
      { edit: "createObject", id: "F-NEW", type: "informationFlow", name: "Payment status", folderId: "F04" },
      {
        edit: "setRelationshipProperties",
        id: "R-08",
        baseVersion: r08().version,
        set: { "integration.informationFlows": ["F-NEW"], "integration.excludedFlows": ["O-FN-1"] },
      },
    ]);
    const t = table(projectDocument(state, metamodel, hld, { subject: "O-APP-1", context: { diagramId: "D-CTX" } }));
    expect(t.rows[0]!.flows!.map((f) => [f.object.name, f.implied, f.sequence])).toEqual([
      ["Payment status", false, undefined],
    ]);
  });
});

describe("the RAID register (slice DOC-3)", () => {
  const register = (doc: ReturnType<typeof projectDocument>) =>
    doc.sections.find((s) => s.definition.key === "raid") as RegisterModel & { findings: string[] };
  const exampleDesign = (state: ModelState) =>
    projectDocument(state, metamodel, hld, state.diagrams.get("D-04")!.definition ?? {});

  it("gathers the items mentioned, about the subject and about what the document shows, by type", () => {
    const state = exampleState();
    const raid = register(exampleDesign(state));
    expect(raid.groups.map((g) => [g.name, g.rows.map((r) => [r.object.name, r.reasons])])).toEqual([
      ["Risks", [["Nightly SFTP feed has no retry", ["mentioned", "about Legacy CRM"]]]],
      ["Issues", [["Payment confirmations as events or polling", ["about Claims Manager"]]]],
      ["Dependencies", [["Payments Hub publishes payment events", ["mentioned", "about Payments Hub"]]]],
    ]);
    const risk = raid.groups[0]!.rows[0]!;
    expect(risk.cells["raid.impact"]).toMatchObject({ value: "medium", applicable: true });
    // An issue has no impact.
    expect(raid.groups[1]!.rows[0]!.cells["raid.impact"]!.applicable).toBe(false);
    expect(raid.findings).toEqual([]);
  });

  it("asks open items for an owner, and leaves out closed ones and what the document does not show", () => {
    const state = exampleState();
    apply(state, [
      {
        edit: "createObject",
        id: "O-R2",
        type: "risk",
        name: "Vendor lock-in",
        folderId: "F10",
        properties: { "raid.status": "open" },
      },
      { edit: "createRelationship", id: "R-R2", type: "concerns", sourceId: "O-R2", targetId: "O-APP-1" },
      {
        edit: "createObject",
        id: "O-R3",
        type: "risk",
        name: "Old risk",
        folderId: "F10",
        properties: { "raid.status": "closed" },
      },
      { edit: "createRelationship", id: "R-R3", type: "concerns", sourceId: "O-R3", targetId: "O-APP-1" },
      // About an element the design does not show: not listed.
      { edit: "createObject", id: "O-R4", type: "risk", name: "Elsewhere", folderId: "F10" },
      { edit: "createRelationship", id: "R-R4", type: "concerns", sourceId: "O-R4", targetId: "O-SRV-1" },
    ]);
    const raid = register(exampleDesign(state));
    expect(raid.count).toBe(5);
    expect(raid.findings).toEqual(["RAID: Vendor lock-in has no owner"]);
    expect(raid.groups[0]!.rows.find((r) => r.object.id === "O-R2")!.toFill).toEqual(["Owner"]);
  });
});
