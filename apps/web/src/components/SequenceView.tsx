// A sequence view (design/02-model/views-and-design-artifacts.md §6): lifelines are elements of the model and every
// arrow is a real message (a flow, usually an interaction's request or response), drawn in UML style in step order.
import { useState, type PointerEvent as ReactPointerEvent } from "react";
import type { ObjectRow } from "@connectome/engine";
import { ulid, type Edit, type Id } from "@connectome/model";
import { interactionsBetween, projectSequence, undrawnMessages, type SequenceMessage } from "@connectome/views";
import { useModel, useWorkbench } from "../state/workbench";
import { notationFor } from "../notation";
import { messageType } from "../semantics";
import { byName } from "../text";
import { addLifelineEdit, atEnd, insertAfter, moveMessageEdits, placeMessagesEdits } from "../sequence";
import { Glyph } from "./Glyph";

const LANE = 200;
const LEFT = 30;
const HEAD = 44;
const TOP = 16;
const ROW = 52;

interface Draft {
  from: number;
  to: number;
}

export function SequenceView({ id }: { id: Id }) {
  const { state, metamodel } = useModel();
  const edit = useWorkbench((s) => s.edit);
  const select = useWorkbench((s) => s.select);
  const selection = useWorkbench((s) => s.selection);
  const notify = useWorkbench((s) => s.notify);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [showSteps, setShowSteps] = useState(false);
  const diagram = state.diagrams.get(id);
  if (!diagram) return <div className="empty-state muted">This sequence was deleted.</div>;
  const type = metamodel.diagramType(diagram.diagramType);
  const seq = projectSequence(state, metamodel, id);
  const lanes = seq.lifelines;
  const selected = seq.messages.findIndex(
    (m) => selection?.kind === "relationship" && selection.id === m.relationship.id,
  );
  const name = (oid: Id) => state.objects.get(oid)?.name ?? "?";
  const laneX = (i: number) => LEFT + i * LANE + LANE / 2;
  const rowY = (i: number) => TOP + HEAD + 24 + i * ROW;
  const height = rowY(seq.messages.length) + 8;
  const width = LEFT * 2 + Math.max(1, lanes.length) * LANE;

  const candidates = [...state.objects.live()]
    .filter((o) => !type || metamodel.diagramAllowsObjectType(type, o.type))
    .filter((o) => !lanes.some((l) => l.occurrence.objectId === o.id))
    .sort(byName);
  const undrawn = undrawnMessages(
    state,
    id,
    lanes.map((l) => l.occurrence.objectId),
  );

  const addLifeline = (object: ObjectRow) =>
    edit(`Add ${object.name} to ${diagram.name}`, [addLifelineEdit(metamodel, diagram, seq, object.id, object.type)]);
  const moveLane = (i: number, by: -1 | 1) => {
    const a = lanes[i]!.occurrence;
    const b = lanes[i + by]?.occurrence;
    if (!b) return;
    edit(`Move ${name(a.objectId)} ${by < 0 ? "left" : "right"}`, [
      { edit: "moveObjectOccurrence", diagramId: id, occurrenceId: a.id, x: b.x, y: a.y },
      { edit: "moveObjectOccurrence", diagramId: id, occurrenceId: b.id, x: a.x, y: b.y },
    ]);
  };
  const removeLane = (i: number) => {
    const o = lanes[i]!.occurrence;
    edit(`Remove ${name(o.objectId)} from ${diagram.name}`, [
      { edit: "removeOccurrence", diagramId: id, occurrenceId: o.id },
    ]);
  };
  const moveMessage = (i: number, to: number) => {
    const edits = moveMessageEdits(id, seq, i, to);
    if (edits.length) edit(`Move message ${seq.messages[i]!.number}`, edits);
  };
  const removeMessage = (m: SequenceMessage) =>
    edit(`Remove ${m.relationship.name || "the message"} from ${diagram.name}`, [
      { edit: "removeOccurrence", diagramId: id, occurrenceId: m.occurrence.id },
    ]);
  const addResponse = (m: SequenceMessage) => {
    if (!m.interaction) return;
    const back = messageType(
      metamodel,
      state.objects.get(m.relationship.targetId)?.type ?? "",
      state.objects.get(m.relationship.sourceId)?.type ?? "",
    );
    if (!back)
      return notify(
        `No flow type lets ${name(m.relationship.targetId)} answer ${name(m.relationship.sourceId)}`,
        "error",
      );
    const rid = ulid();
    const create = {
      edit: "createRelationship" as const,
      id: rid,
      type: back.key,
      sourceId: m.relationship.targetId,
      targetId: m.relationship.sourceId,
      parentId: m.interaction.id,
    };
    // Right under the request.
    const place = placeMessagesEdits(seq, id, [create], insertAfter(seq, seq.messages.indexOf(m)));
    if (edit(`Add a response to ${m.relationship.name || "the request"}`, [create, ...place]))
      select({ kind: "relationship", id: rid });
  };
  const addAllUndrawn = () =>
    edit(`Add ${undrawn.length} messages to ${diagram.name}`, placeMessagesEdits(seq, id, undrawn, atEnd(seq)));

  const laneAt = (e: ReactPointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * width;
    const i = Math.floor((x - LEFT) / LANE);
    return i >= 0 && i < lanes.length ? i : null;
  };

  return (
    <div className="sequence-view">
      <div className="mm-filters sequence-toolbar">
        <label>
          Add lifeline
          <select
            aria-label="Add lifeline"
            value=""
            onChange={(e) => {
              const o = state.objects.get(e.target.value);
              if (o) addLifeline(o);
            }}
          >
            <option value="">Choose an element…</option>
            {candidates.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <button disabled={lanes.length < 2} onClick={() => setDraft({ from: 0, to: 1 })}>
          Add message
        </button>
        {undrawn.length > 0 && (
          <button onClick={addAllUndrawn} title="Messages of interactions between these lifelines, in their order">
            Add {undrawn.length} existing {undrawn.length === 1 ? "message" : "messages"}
          </button>
        )}
        <label className="check">
          <input type="checkbox" checked={showSteps} onChange={(e) => setShowSteps(e.target.checked)} />
          Steps table
        </label>
        {selected >= 0 && (
          <span className="sequence-selected" role="group" aria-label="Selected message">
            <span className="muted">Message {selected + 1}</span>
            <button disabled={selected === 0} onClick={() => moveMessage(selected, selected - 1)}>
              Move up
            </button>
            <button disabled={selected === seq.messages.length - 1} onClick={() => moveMessage(selected, selected + 1)}>
              Move down
            </button>
            {seq.messages[selected]!.role === "request" && (
              <button onClick={() => addResponse(seq.messages[selected]!)}>Add response</button>
            )}
            <button onClick={() => removeMessage(seq.messages[selected]!)}>Remove from diagram</button>
          </span>
        )}
      </div>
      {draft && (
        <MessageForm
          key={`${draft.from}-${draft.to}`}
          diagramId={id}
          draft={draft}
          setDraft={setDraft}
          lanes={lanes.map((l) => l.object)}
          onDone={(rid) => {
            setDraft(null);
            if (rid) select({ kind: "relationship", id: rid });
          }}
          seq={seq}
        />
      )}
      {lanes.length === 0 ? (
        <div className="empty-state muted">
          <p>Add lifelines above: any element of the model, such as an application or an interface.</p>
        </div>
      ) : (
        <div className="sequence-scroll">
          <svg
            className="sequence"
            role="img"
            aria-label={diagram.name}
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            onPointerUp={(e) => {
              const to = laneAt(e);
              if (dragFrom !== null && to !== null && to !== dragFrom) setDraft({ from: dragFrom, to });
              setDragFrom(null);
            }}
          >
            <defs>
              <marker
                id={`seq-filled-${id}`}
                viewBox="0 0 10 10"
                refX="10"
                refY="5"
                markerWidth="9"
                markerHeight="9"
                orient="auto"
              >
                <path d="M0,0 L10,5 L0,10 z" className="seq-head filled" />
              </marker>
              <marker
                id={`seq-open-${id}`}
                viewBox="0 0 10 10"
                refX="10"
                refY="5"
                markerWidth="9"
                markerHeight="9"
                orient="auto"
              >
                <path d="M0,0 L10,5 L0,10" className="seq-head open" />
              </marker>
            </defs>
            {lanes.map((l, i) => {
              const x = laneX(i);
              const n = l.object ? notationFor(metamodel.objectType(l.object.type)) : undefined;
              return (
                <g key={l.occurrence.id} className="seq-lane" data-lifeline={l.object?.name}>
                  <line x1={x} y1={TOP + HEAD} x2={x} y2={height} className="seq-stem" />
                  <rect
                    x={x - LANE / 2 + 8}
                    y={TOP + HEAD}
                    width={LANE - 16}
                    height={height - TOP - HEAD}
                    className="seq-hit"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      setDragFrom(i);
                    }}
                  >
                    <title>Drag to another lifeline to add a message</title>
                  </rect>
                  <foreignObject x={x - LANE / 2 + 8} y={TOP} width={LANE - 16} height={HEAD}>
                    <div className="seq-head-box" title={l.object?.name}>
                      {n && <Glyph glyph={n.glyph} colour={n.ink} />}
                      <button
                        className="link seq-name"
                        onClick={() => l.object && select({ kind: "object", id: l.object.id })}
                      >
                        {l.object?.name ?? "(deleted)"}
                      </button>
                      <span className="seq-lane-actions">
                        <button
                          aria-label={`Move ${l.object?.name} left`}
                          disabled={i === 0}
                          onClick={() => moveLane(i, -1)}
                        >
                          ‹
                        </button>
                        <button
                          aria-label={`Move ${l.object?.name} right`}
                          disabled={i === lanes.length - 1}
                          onClick={() => moveLane(i, 1)}
                        >
                          ›
                        </button>
                        <button aria-label={`Remove ${l.object?.name}`} onClick={() => removeLane(i)}>
                          ×
                        </button>
                      </span>
                    </div>
                  </foreignObject>
                </g>
              );
            })}
            {seq.activations.map((a) => (
              <rect
                key={`${a.lane}-${a.from}`}
                x={laneX(a.lane) - 5 + a.depth * 5}
                y={rowY(a.from)}
                width={10}
                height={rowY(a.to) - rowY(a.from)}
                className="seq-activation"
              />
            ))}
            {seq.messages.map((m, i) => {
              const y = rowY(i);
              const right = m.to > m.from;
              const x1 = laneX(m.from) + (right ? 5 : -5);
              const x2 = laneX(m.to) + (right ? -5 : 5);
              const label = `${m.number}. ${m.relationship.name || metamodel.relationshipType(m.relationship.type)?.verb}${
                m.payload.length ? ` [${m.payload.map((p) => p.name).join(", ")}]` : ""
              }`;
              const head = m.role === "response" || !m.synchronous ? "open" : "filled";
              return (
                <g
                  key={m.occurrence.id}
                  className={`seq-message ${m.role}${i === selected ? " selected" : ""}`}
                  data-message={m.relationship.name}
                  role="button"
                  aria-label={`Message ${label}`}
                  onClick={() => select({ kind: "relationship", id: m.relationship.id })}
                >
                  <line x1={x1} y1={y} x2={x2} y2={y} className="seq-hit-line" />
                  <line x1={x1} y1={y} x2={x2} y2={y} className="seq-line" markerEnd={`url(#seq-${head}-${id})`} />
                  <text x={(x1 + x2) / 2} y={y - 7} textAnchor="middle">
                    {label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}
      {showSteps && (
        <table className="sequence-steps" aria-label="Steps">
          <thead>
            <tr>
              <th>Step</th>
              <th>From</th>
              <th>To</th>
              <th>Message</th>
              <th>Carries</th>
              <th>Protocol</th>
            </tr>
          </thead>
          <tbody>
            {seq.messages.map((m) => (
              <tr key={m.occurrence.id} onClick={() => select({ kind: "relationship", id: m.relationship.id })}>
                <td>{m.number}</td>
                <td>{name(m.relationship.sourceId)}</td>
                <td>{name(m.relationship.targetId)}</td>
                <td>{m.relationship.name || <span className="muted">{m.role}</span>}</td>
                <td>{m.payload.map((p) => p.name).join(", ")}</td>
                <td>
                  {String(
                    m.interaction?.properties["interaction.protocol"] ??
                      m.relationship.properties["flow.protocol"] ??
                      "",
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/**
 * What a new message between two lifelines can be (§6 "Gestures"): a message of an interaction between them not drawn
 * yet, a new message in one of those interactions, a new interaction with its request, or a plain flow.
 */
function MessageForm(props: {
  diagramId: Id;
  draft: Draft;
  setDraft(d: Draft | null): void;
  lanes: (ObjectRow | undefined)[];
  seq: ReturnType<typeof projectSequence>;
  onDone(relationshipId?: Id): void;
}) {
  const { diagramId, draft, setDraft, lanes, seq, onDone } = props;
  const { state, metamodel } = useModel();
  const edit = useWorkbench((s) => s.edit);
  const [label, setLabel] = useState("");
  const from = lanes[draft.from];
  const to = lanes[draft.to];
  if (!from || !to) return null;
  if (from.id === to.id)
    return (
      <div className="sequence-form" role="dialog" aria-label="New message">
        <p className="muted">A message from an element to itself is not supported yet (decision V6).</p>
        <button onClick={() => onDone()}>Close</button>
      </div>
    );
  const interactions = interactionsBetween(state, metamodel, from.id, to.id);
  const drawn = new Set(seq.messages.map((m) => m.relationship.id));
  const existing = interactions.flatMap((i) =>
    state.relationships
      .find("byParent", i.id)
      .filter((m) => m.sourceId === from.id && !drawn.has(m.id))
      .sort((a, b) => a.rank - b.rank),
  );
  const newInteractionTypes = metamodel
    .allowedRelationshipTypes(from.type, to.type)
    .filter((t) => t.semantic === "interaction");
  const flow = messageType(metamodel, from.type, to.type);
  const name = label.trim();
  const verb = (key: string) => metamodel.relationshipType(key)?.verb ?? key;
  const place = (r: { id: Id; sourceId: Id; targetId: Id }) => placeMessagesEdits(seq, diagramId, [r], atEnd(seq));
  const run = (text: string, edits: Edit[], rid: Id) => {
    if (edit(text, edits)) onDone(rid);
  };
  const newMessage = (parentId: Id | null) => {
    if (!flow) return;
    const rid = ulid();
    const r = { id: rid, sourceId: from.id, targetId: to.id };
    run(
      `${from.name} ${verb(flow.key)} ${to.name}${name ? `: ${name}` : ""}`,
      [{ edit: "createRelationship", type: flow.key, ...r, parentId, ...(name ? { name } : {}) }, ...place(r)],
      rid,
    );
  };
  const newInteraction = (typeKey: string) => {
    if (!flow) return;
    const iid = ulid();
    const rid = ulid();
    const r = { id: rid, sourceId: from.id, targetId: to.id };
    run(
      `${from.name} ${verb(typeKey)} ${to.name}${name ? `: ${name}` : ""}`,
      [
        { edit: "createRelationship", id: iid, type: typeKey, sourceId: from.id, targetId: to.id },
        { edit: "createRelationship", type: flow.key, ...r, parentId: iid, ...(name ? { name } : {}) },
        ...place(r),
      ],
      rid,
    );
  };
  return (
    <div className="sequence-form" role="dialog" aria-label="New message">
      <div className="sequence-form-row">
        <label>
          From
          <select value={draft.from} onChange={(e) => setDraft({ ...draft, from: Number(e.target.value) })}>
            {lanes.map((l, i) => (
              <option key={i} value={i}>
                {l?.name ?? "?"}
              </option>
            ))}
          </select>
        </label>
        <label>
          To
          <select value={draft.to} onChange={(e) => setDraft({ ...draft, to: Number(e.target.value) })}>
            {lanes.map((l, i) => (
              <option key={i} value={i}>
                {l?.name ?? "?"}
              </option>
            ))}
          </select>
        </label>
        <label>
          Message
          <input
            aria-label="Message name"
            placeholder="e.g. GET /claims/{id}"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            autoFocus
          />
        </label>
        <button className="link" onClick={() => onDone()}>
          Cancel
        </button>
      </div>
      <div className="sequence-choices">
        {existing.map((m) => (
          <button key={m.id} onClick={() => run(`Add ${m.name || "a message"} to the sequence`, place(m), m.id)}>
            Draw “{m.name || verb(m.type)}”, already in the model
          </button>
        ))}
        {flow &&
          interactions.map((i) => (
            <button key={i.id} onClick={() => newMessage(i.id)}>
              New {i.sourceId === from.id ? "request" : "response"} in “{name_(state, i.sourceId)} {verb(i.type)}{" "}
              {name_(state, i.targetId)}”
            </button>
          ))}
        {flow &&
          newInteractionTypes.map((t) => (
            <button key={t.key} className="primary" onClick={() => newInteraction(t.key)}>
              New interaction: {from.name} {t.verb} {to.name}
            </button>
          ))}
        {flow && (
          <button onClick={() => newMessage(null)}>
            New flow: {from.name} {flow.verb} {to.name}
          </button>
        )}
        {!flow && existing.length === 0 && (
          <span className="muted">
            No rule lets {from.name} send anything to {to.name}.
          </span>
        )}
      </div>
    </div>
  );
}

const name_ = (state: ReturnType<typeof useModel>["state"], id: Id) => state.objects.get(id)?.name ?? "?";
