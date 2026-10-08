// Centre tabs: diagrams and object pages. A dot marks a tab whose item someone else changed meanwhile.
import type { ModelState } from "@connectome/engine";
import { viewKind } from "../views";
import { useModel, useWorkbench, type Tab } from "../state/workbench";
import { ObjectProperties } from "./Properties";
import { DiagramEditor } from "./DiagramEditor";
import { MetamodelAdmin } from "./MetamodelAdmin";
import { MatrixView } from "./MatrixView";
import { DocumentView } from "./DocumentView";
import { SequenceView } from "./SequenceView";
import { DuplicatesView } from "./DuplicatesView";
import { ObjectViewer } from "./ObjectViewer";
import { FolderIcon, ViewIcon } from "./ExplorerIcon";

export function Centre() {
  const { state, metamodel } = useModel();
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
            <span aria-hidden>
              {t.kind === "diagram" ? (
                <ViewIcon kind={viewKind(state, metamodel, t.id)} size={12} />
              ) : t.kind === "objects" ? (
                <FolderIcon size={12} />
              ) : t.kind === "metamodel" ? (
                "◇"
              ) : t.kind === "duplicates" ? (
                "≈"
              ) : (
                "▭"
              )}
            </span>
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
        {active?.kind === "diagram" &&
          (viewKind(state, metamodel, active.id) === "matrix" ? (
            <MatrixView key={active.id} id={active.id} />
          ) : viewKind(state, metamodel, active.id) === "document" ? (
            <DocumentView key={active.id} id={active.id} />
          ) : viewKind(state, metamodel, active.id) === "sequence" ? (
            <SequenceView key={active.id} id={active.id} />
          ) : (
            <DiagramEditor key={active.id} id={active.id} />
          ))}
        {active?.kind === "metamodel" && <MetamodelAdmin />}
        {active?.kind === "duplicates" && <DuplicatesView />}
        {active?.kind === "objects" && active.folderId && <ObjectViewer key={active.id} folderId={active.folderId} />}
      </div>
    </main>
  );
}

function tabName(state: ModelState, tab: Tab): string {
  if (tab.kind === "metamodel") return "Metamodel";
  if (tab.kind === "duplicates") return "Possible duplicates";
  if (tab.kind === "objects") return `${state.folders.get(tab.folderId ?? "")?.name ?? "(deleted)"} objects`;
  const item = tab.kind === "diagram" ? state.diagrams.get(tab.id) : state.objects.get(tab.id);
  return item?.name ?? "(deleted)";
}
