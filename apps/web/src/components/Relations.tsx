// The Relations window's tabs (design/04-ux/workbench.md "Tool windows"): an object's relationships in several
// views with a filter, Trace, and the diagrams it occurs on. The object page shows the same views as sections.
import { useState, type ReactNode } from "react";
import type { ModelState, ObjectRow, Metamodel, RelationshipRow } from "@connectome/engine";
import { ulid } from "@connectome/model";
import { trace, traceByAbstraction, type TraceDirection, type TraceKind } from "@connectome/semantics";
import { useModel, useWorkbench } from "../state/workbench";
import { messagesOf, payloadText, type RelationshipGroup } from "../semantics";
import {
  RELATION_VIEWS,
  meaningGroups,
  occurrences,
  reach,
  relatedObjects,
  structureGroups,
  type RelationView,
} from "../relations";
import { addToDiagramPlan } from "../diagram";
import { folderPath } from "../text";
import { Section, usePanelPrefs } from "./Inspector";

export type RelationsTab = "relationships" | "trace" | "occurs";

/** The Relations window's content for the selection: only objects have relations to show. */
export function RelationsTabContent({ tab }: { tab: RelationsTab }) {
  const { state, metamodel } = useModel();
  const selection = useWorkbench((s) => s.selection);
  const object = selection?.kind === "object" ? state.objects.get(selection.id) : undefined;
  if (!object) return <p className="muted pad">Select an object to see its relationships, traces and diagrams.</p>;
  if (tab === "trace") return <TraceView key={object.id} object={object} state={state} metamodel={metamodel} />;
  if (tab === "occurs") return <OccursOnView object={object} state={state} metamodel={metamodel} />;
  return <RelationshipsView object={object} state={state} metamodel={metamodel} />;
}

/** The three views as sections, for the object page in the centre. */
export function RelationsSections({ object }: { object: ObjectRow }) {
  const { state, metamodel } = useModel();
  return (
    <>
      <Section id="object:relationships" title="Relationships">
        <RelationshipsView object={object} state={state} metamodel={metamodel} />
      </Section>
      <Section id="object:trace" title="Trace" className="trace">
        <TraceView key={object.id} object={object} state={state} metamodel={metamodel} />
      </Section>
      <Section id="object:occurs" title="Occurs on">
        <OccursOnView object={object} state={state} metamodel={metamodel} />
      </Section>
    </>
  );
}

interface ViewProps {
  object: ObjectRow;
  state: ModelState;
  metamodel: Metamodel;
}

function Toolbar({ children }: { children: ReactNode }) {
  return <div className="inspector-toolbar">{children}</div>;
}

/** Relationships, in the chosen view, with a filter over names, types, verbs and payloads. */
function RelationshipsView({ object, state, metamodel }: ViewProps) {
  const view = usePanelPrefs((s) => (s.tabs["relations:view"] ?? "meaning") as RelationView);
  const depth = Number(usePanelPrefs((s) => s.tabs["relations:depth"] ?? "3"));
  const openTab = usePanelPrefs((s) => s.openTab);
  const [filter, setFilter] = useState("");
  const option = RELATION_VIEWS.find((v) => v.key === view) ?? RELATION_VIEWS[0]!;
  return (
    <div className="relations" data-view={option.key}>
      <Toolbar>
        <select
          aria-label="Relationship view"
          className="set-picker"
          value={option.key}
          onChange={(e) => openTab("relations:view", e.target.value)}
        >
          {RELATION_VIEWS.map((v) => (
            <option key={v.key} value={v.key}>
              {v.label}
            </option>
          ))}
        </select>
        <input
          type="search"
          aria-label="Filter relationships"
          placeholder="Filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setFilter("")}
        />
        {option.depth && (
          <label className="depth" title="How many steps to follow">
            <input
              type="number"
              aria-label="Steps"
              min={1}
              max={6}
              value={depth}
              onChange={(e) =>
                openTab("relations:depth", String(Math.min(6, Math.max(1, Number(e.target.value) || 1))))
              }
            />
            steps
          </label>
        )}
      </Toolbar>
      {option.key === "meaning" && (
        <Groups groups={meaningGroups(state, metamodel, object.id, filter)} state={state} filtered={filter !== ""} />
      )}
      {option.key === "structure" && (
        <Groups groups={structureGroups(state, metamodel, object.id, filter)} state={state} filtered={filter !== ""} />
      )}
      {option.key === "object" && <ByObject object={object} state={state} metamodel={metamodel} filter={filter} />}
      {(option.key === "flows" || option.key === "dependencies") && (
        <ReachView
          object={object}
          state={state}
          metamodel={metamodel}
          kind={option.key === "flows" ? "flow" : "dependency"}
          depth={option.key === "flows" ? 2 : depth}
          filter={filter}
        />
      )}
    </div>
  );
}

