// Centre tabs: diagrams and object pages. A dot marks a tab whose item someone else changed meanwhile.
// The diagram view is read-only here; the diagram editor is slice 0.8.
import type { Id } from "@connectome/model";
import type { ModelState } from "@connectome/engine";
import { useModel, useWorkbench, type Tab } from "../state/workbench";
import { ObjectProperties } from "./Properties";

export function Centre() {
  const { state } = useModel();
  const tabs = useWorkbench((s) => s.tabs);
  const activeTab = useWorkbench((s) => s.activeTab);
  const changedTabs = useWorkbench((s) => s.changedTabs);
  const activate = useWorkbench((s) => s.activateTab);
  const closeTab = useWorkbench((s) => s.closeTab);
  const active = tabs.find((t) => t.id === activeTab);

  return (
    <main className="centre">
      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <div
            key={t.id}
            role="tab"
            aria-selected={t.id === activeTab}
            className={`tab${t.id === activeTab ? " active" : ""}`}
            onClick={() => activate(t.id)}
          >
            <span aria-hidden>{t.kind === "diagram" ? "⧉" : "▭"}</span>
            <span>{tabName(state, t)}</span>
            {changedTabs.has(t.id) && <span className="change-dot" title="Changed by someone else" />}
            <button
              className="close"
              aria-label={`Close ${tabName(state, t)}`}
              onClick={(e) => {
                e.stopPropagation();
                closeTab(t.id);
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="tab-body">
        {!active && (
          <div className="empty-state muted">
            <p>Double-click a diagram or an object in the explorer to open it here.</p>
          </div>
        )}
        {active?.kind === "object" && (
          <div className="object-page">
            <ObjectProperties id={active.id} />
          </div>
        )}
        {active?.kind === "diagram" && <DiagramView id={active.id} />}
      </div>
    </main>
  );
}

function tabName(state: ModelState, tab: Tab): string {
  const item = tab.kind === "diagram" ? state.diagrams.get(tab.id) : state.objects.get(tab.id);
  return item?.name ?? "(deleted)";
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A read-only rendering of a diagram's occurrences (nested ones placed inside their parents). */
function DiagramView({ id }: { id: Id }) {
  const { state, metamodel } = useModel();
  const select = useWorkbench((s) => s.select);
  const selected = useWorkbench((s) => s.selection?.id);
  const diagram = state.diagrams.get(id);
  if (!diagram) return <p className="muted pad">This diagram was deleted.</p>;
  const occurrences = state.objectOccurrences.find("byDiagram", id);
  const lines = state.relationshipOccurrences.find("byDiagram", id).filter((l) => l.shownAs !== "nesting");

  // Nested occurrences are positioned relative to their parent.
  const boxes = new Map<Id, Box>();
  const place = (occId: Id, seen = new Set<Id>()): Box | undefined => {
    const known = boxes.get(occId);
    if (known) return known;
    const occ = state.objectOccurrences.get(occId);
    if (!occ || seen.has(occId)) return undefined;
    seen.add(occId);
    const parent = occ.parentOccurrenceId ? place(occ.parentOccurrenceId, seen) : undefined;
    const box = { x: occ.x + (parent?.x ?? 0), y: occ.y + (parent?.y ?? 0), w: occ.w, h: occ.h };
    boxes.set(occId, box);
    return box;
  };
  for (const o of occurrences) place(o.id);
  const all = [...boxes.values()];
  const width = Math.max(400, ...all.map((b) => b.x + b.w)) + 40;
  const height = Math.max(300, ...all.map((b) => b.y + b.h)) + 40;
  // Larger symbols behind smaller ones, so nothing placed over a container is hidden by it.
  const area = (id: Id) => boxes.get(id)!.w * boxes.get(id)!.h;
  const ordered = [...occurrences].sort((a, b) => area(b.id) - area(a.id) || depth(state, a.id) - depth(state, b.id));

  return (
    <div className="diagram">
      <p className="muted pad">Read-only view. Drawing and moving arrive with the diagram editor.</p>
      <svg width={width} height={height} role="img" aria-label={diagram.name}>
        {ordered.map((o) => {
          const b = boxes.get(o.id)!;
          const object = state.objects.get(o.objectId);
          const symbol = { ...(object ? metamodel.objectType(object.type)?.symbol : {}), ...o.style };
          const container = state.objectOccurrences.count("byParent", o.id) > 0;
          return (
            <g
              key={o.id}
              className={`occ${selected === o.objectId ? " selected" : ""}`}
              onClick={() => object && select({ kind: "object", id: object.id })}
            >
              <rect
                x={b.x}
                y={b.y}
                width={b.w}
                height={b.h}
                rx={4}
                fill={symbol.fill ?? "#ffffff"}
                stroke={symbol.stroke ?? "#5b6b7c"}
              />
              <text x={b.x + 6} y={b.y + (container ? 16 : b.h / 2 + 4)} className={container ? "container-label" : ""}>
                {object?.name ?? "(deleted)"}
              </text>
            </g>
          );
        })}
        {lines.map((l) => {
          const a = boxes.get(l.sourceOccurrenceId);
          const b = boxes.get(l.targetOccurrenceId);
          if (!a || !b) return null;
          return (
            <line
              key={l.id}
              className="line"
              x1={a.x + a.w / 2}
              y1={a.y + a.h / 2}
              x2={b.x + b.w / 2}
              y2={b.y + b.h / 2}
              markerEnd="url(#arrow)"
            />
          );
        })}
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
          </marker>
        </defs>
      </svg>
    </div>
  );
}

function depth(state: ModelState, occId: Id): number {
  let d = 0;
  for (let o = state.objectOccurrences.get(occId); o?.parentOccurrenceId && d < 50; d++) {
    o = state.objectOccurrences.get(o.parentOccurrenceId);
  }
  return d;
}
