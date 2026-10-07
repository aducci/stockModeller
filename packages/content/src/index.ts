// Ready-made packages: frameworks are content, not code (ADR-009).
import type { DiagramType, MetamodelPackage } from "@connectome/model";
import essentialsJson from "../essentials/metamodel.json" with { type: "json" };
import applicationLandscapeJson from "../essentials/application-landscape.diagram-type.json" with { type: "json" };
import capabilityMatrixJson from "../essentials/capability-matrix.diagram-type.json" with { type: "json" };

export interface ContentPackage {
  metamodel: MetamodelPackage;
  diagramTypes: DiagramType[];
}

/** The Essentials package (design/05-structures/example-metamodel.json, example-diagram-type.json and example-matrix-type.json). */
export const essentials: ContentPackage = {
  metamodel: essentialsJson as MetamodelPackage,
  diagramTypes: [applicationLandscapeJson as DiagramType, capabilityMatrixJson as DiagramType],
};

export { insuranceGroup } from "./examples";
