// Ready-made packages: frameworks are content, not code (ADR-009).
import type { DiagramType, DocumentPattern, MetamodelPackage } from "@connectome/model";
import essentialsJson from "../essentials/metamodel.json" with { type: "json" };
import applicationLandscapeJson from "../essentials/application-landscape.diagram-type.json" with { type: "json" };
import capabilityMatrixJson from "../essentials/capability-matrix.diagram-type.json" with { type: "json" };
import contextJson from "../essentials/context.diagram-type.json" with { type: "json" };
import hldJson from "../essentials/hld.diagram-type.json" with { type: "json" };
import sequenceJson from "../essentials/sequence.diagram-type.json" with { type: "json" };
import integrationSpecJson from "../essentials/integration-spec.diagram-type.json" with { type: "json" };
import contextAndIntegrationsJson from "../essentials/context-and-integrations.pattern.json" with { type: "json" };

export interface ContentPackage {
  metamodel: MetamodelPackage;
  diagramTypes: DiagramType[];
}

/** The Essentials package (design/05-structures/example-metamodel.json, example-diagram-type.json, example-matrix-type.json,
 * example-context-type.json, example-sequence-type.json, example-hld-type.json and example-integration-spec-type.json),
 * with its document patterns (example-pattern.json). */
export const essentials: ContentPackage = {
  metamodel: {
    ...(essentialsJson as MetamodelPackage),
    documentPatterns: [contextAndIntegrationsJson as unknown as DocumentPattern],
  },
  diagramTypes: [
    applicationLandscapeJson as DiagramType,
    capabilityMatrixJson as DiagramType,
    contextJson as DiagramType,
    sequenceJson as DiagramType,
    hldJson as unknown as DiagramType,
    integrationSpecJson as unknown as DiagramType,
  ],
};

export { insuranceGroup } from "./examples";
