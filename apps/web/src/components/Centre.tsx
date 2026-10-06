// Centre tabs: diagrams and object pages. A dot marks a tab whose item someone else changed meanwhile.
import type { ModelState } from "@connectome/engine";
import { useModel, useWorkbench, type Tab } from "../state/workbench";
import { ObjectProperties } from "./Properties";
import { DiagramEditor } from "./DiagramEditor";

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
      <div className="tabs" role="tablist" aria-label="Open items">
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
            <ObjectProperties id={active.id} withRelations />
          </div>
        )}
        {active?.kind === "diagram" && <DiagramEditor key={active.id} id={active.id} />}
      </div>
    </main>
  );
}

function tabName(state: ModelState, tab: Tab): string {
  const item = tab.kind === "diagram" ? state.diagrams.get(tab.id) : state.objects.get(tab.id);
  return item?.name ?? "(deleted)";
}
