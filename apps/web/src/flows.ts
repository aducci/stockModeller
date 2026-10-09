// What a connection stands for, edited from a document's table (design/02-model/views-and-design-artifacts.md §12,
// slice DOC-2): the elements in its reference property, the implied ones it leaves out, and a sequence about each.
// Each gesture is one change. Pure.
import type { DiagramRow, Metamodel, ModelState, ObjectRow, RelationshipRow } from "@connectome/engine";
import { ulid, type Edit, type Id, type PropertyKey, type TypeKey } from "@connectome/model";
import { refsOf } from "@connectome/semantics";
import { defaultFolderFor } from "./diagram";
import { newSequenceEdits } from "./sequence";
import { aboutEdits } from "./subjects";

type Plan = { label: string; edits: Edit[] };

const setRefs = (relationship: RelationshipRow, property: PropertyKey, ids: Id[]): Edit => ({
  edit: "setRelationshipProperties",
  id: relationship.id,
  baseVersion: relationship.version,
  set: { [property]: ids.length > 0 ? ids : null },
});

/** A new element of `type`, listed in the connection's property: "+ Add flow". */
export function addFlowPlan(
  state: ModelState,
  metamodel: Metamodel,
  relationship: RelationshipRow,
  property: PropertyKey,
  type: TypeKey,
  name: string,
  near: { folderId: Id },
  id: Id = ulid(),
): Plan & { id: Id } {
  const folderId = defaultFolderFor(state, metamodel, type, near as DiagramRow);
  return {
    id,
    label: `Add ${name}`,
    edits: [
      { edit: "createObject", id, type, name, folderId },
      setRefs(relationship, property, [...refsOf(relationship.properties[property]), id]),
    ],
  };
}

/** An existing element listed in the connection's property (also making an implied one explicit). */
export function listFlowPlan(relationship: RelationshipRow, property: PropertyKey, object: ObjectRow): Plan {
  return {
    label: `Add ${object.name}`,
    edits: [setRefs(relationship, property, [...refsOf(relationship.properties[property]), object.id])],
  };
}

/** Takes a listed element out of the connection's property; the element stays in the model. */
export function unlistFlowPlan(relationship: RelationshipRow, property: PropertyKey, object: ObjectRow): Plan {
  return {
    label: `Remove ${object.name}`,
    edits: [
      setRefs(
        relationship,
        property,
        refsOf(relationship.properties[property]).filter((id) => id !== object.id),
      ),
    ],
  };
}

/** "Not part of this": an implied element the connection does not stand for. */
export function excludeFlowPlan(relationship: RelationshipRow, exclude: PropertyKey, object: ObjectRow): Plan {
  return {
    label: `Leave ${object.name} out`,
    edits: [setRefs(relationship, exclude, [...refsOf(relationship.properties[exclude]), object.id])],
  };
}

/**
 * A sequence about a flow (DOC-1 subjects): the ends of the relationship it comes through as lifelines, with their
 * messages, linked from the flow's documentation.
 */
export function flowSequencePlan(
  state: ModelState,
  metamodel: Metamodel,
  flow: ObjectRow,
  through: RelationshipRow,
  diagramType: TypeKey,
  folderId: Id,
  id: Id = ulid(),
): Plan & { id: Id } {
  const about = aboutEdits(state, metamodel, diagramType, flow.id, id);
  return {
    id,
    label: `New sequence ${flow.name}`,
    edits: [
      ...newSequenceEdits(state, metamodel, [through.sourceId, through.targetId], {
        id,
        name: flow.name,
        diagramType,
        folderId,
        definition: about.definition,
      }),
      ...about.edits,
    ],
  };
}
