// Drill-down links (design/02-model/diagrams-and-catalogues.md §2): a symbol links to another diagram; deleting that
// diagram removes the link, and undoing the delete puts it back.
import { describe, expect, it } from "vitest";
import { invertLog } from "../src";
import { apply, applyOk, exampleState } from "./fixtures";

describe("drill-down", () => {
  it("links a symbol to another diagram and clears the link when that diagram is deleted", () => {
    const state = exampleState();
    const occ = [...state.objectOccurrences.live()][0]!;
    const target = { edit: "createDiagram" as const, id: "D-CHILD", name: "Child", diagramType: "", folderId: "" };
    const diagram = state.diagrams.get(occ.diagramId)!;
    applyOk(state, [{ ...target, diagramType: diagram.diagramType, folderId: diagram.folderId }]);
    const link = (drillDownDiagramId: string | null) => ({
      edit: "setDrillDown" as const,
      diagramId: occ.diagramId,
      occurrenceId: occ.id,
      drillDownDiagramId,
    });
    applyOk(state, [link("D-CHILD")]);
    expect(state.objectOccurrences.get(occ.id)?.drillDownDiagramId).toBe("D-CHILD");
    expect(apply(state, [link(occ.diagramId)])).toMatchObject({
      ok: false,
      reasons: [{ property: "drillDownDiagramId" }],
    });

    const deleted = applyOk(state, [{ edit: "deleteDiagram", id: "D-CHILD" }]);
    expect(state.objectOccurrences.get(occ.id)?.drillDownDiagramId).toBeNull();
    applyOk(state, invertLog(deleted.log));
    expect(state.objectOccurrences.get(occ.id)?.drillDownDiagramId).toBe("D-CHILD");
  });
});
