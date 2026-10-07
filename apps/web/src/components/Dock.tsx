// The right-hand dock (design/04-ux/workbench.md "Tool windows"): two tool windows, Properties above Relations, each
// with a tab strip, collapsible to that strip, with a divider between them. Tabs are entries in TOOL_WINDOWS, so a
// new view (History, Comments, an extension's panel) is one entry.
import { useRef, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { usePanelPrefs } from "./Inspector";
import { PropertiesTabContent } from "./Properties";
import { RelationsTabContent } from "./Relations";

interface ToolTab {
  key: string;
  label: string;
  render(): ReactNode;
}

interface ToolWindowDef {
  key: string;
  label: string;
  /** Kept for the properties window so the workbench's region keeps its name and class. */
  className: string;
  tabs: ToolTab[];
}

const TOOL_WINDOWS: ToolWindowDef[] = [
  {
    key: "properties",
    label: "Properties",
    className: "properties",
    tabs: [{ key: "properties", label: "Properties", render: () => <PropertiesTabContent /> }],
  },
  {
    key: "relations",
    label: "Relations",
    className: "relations-window",
    tabs: [
      { key: "relationships", label: "Relationships", render: () => <RelationsTabContent tab="relationships" /> },
      { key: "trace", label: "Trace", render: () => <RelationsTabContent tab="trace" /> },
      { key: "occurs", label: "Occurs on", render: () => <RelationsTabContent tab="occurs" /> },
    ],
  },
];

export function Dock() {
  const split = usePanelPrefs((s) => s.dockSplit);
  const setSplit = usePanelPrefs((s) => s.setDockSplit);
  const collapsed = usePanelPrefs((s) => s.collapsed);
  const dock = useRef<HTMLDivElement>(null);
  const drag = (e: PointerEvent<HTMLDivElement>) => {
    const box = dock.current?.getBoundingClientRect();
    if (!box) return;
    e.preventDefault();
    const move = (m: globalThis.PointerEvent) => setSplit(((m.clientY - box.top) / box.height) * 100);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const [top, bottom] = TOOL_WINDOWS as [ToolWindowDef, ToolWindowDef];
  const bothOpen = !collapsed.includes(top.key) && !collapsed.includes(bottom.key);
  return (
    <div className="dock" ref={dock}>
      <ToolWindow def={top} style={bothOpen ? { flexBasis: `${split}%` } : undefined} />
      <div
        className="dock-divider"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize the tool windows"
        onPointerDown={bothOpen ? drag : undefined}
      />
      <ToolWindow def={bottom} />
    </div>
  );
}

function ToolWindow({ def, style }: { def: ToolWindowDef; style?: CSSProperties }) {
  const active = usePanelPrefs((s) => s.tabs[def.key]);
  const isCollapsed = usePanelPrefs((s) => s.collapsed.includes(def.key));
  const openTab = usePanelPrefs((s) => s.openTab);
  const toggleCollapsed = usePanelPrefs((s) => s.toggleCollapsed);
  const tab = def.tabs.find((t) => t.key === active) ?? def.tabs[0]!;
  return (
    <aside
      className={`tool-window ${def.className}${isCollapsed ? " collapsed" : ""}`}
      aria-label={def.label}
      style={isCollapsed ? undefined : style}
    >
      <div className="tool-tabs" role="tablist" aria-label={`${def.label} tabs`}>
        {def.tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={!isCollapsed && t.key === tab.key}
            onClick={() => openTab(def.key, t.key)}
          >
            {t.label}
          </button>
        ))}
        <span className="spacer" />
        <button
          className="collapse"
          aria-label={isCollapsed ? `Expand the ${def.label} window` : `Collapse the ${def.label} window`}
          title={isCollapsed ? "Expand" : "Collapse"}
          onClick={() => toggleCollapsed(def.key)}
        >
          {isCollapsed ? "+" : "–"}
        </button>
      </div>
      {!isCollapsed && (
        <div className="tool-body" role="tabpanel" aria-label={tab.label}>
          {tab.render()}
        </div>
      )}
    </aside>
  );
}
