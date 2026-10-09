// Under a document table's row, what its connection stands for (slice DOC-2, a relation table's `expand`): the
// information flows and functions it lists, those its ends' scopes imply, a sequence about each, and "+ Add flow".
import { useState } from "react";
import type { ObjectRow } from "@connectome/engine";
import type { Id, RelationTableExpand } from "@connectome/model";
import type { FlowRow, TableRow } from "@connectome/views";
import { useModel, useWorkbench } from "../state/workbench";
import { notationFor } from "../notation";
import { addFlowPlan, excludeFlowPlan, flowSequencePlan, listFlowPlan, unlistFlowPlan } from "../flows";
import { Glyph } from "./Glyph";

export function FlowRows(props: {
  row: TableRow;
  expand: RelationTableExpand;
  /** Cells between the row header and the last (state) cell, which the flow's details span. */
  span: number;
  /** Where new flows and sequences go when their type names no folder: the document's subject's. */
  near: { folderId: Id };
}) {
  const { row, expand, span, near } = props;
  const { state, metamodel } = useModel();
  const edit = useWorkbench((s) => s.edit);
  const select = useWorkbench((s) => s.select);
  const openTab = useWorkbench((s) => s.openTab);
  const [adding, setAdding] = useState(false);
  const [type, setType] = useState(expand.add?.types[0] ?? "");
  const [name, setName] = useState("");
  const connection = row.relationship;
  const ends = `${state.objects.get(connection.sourceId)?.name ?? "?"} and ${state.objects.get(connection.targetId)?.name ?? "?"}`;
  const typeName = (o: ObjectRow) => metamodel.objectType(o.type)?.definition.name ?? o.type;
  const relText = (id: Id) => {
    const r = state.relationships.get(id);
    if (!r) return "";
    const verb = metamodel.relationshipType(r.type)?.verb ?? r.type;
    return `${state.objects.get(r.sourceId)?.name ?? "?"} ${verb} ${state.objects.get(r.targetId)?.name ?? "?"}`;
  };
  const sequence = (flow: FlowRow) => {
    if (flow.sequence) return openTab({ kind: "diagram", id: flow.sequence.id });
    if (!expand.sequence) return;
    const plan = flowSequencePlan(
      state,
      metamodel,
      flow.object,
      flow.through ?? connection,
      expand.sequence,
      flow.object.folderId,
    );
    if (edit(plan.label, plan.edits)) openTab({ kind: "diagram", id: plan.id });
  };
  const add = () => {
    const trimmed = name.trim();
    if (!trimmed || !type) return;
    const plan = addFlowPlan(state, metamodel, connection, expand.property, type, trimmed, near);
    if (edit(plan.label, plan.edits)) {
      setName("");
      setAdding(false);
    }
  };
  // Implied relationships that bring no element still show what the connection stands for.
  const withElements = new Set((row.flows ?? []).flatMap((f) => (f.through ? [f.through.id] : [])));
  const bare = (row.implied ?? []).filter((i) => !withElements.has(i.relationship.id));
  const flows = row.flows ?? [];

  return (
    <>
      {flows.map((flow) => {
        const n = notationFor(metamodel.objectType(flow.object.type));
        return (
          <tr key={flow.object.id} className={`doc-flow${flow.implied ? " implied" : ""}`}>
            <th scope="row">
              <button
                className="doc-chip"
                onClick={() => select({ kind: "object", id: flow.object.id })}
                title={`${typeName(flow.object)}: select to see it in the properties panel`}
              >
                <span aria-hidden="true">⇢ </span>
                <Glyph glyph={n.glyph} colour={n.ink} />
                {flow.object.name}
              </button>
            </th>
            <td colSpan={span}>
              <span className="muted">{typeName(flow.object)}</span>
              {flow.implied && flow.through && (
                <span className="doc-implied" title={`Implied: ${relText(flow.through.id)}`}>
                  {" "}
                  · implied by {relText(flow.through.id)}
                </span>
              )}
              {expand.sequence && (
                <button
                  className="link doc-flow-sequence"
                  aria-label={`${flow.sequence ? "Open" : "Create"} the sequence of ${flow.object.name}`}
                  onClick={() => sequence(flow)}
                >
                  {flow.sequence ? "⇅ Sequence" : "+ Sequence"}
                </button>
              )}
            </td>
            <td className="doc-row-state">
              {flow.implied ? (
                <>
                  <button
                    className="link"
                    title="List it in this connection's information flows"
                    onClick={() => {
                      const plan = listFlowPlan(connection, expand.property, flow.object);
                      edit(plan.label, plan.edits);
                    }}
                  >
                    Keep
                  </button>
                  {expand.exclude && (
                    <button
                      className="link"
                      title="This connection does not stand for it"
                      onClick={() => {
                        const plan = excludeFlowPlan(connection, expand.exclude!, flow.object);
                        edit(plan.label, plan.edits);
                      }}
                    >
                      Not part of this
                    </button>
                  )}
                </>
              ) : (
                <button
                  className="icon"
                  aria-label={`Remove ${flow.object.name} from this connection`}
                  title="Remove from this connection (it stays in the model)"
                  onClick={() => {
                    const plan = unlistFlowPlan(connection, expand.property, flow.object);
                    edit(plan.label, plan.edits);
                  }}
                >
                  ×
                </button>
              )}
            </td>
          </tr>
        );
      })}
      {bare.map((i) => (
        <tr key={i.relationship.id} className="doc-flow implied">
          <th scope="row">
            <button
              className="doc-chip"
              onClick={() => select({ kind: "relationship", id: i.relationship.id })}
              title="A more concrete flow between what the two ends realise or contain"
            >
              <span aria-hidden="true">⇢ </span>
              {relText(i.relationship.id)}
            </button>
          </th>
          <td colSpan={span} className="muted">
            implied{i.via.length > 0 && <> through {i.via.map((r) => relText(r.id)).join(", ")}</>}
          </td>
          <td className="doc-row-state" />
        </tr>
      ))}
      {expand.add && (
        <tr className="doc-flow add">
          <th scope="row" colSpan={span + 2}>
            {adding ? (
              <span className="doc-add-form">
                <select aria-label="Type of the new flow" value={type} onChange={(e) => setType(e.target.value)}>
                  {expand.add.types.map((t) => (
                    <option key={t} value={t}>
                      {metamodel.objectType(t)?.definition.name ?? t}
                    </option>
                  ))}
                </select>
                <input
                  aria-label={`Name of the new flow between ${ends}`}
                  value={name}
                  autoFocus
                  placeholder="e.g. Pay a claim"
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") add();
                    if (e.key === "Escape") setAdding(false);
                  }}
                />
                <button onClick={add} disabled={!name.trim()}>
                  Add
                </button>
                <button className="link" onClick={() => setAdding(false)}>
                  Cancel
                </button>
              </span>
            ) : (
              <button
                className="link doc-flow-add"
                aria-label={`${expand.add.label ?? "Add"} between ${ends}`}
                onClick={() => setAdding(true)}
              >
                + {expand.add.label ?? "Add"}
              </button>
            )}
          </th>
        </tr>
      )}
    </>
  );
}