/** Relationships grouped by what they mean (design/02-model/semantics.md §9.1), each row in the type's own words. */
function Groups({ groups, state, filtered }: { groups: RelationshipGroup[]; state: ModelState; filtered: boolean }) {
  const select = useWorkbench((s) => s.select);
  if (groups.length === 0) return <p className="muted pad">{filtered ? "Nothing matches." : "None yet."}</p>;
  return (
    <div className="rel-list">
      {groups.map((g) => (
        <div key={`${g.kind}:${g.direction}`} className="rel-group" data-kind={g.kind}>
          <h4>{g.label}</h4>
          <ul className="plain">
            {g.rows.map(({ relationship, verb, other, arrow }) => (
              <li key={relationship.id} data-relationship={relationship.id}>
                <button
                  className="link muted"
                  title="Show this relationship"
                  onClick={() => select({ kind: "relationship", id: relationship.id })}
                >
                  {verb} {arrow}
                </button>{" "}
                <button className="link" onClick={() => select({ kind: "object", id: other })}>
                  {state.objects.get(other)?.name ?? other}
                </button>
                {relationship.payload.length > 0 && (
                  <span className="payload-text"> · {payloadText(state, relationship)}</span>
                )}
                {g.kind === "interaction" && <MessageList interaction={relationship} state={state} />}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** An interaction's messages, each with its direction and payload (semantics.md §6). */
function MessageList({ interaction, state }: { interaction: RelationshipRow; state: ModelState }) {
  const select = useWorkbench((s) => s.select);
  const messages = messagesOf(state, interaction);
  if (messages.length === 0) return null;
  return (
    <ul className="plain messages">
      {messages.map(({ message, role }) => (
        <li key={message.id} data-role={role}>
          <button className="link muted" onClick={() => select({ kind: "relationship", id: message.id })}>
            {role === "request" ? "Request →" : "Response ←"}
          </button>
          {message.payload.length > 0 && <span className="payload-text"> {payloadText(state, message)}</span>}
        </li>
      ))}
    </ul>
  );
}

/** One row per related object, listing every relationship to it. */
function ByObject({ object, state, metamodel, filter }: ViewProps & { filter: string }) {
  const select = useWorkbench((s) => s.select);
  const rows = relatedObjects(state, metamodel, object.id, filter);
  if (rows.length === 0) return <p className="muted pad">{filter ? "Nothing matches." : "None yet."}</p>;
  return (
    <ul className="plain rel-rows">
      {rows.map((r) => {
        const other = state.objects.get(r.objectId);
        return (
          <li key={r.objectId} data-object={r.objectId}>
            <button className="link" onClick={() => select({ kind: "object", id: r.objectId })}>
              {other?.name ?? r.objectId}
            </button>
            <span className="muted">
              {r.links.map((l, i) => (
                <span key={l.relationshipId}>
                  {i > 0 && ", "}
                  <button
                    className="link muted"
                    title="Show this relationship"
                    onClick={() => select({ kind: "relationship", id: l.relationshipId })}
                  >
                    {l.verb} {l.arrow}
                  </button>
                </span>
              ))}
            </span>
            {r.links.length > 1 && <span className="count">{r.links.length}</span>}
          </li>
        );
      })}
    </ul>
  );
}

/** What the object reaches along flows or dependencies, both ways, with how many steps away. */
function ReachView(props: ViewProps & { kind: "flow" | "dependency"; depth: number; filter: string }) {
  const { object, state, metamodel, kind, depth, filter } = props;
  const select = useWorkbench((s) => s.select);
  const sides = reach(state, metamodel, object.id, kind, depth, filter);
  return (
    <div className="rel-list">
      {sides.map((side) => (
        <div key={side.direction} className="rel-group" data-direction={side.direction}>
          <h4>{side.label}</h4>
          {side.steps.length === 0 && <p className="muted">Nothing found.</p>}
          <ul className="plain rel-rows">
            {side.steps.map((step) => (
              <li key={step.objectId} data-object={step.objectId} data-depth={step.depth}>
                <button className="link" onClick={() => select({ kind: "object", id: step.objectId })}>
                  {state.objects.get(step.objectId)?.name ?? step.objectId}
                </button>
                {step.depth > 1 && (
                  <span className="muted via">via {state.objects.get(step.fromId)?.name ?? step.fromId}</span>
                )}
                <span className="count" title="Steps from this object">
                  {step.depth}
                </span>
              </li>
            ))}
          </ul>
          {side.truncated && <p className="muted">Showing the first {side.steps.length}.</p>}
        </div>
      ))}
    </div>
  );
}

/** The traces offered for an object (semantics.md §9.3), in the words of the framework's questions. */
const TRACES: { key: string; label: string; kind: TraceKind; direction: TraceDirection; contents?: boolean }[] = [
  { key: "down", label: "Implementations (down the abstractions)", kind: "abstraction", direction: "forward" },
  { key: "up", label: "What this implements (up the abstractions)", kind: "abstraction", direction: "backward" },
  { key: "downstream", label: "Downstream", kind: "flow", direction: "forward", contents: true },
  { key: "upstream", label: "Upstream", kind: "flow", direction: "backward", contents: true },
  { key: "receivers", label: "Who receives this information", kind: "payload", direction: "forward" },
  { key: "senders", label: "Who sends this information", kind: "payload", direction: "backward" },
  { key: "dependsOn", label: "What this depends on", kind: "dependency", direction: "forward" },
  { key: "usedBy", label: "What depends on this", kind: "dependency", direction: "backward" },
];

/** Trace ▸: follows relationships by meaning, lays the result out by abstraction and highlights it on diagrams. */
function TraceView({ object, state, metamodel }: ViewProps) {
  const select = useWorkbench((s) => s.select);
  const current = useWorkbench((s) => s.trace);
  const showTrace = useWorkbench((s) => s.showTrace);
  // Keyed by object, so selecting another object starts afresh; coming back keeps the trace shown.
  const [chosen, setChosen] = useState(() =>
    current?.startId === object.id ? (TRACES.find((t) => t.label === current.label)?.key ?? "") : "",
  );
  const option = TRACES.find((t) => t.key === chosen);
  const result = option
    ? trace(state, metamodel, object.id, option.kind, option.direction, { contents: option.contents ?? false })
    : undefined;
  const abstractions = metamodel.valueList("semanticAbstraction");
  const abstractionName = (abstraction: string | null) =>
    abstraction ? (abstractions?.values.find((v) => v.key === abstraction)?.label ?? abstraction) : "No abstraction";
  const choose = (key: string) => {
    setChosen(key);
    const next = TRACES.find((t) => t.key === key);
    if (!next) return showTrace(null);
    const ids = trace(state, metamodel, object.id, next.kind, next.direction, {
      contents: next.contents ?? false,
    }).steps.map((s) => s.objectId);
    showTrace({ startId: object.id, label: next.label, objectIds: new Set([object.id, ...ids]) });
  };
  return (
    <div className="trace">
      <Toolbar>
        <select aria-label="Trace" value={chosen} onChange={(e) => choose(e.target.value)}>
          <option value="">Choose a trace…</option>
          {TRACES.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
      </Toolbar>
      <div className="rel-list">
        {result && result.steps.length === 0 && <p className="muted">Nothing found.</p>}
        {result &&
          traceByAbstraction(state, metamodel, result).map((column) => (
            <div
              key={column.abstraction ?? "none"}
              className="trace-column"
              data-abstraction={column.abstraction ?? "none"}
            >
              <h4>{abstractionName(column.abstraction)}</h4>
              <ul className="plain">
                {column.objectIds.map((id) => (
                  <li key={id}>
                    <button className="link" onClick={() => select({ kind: "object", id })}>
                      {state.objects.get(id)?.name ?? id}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        {result?.truncated && <p className="muted">Showing the first {result.steps.length}.</p>}
      </div>
    </div>
  );
}

/** The diagrams the object occurs on, how often, and adding it to the diagram that is open. */
function OccursOnView({ object, state, metamodel }: ViewProps) {
  const openTab = useWorkbench((s) => s.openTab);
  const edit = useWorkbench((s) => s.edit);
  const notify = useWorkbench((s) => s.notify);
  const activeTab = useWorkbench((s) => s.tabs.find((t) => t.id === s.activeTab));
  const [filter, setFilter] = useState("");
  const all = occurrences(state, object.id);
  const rows = filter ? occurrences(state, object.id, filter) : all;
  const tabDiagram = activeTab?.kind === "diagram" ? state.diagrams.get(activeTab.id) : undefined;
  // Only canvases take symbols; a matrix shows what its definition selects.
  const open =
    tabDiagram && (metamodel.diagramType(tabDiagram.diagramType)?.definition.kind ?? "canvas") === "canvas"
      ? tabDiagram
      : undefined;
  const onOpen = open && all.some((r) => r.diagramId === open.id);
  const add = () => {
    if (!open) return;
    const plan = addToDiagramPlan(state, metamodel, open.id, object.id, ulid());
    if ("error" in plan) notify(plan.error, "error");
    else edit(plan.label, plan.edits);
  };
  return (
    <div className="occurs">
      {all.length > 6 && (
        <Toolbar>
          <input
            type="search"
            aria-label="Filter diagrams"
            placeholder="Filter diagrams"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </Toolbar>
      )}
      {all.length === 0 && <p className="muted pad">Not on any diagram yet.</p>}
      <ul className="plain rel-rows">
        {rows.map((r) => {
          const d = state.diagrams.get(r.diagramId)!;
          return (
            <li key={d.id} data-diagram={d.id}>
              <button className="link" onClick={() => openTab({ kind: "diagram", id: d.id })}>
                ⧉ {d.name}
              </button>
              <span className="muted via">{folderPath(state, d.folderId).join(" / ")}</span>
              {r.count > 1 && (
                <span className="count" title={`Drawn ${r.count} times on this diagram`}>
                  ×{r.count}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {open && !onOpen && (
        <div className="actions pad">
          <button onClick={add}>Add to {open.name}</button>
        </div>
      )}
    </div>
  );
}
