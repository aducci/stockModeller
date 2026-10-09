// The design pack's example repository (design/05-structures/example-repository.json) as changes,
// so it can seed a development database and serve as a test fixture.
import { parseChange, type Change, type Id, type ScenarioState } from "@connectome/model";
import exampleJson from "../examples/insurance-group.repository.json" with { type: "json" };

interface ExampleRepository {
  repository: { id: Id; name: string; settings: { currency: string } };
  scenarios: { id: Id; parentId: Id | null; name: string; state: ScenarioState }[];
  folders: { id: Id; parentId: Id | null; name: string }[];
  objects: Record<string, unknown>[];
  relationships: Record<string, unknown>[];
  /** Links from elements (slice DOC-R2, views-and-design-artifacts.md §13), created after the views they point at. */
  links: Record<string, unknown>[];
  scenarioChanges: Record<Id, Record<string, unknown>[]>;
  diagrams: {
    id: Id;
    name: string;
    diagramType: string;
    folderId: Id;
    /** A view's definition (views-and-design-artifacts.md): a document's subject and sections, a matrix's axes. */
    definition?: Record<string, unknown>;
    objectOccurrences: Record<string, unknown>[];
    relationshipOccurrences: Record<string, unknown>[];
    annotations: Record<string, unknown>[];
  }[];
}

const example = exampleJson as unknown as ExampleRepository;

const baselineScenario = example.scenarios.find((s) => s.parentId === null)!;
const targetScenario = example.scenarios.find((s) => s.parentId !== null)!;

export const insuranceGroup = {
  /** The raw example, as in the design pack. */
  data: example,
  repository: example.repository,
  baselineScenarioId: baselineScenario.id,
  targetScenario,

  /** The baseline as one change: folders, objects, relationships, the views with their occurrences, then links. */
  baselineChange(changeId: Id = "C-EXAMPLE"): Change {
    const edits: unknown[] = [
      ...example.folders.map((f) => ({ edit: "createFolder", ...f })),
      ...example.objects.map((o) => ({ edit: "createObject", ...o })),
      ...example.relationships.map((r) => ({ edit: "createRelationship", ...r })),
    ];
    for (const d of example.diagrams) {
      const { id, name, diagramType, folderId, definition } = d;
      edits.push({ edit: "createDiagram", id, name, diagramType, folderId, ...(definition ? { definition } : {}) });
      for (const occurrence of d.objectOccurrences)
        edits.push({ edit: "addObjectOccurrence", diagramId: d.id, occurrence });
      for (const occurrence of d.relationshipOccurrences) {
        edits.push({ edit: "addRelationshipOccurrence", diagramId: d.id, occurrence });
      }
      for (const annotation of d.annotations) edits.push({ edit: "addAnnotation", diagramId: d.id, annotation });
    }
    for (const link of example.links) edits.push({ edit: "createLink", ...link });
    return parseChange({ id: changeId, scenarioId: baselineScenario.id, label: "Load example repository", edits });
  },

  /**
   * The Target 2027 scenario's own edits. The example omits base versions (design decision-log B7), so they
   * are filled in from `versionOf`, which gives the current version of an object or relationship.
   */
  scenarioChange(versionOf: (id: Id) => number | undefined, changeId: Id = "C-TARGET-2027"): Change {
    const edits = example.scenarioChanges[targetScenario.id]!.map((e) => {
      const version = versionOf(e.id as Id);
      return "baseVersion" in e || version === undefined || String(e.edit).startsWith("create")
        ? e
        : { ...e, baseVersion: version };
    });
    return parseChange({ id: changeId, scenarioId: targetScenario.id, label: "Target 2027", edits });
  },
};
