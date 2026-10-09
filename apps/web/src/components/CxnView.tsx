// The CXN Builder (design/02-model/views-and-design-artifacts.md §15): two filtered panes and one connection type.
// Select rows on both sides (or drag one onto the other) and press Link; ticks and counts show what is connected.
// A saved one is a diagram of kind `cxn`; an unsaved one lives in its tab until *Save view*.
import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from "react";
import type { Metamodel, ModelState } from "@connectome/engine";
import type { CxnPane, Id, Scope, ScopeFilter } from "@connectome/model";
import {
  connectEdits,
  connectionKeys,
  connectionOptions,
  cxnDefinition,
  disconnectEdits,
  facets,
  otherSide,
  paneOf,
  planConnect,
  projectCxn,
  type Connection,
  type LinkPlan,
  type PaneModel,
  type Side,
} from "@connectome/views";
import { itemSelected, useModel, useWorkbench } from "../state/workbench";
import { notationFor } from "../notation";
import { cxnType, saveCxnPlan } from "../cxn";
import { targetFolder } from "../explorer";
import { Glyph } from "./Glyph";
import { SearchPicker } from "./SearchPicker";

/** Above this many pairs, *Link* shows what it will do first (§15.1). */
export const PREVIEW_ABOVE = 25;

type Selection = { left: Set<Id>; right: Set<Id> };
const LABEL: Record<Side, string> = { left: "Source", right: "Target" };
const scopeKey = (side: Side) => (side === "left" ? "rows" : "columns");

/** A saved CXN Builder (`id` names its diagram) or an unsaved one (`tabId` names its tab). */
export function CxnView(props: { id?: Id; tabId?: Id }) {
  const { state, metamodel } = useModel();
  const edit = useWorkbench((s) => s.edit);
  const notify = useWorkbench((s) => s.notify);
  const focus = useWorkbench((s) => s.select);
  const tab = useWorkbench((s) => s.tabs.find((t) => t.id === props.tabId));
  const updateTab = useWorkbench((s) => s.updateTab);
  const diagram = props.id ? state.diagrams.get(props.id) : undefined;
  const type = diagram ? metamodel.diagramType(diagram.diagramType)?.definition : cxnType(metamodel)?.definition;
  const definition = cxnDefinition(type, diagram ? diagram.definition : tab?.definition);
  const [selection, setSelection] = useState<Selection>(() => ({
    left: new Set(tab?.selectLeft ?? []),
    right: new Set(),
  }));
  const [query, setQuery] = useState<Record<Side, string>>({ left: "", right: "" });
  const [preview, setPreview] = useState<LinkPlan | null>(null);
  const model = projectCxn(state, metamodel, definition, selection);
  const connection = model.connection;

  if (props.id && !diagram) return <div className="empty-state muted">This view was deleted.</div>;
  if (props.tabId && !tab) return null;

  /** Changes the definition: a change for a saved view, the tab for an unsaved one. */
  const define = (label: string, set: Record<string, unknown>) => {
    if (diagram) edit(label, [{ edit: "setViewDefinition", diagramId: diagram.id, baseVersion: diagram.version, set }]);
    else if (tab) {
      const next: Record<string, unknown> = { ...(tab.definition ?? {}) };
      for (const [k, v] of Object.entries(set)) {
        if (v === null) delete next[k];
        else next[k] = v;
      }
      updateTab(tab.id, { definition: next });
    }
  };
  const setScope = (side: Side, label: string, from: ScopeFilter) =>
    define(label, { [scopeKey(side)]: { ...(side === "left" ? definition.rows : definition.columns), from } });
  const setPane = (side: Side, label: string, patch: Partial<CxnPane>) =>
    define(label, { panes: { ...definition.panes, [side]: { ...paneOf(definition, side), ...patch } } });

  const name = (id: Id) => state.objects.get(id)?.name ?? "?";
  const plan = connection ? planConnect(state, metamodel, connection, selection.left, selection.right) : null;

  const run = (p: LinkPlan) => {
    if (!connection) return;
    const what = connection.kind === "link" ? connection.linkKind.name : connection.type.name;
    if (p.add.length) {
      const n = p.add.length;
      edit(`Link ${n} as ${what}`, connectEdits(connection, p.add));
    } else if (p.have.length) {
      edit(`Unlink ${p.have.length} ${what}`, disconnectEdits(state, connection, p.have));
    }
  };
  const go = (p: LinkPlan | null = plan) => {
    if (!p) return;
    if (p.add.length && p.add.length + p.have.length + p.refused.length > PREVIEW_ABOVE) return setPreview(p);
    run(p);
  };

  const select = (side: Side, id: Id, how: "toggle" | "only" | "range", rows: Id[]) => {
    setSelection((s) => {
      const next = new Set(s[side]);
      if (how === "only") {
        next.clear();
        next.add(id);
      } else if (how === "range" && next.size) {
        const last = [...next].at(-1)!;
        const [a = -1, b = -1] = [rows.indexOf(last), rows.indexOf(id)].sort((x, y) => x - y);
        if (a >= 0) for (const r of rows.slice(a, b + 1)) next.add(r);
        else next.add(id);
      } else if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...s, [side]: next };
    });
    focus({ kind: "object", id });
  };

  /** Rows dragged from one pane onto a row of the other link to it. */
  const drop = (side: Side, targetId: Id, ids: Id[]) => {
    if (!connection) return notify("Choose a connection type first", "warning");
    const left = side === "left" ? [targetId] : ids;
    const right = side === "left" ? ids : [targetId];
    setSelection({ left: new Set(left), right: new Set(right) });
    const p = planConnect(state, metamodel, connection, left, right);
    if (!p.add.length) return notify(p.refused[0]?.reason ?? "Already connected", p.refused.length ? "error" : "info");
    go({ ...p, have: [] });
  };

  const options = connectionOptions(state, metamodel, definition);
  const chosen = connection ? `${connection.kind === "link" ? "link" : "type"}:${connection.key}` : "";
  const summary = (side: Side) => {
    const ids = [...selection[side]];
    if (!ids.length) return "Select rows";
    return ids.length > 2 ? `${ids.length} selected` : ids.map(name).join(", ");
  };
  const why = !connection
    ? "Choose a connection type."
    : !selection.left.size || !selection.right.size
      ? "Select rows on both sides, or drag rows onto a row on the other side."
      : !plan!.add.length && plan!.have.length && !plan!.refused.length
        ? `Every selected pair is already connected. Unlinking removes ${plan!.have.length}.`
        : !plan!.add.length
          ? (plan!.refused[0]?.reason ?? "Nothing to link")
          : [
              plan!.have.length && `${plan!.have.length} already connected, skipped`,
              plan!.refused.length && `${plan!.refused.length} refused by the rules`,
            ]
              .filter(Boolean)
              .join(" · ");
  const unlink = !!plan && !plan.add.length && plan.have.length > 0 && !plan.refused.length;
  const canGo = !!plan && (plan.add.length > 0 || unlink);
  const connName = connection ? (connection.kind === "link" ? connection.linkKind.name : connection.type.name) : "";

  const save = () => {
    const folder = targetFolder(state, itemSelected(useWorkbench.getState().selection));
    const p = saveCxnPlan(state, metamodel, definition, folder);
    if ("error" in p) return notify(p.error, "error");
    if (edit(p.label, p.edits)) {
      const ws = useWorkbench.getState();
      ws.closeTab(tab!.id);
      ws.openTab({ kind: "diagram", id: p.id });
      ws.select({ kind: "diagram", id: p.id });
    }
  };

  return (
    <div className="cxn-view">
      <div className="cxn-panes">
        {(["left", "right"] as Side[]).map((side) => (
          <PaneView
            key={side}
            side={side}
            state={state}
            metamodel={metamodel}
            scope={side === "left" ? definition.rows : definition.columns}
            pane={paneOf(definition, side)}
            model={model[side]}
            selected={selection[side]}
            query={query[side]}
            connection={connection}
            onQuery={(q) => setQuery((s) => ({ ...s, [side]: q }))}
            onScope={(label, from) => {
              setScope(side, label, from);
              setSelection((s) => ({ ...s, [side]: new Set() }));
            }}
            onPane={(label, patch) => setPane(side, label, patch)}
            onSelect={(id, how, rows) => select(side, id, how, rows)}
            onSelectAll={(ids) => setSelection((s) => ({ ...s, [side]: new Set(ids) }))}
            onUnlink={(id) => {
              if (!connection) return;
              const pairs = [...selection[otherSide(side)]].map((o): [Id, Id] => (side === "left" ? [id, o] : [o, id]));
              const edits = disconnectEdits(state, connection, pairs);
              if (edits.length) edit(`Unlink ${edits.length} ${connName}`, edits);
            }}
            onDrop={(target, ids) => drop(side, target, ids)}
            onEnter={() => canGo && go()}
          />
        ))}
      </div>
      <div className="cxn-strip" aria-label="Link builder">
        <span className="cxn-side" title={summary("left")}>
          {summary("left")}
        </span>
        <span className="cxn-connection">
          <select
            aria-label="Connection type"
            value={chosen}
            onChange={(e) => {
              const [kind, key] = e.target.value.split(":") as [string, string];
              const next: Connection | undefined =
                kind === "link"
                  ? (() => {
                      const linkKind = metamodel.linkKind(key);
                      return linkKind && { kind: "link", key, linkKind };
                    })()
                  : (() => {
                      const t = metamodel.relationshipType(key);
                      return t && { kind: "relationship", key, type: t };
                    })();
              if (next)
                define(
                  `Connect with ${next.kind === "link" ? next.linkKind.name : next.type.name}`,
                  connectionKeys(next),
                );
            }}
          >
            {!connection && <option value="">Choose a connection type…</option>}
            <optgroup label="Relationships">
              {options
                .filter((o) => o.kind === "relationship")
                .map((o) => (
                  <option key={o.value} value={o.value} disabled={!!o.refused} title={o.refused ?? undefined}>
                    {o.name}
                    {o.refused ? " (not allowed)" : ""}
                  </option>
                ))}
            </optgroup>
            <optgroup label="Links (anything to anything)">
              {options
                .filter((o) => o.kind === "link")
                .map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.name}
                  </option>
                ))}
            </optgroup>
          </select>
          <span aria-hidden>▶</span>
        </span>
        <span className="cxn-side" title={summary("right")}>
          {summary("right")}
        </span>
        <button
          title="Swap the panes"
          aria-label="Swap the panes"
          onClick={() => {
            define("Swap the panes", {
              rows: definition.columns,
              columns: definition.rows,
              panes: { left: definition.panes?.right ?? {}, right: definition.panes?.left ?? {} },
            });
            setSelection((s) => ({ left: s.right, right: s.left }));
          }}
        >
          ⇄
        </button>
        <button className={`primary${unlink ? " danger" : ""}`} disabled={!canGo} onClick={() => go()}>
          {unlink ? `Unlink ${plan!.have.length}` : `Link${plan?.add.length ? ` ${plan.add.length}` : ""}`}
        </button>
        {!diagram && (
          <button
            onClick={save}
            disabled={!cxnType(metamodel)}
            title={cxnType(metamodel) ? "Keep this as a view in the explorer" : "No CXN Builder type in the metamodel"}
          >
            Save view
          </button>
        )}
        <div className="cxn-why muted" role="status">
          {why}
        </div>
        {connection && (
          <div className="cxn-existing">
            {model.existing.length ? (
              <>
                <b>{model.existing.length}</b> existing “{connName}” connection{model.existing.length > 1 ? "s" : ""}{" "}
                between these two sets{" "}
                <button
                  className="link"
                  onClick={() =>
                    setSelection({
                      left: new Set(model.existing.map((p) => p[0])),
                      right: new Set(model.existing.map((p) => p[1])),
                    })
                  }
                >
                  Select them
                </button>
              </>
            ) : (
              <>No “{connName}” connections between these two sets yet</>
            )}
          </div>
        )}
      </div>
      {preview && connection && (
        <PreviewDialog
          plan={preview}
          connection={connection}
          name={name}
          leftCount={selection.left.size}
          rightCount={selection.right.size}
          onCancel={() => setPreview(null)}
          onConfirm={() => {
            run({ ...preview, have: [] });
            setPreview(null);
          }}
        />
      )}
    </div>
  );
}

function PaneView(props: {
  side: Side;
  state: ModelState;
  metamodel: Metamodel;
  scope: Scope;
  pane: CxnPane;
  model: PaneModel;
  selected: ReadonlySet<Id>;
  query: string;
  connection: Connection | undefined;
  onQuery(q: string): void;
  onScope(label: string, from: ScopeFilter): void;
  onPane(label: string, patch: Partial<CxnPane>): void;
  onSelect(id: Id, how: "toggle" | "only" | "range", rows: Id[]): void;
  onSelectAll(ids: Id[]): void;
  onUnlink(id: Id): void;
  onDrop(targetId: Id, ids: Id[]): void;
  onEnter(): void;
}) {
  const { side, state, metamodel, scope, pane, model, selected, query } = props;
  const from = scope.from;
  const [adding, setAdding] = useState(false);
  const [dropOn, setDropOn] = useState<Id | null>(null);
  const q = query.trim().toLocaleLowerCase();
  const matches = (o: { name: string; aliases?: string[] }) =>
    !q || o.name.toLocaleLowerCase().includes(q) || (o.aliases ?? []).some((a) => a.toLocaleLowerCase().includes(q));
  // Search keeps a heading only when something under it still shows.
  const rows = model.rows.filter((r, i) => {
    if (!r.heading) return matches(r.object);
    const next = model.rows.slice(i + 1).find((x) => x.heading || x.depth === 0);
    const end = next ? model.rows.indexOf(next) : model.rows.length;
    return model.rows.slice(i + 1, end).some((x) => matches(x.object));
  });
  const ids = rows.filter((r) => !r.heading).map((r) => r.object.id);
  const typeName = (t: string) => metamodel.objectType(t)?.definition.name ?? t;
  const valueLabel = (key: string, value: string) => {
    const list = metamodel.propertyType(key)?.valueList;
    return (list && metamodel.valueList(list)?.values.find((v) => v.key === value)?.label) ?? value;
  };
  const chips: { label: string; remove(): ScopeFilter }[] = [
    ...Object.entries(from.where ?? {}).flatMap(([key, { in: values }]) =>
      values.map((v) => ({
        label: `${metamodel.propertyType(key)?.name ?? key}: ${valueLabel(key, v)}`,
        remove: (): ScopeFilter => {
          const rest = values.filter((x) => x !== v);
          const where = { ...from.where };
          if (rest.length) where[key] = { in: rest };
          else delete where[key];
          return { ...from, where: Object.keys(where).length ? where : undefined };
        },
      })),
    ),
    ...(from.related
      ? [
          {
            label: `Related to ${state.objects.get(from.related.id)?.name ?? "(deleted)"}`,
            remove: (): ScopeFilter => ({ ...from, related: undefined }),
          },
        ]
      : []),
  ];

  const keyDown = (e: KeyboardEvent<HTMLDivElement>, id: Id) => {
    const at = ids.indexOf(id);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = ids[at + (e.key === "ArrowDown" ? 1 : -1)];
      if (next) (document.querySelector(`[data-cxn="${side}:${next}"]`) as HTMLElement | null)?.focus();
    } else if (e.key === " ") {
      e.preventDefault();
      props.onSelect(id, "toggle", ids);
    } else if (e.key === "Enter") {
      e.preventDefault();
      props.onEnter();
    }
  };
  const dragStart = (e: DragEvent, id: Id) => {
    const dragged = selected.has(id) ? [...selected] : [id];
    e.dataTransfer.setData("application/x-cxn", JSON.stringify({ side, ids: dragged }));
    e.dataTransfer.effectAllowed = "link";
  };
  const dropped = (e: DragEvent, id: Id) => {
    setDropOn(null);
    try {
      const data = JSON.parse(e.dataTransfer.getData("application/x-cxn")) as { side: Side; ids: Id[] };
      if (data.side === side) return;
      e.preventDefault();
      props.onDrop(id, data.ids);
    } catch {
      // Not a drag from a CXN pane.
    }
  };

  return (
    <section className="cxn-pane" aria-label={`${LABEL[side]} pane`}>
      <header>
        <h3>{LABEL[side]}</h3>
        <span className="muted cxn-count">
          {ids.length} shown
          {model.hidden ? ` · ${model.hidden} connected hidden` : ""} · {selected.size} selected
        </span>
      </header>
      <div className="cxn-chips">
        <select
          className="chip type"
          aria-label={`${LABEL[side]} type`}
          value={from.type?.[0] ?? ""}
          onChange={(e) =>
            props.onScope(`${LABEL[side]}: ${e.target.value ? typeName(e.target.value) : "anything"}`, {
              ...from,
              type: e.target.value ? [e.target.value] : undefined,
              where: undefined,
            })
          }
        >
          <option value="">Anything</option>
          {metamodel.allObjectTypes().map((t) => (
            <option key={t.definition.key} value={t.definition.key}>
              {t.definition.name}
            </option>
          ))}
        </select>
        {chips.map((c) => (
          <span key={c.label} className="chip">
            {c.label}
            <button
              aria-label={`Remove filter ${c.label}`}
              onClick={() => props.onScope(`Remove ${c.label}`, c.remove())}
            >
              ×
            </button>
          </span>
        ))}
        <button className="chip add" aria-expanded={adding} onClick={() => setAdding((a) => !a)}>
          + Filter
        </button>
        {adding && (
          <FilterMenu
            metamodel={metamodel}
            model={model}
            from={from}
            onClose={() => setAdding(false)}
            onAdd={(label, next) => {
              setAdding(false);
              props.onScope(label, next);
            }}
          />
        )}
      </div>
      <div className="cxn-tools">
        <input
          type="search"
          aria-label={`Search ${LABEL[side].toLowerCase()}`}
          placeholder="Search names"
          value={query}
          onChange={(e) => props.onQuery(e.target.value)}
        />
        <span className="seg" role="group" aria-label="Shape">
          {(["tree", "list"] as const).map((s) => (
            <button
              key={s}
              aria-pressed={(pane.shape ?? "tree") === s}
              onClick={() => props.onPane(`Show ${LABEL[side].toLowerCase()} as a ${s}`, { shape: s })}
            >
              {s === "tree" ? "Tree" : "List"}
            </button>
          ))}
        </span>
        <span className="seg" role="group" aria-label="Sort">
          {(["name", "rank"] as const).map((s) => (
            <button
              key={s}
              aria-pressed={(pane.sort ?? "name") === s}
              onClick={() => props.onPane(`Sort ${LABEL[side].toLowerCase()} by ${s}`, { sort: s })}
            >
              {s === "name" ? "A–Z" : "Rank"}
            </button>
          ))}
        </span>
        <label className="check">
          <input
            type="checkbox"
            checked={!!pane.hideConnected}
            onChange={(e) =>
              props.onPane(e.target.checked ? "Hide connected" : "Show connected", { hideConnected: e.target.checked })
            }
          />
          Hide connected
        </label>
      </div>
      <div className="cxn-rows" role="listbox" aria-multiselectable="true" aria-label={`${LABEL[side]} rows`}>
        {rows.length === 0 && (
          <div className="empty-state muted">
            {model.members.length && model.hidden === model.members.length
              ? "Everything here is connected. Untick Hide connected to see it."
              : "Nothing matches. Remove a filter or choose another type."}
          </div>
        )}
        {rows.map((r) => {
          if (r.heading)
            return (
              <div key={`h:${r.object.id}`} className="cxn-row heading" style={{ paddingLeft: 8 + r.depth * 16 }}>
                {r.object.name}
              </div>
            );
          const n = notationFor(metamodel.objectType(r.object.type));
          const on = selected.has(r.object.id);
          return (
            <div
              key={r.object.id}
              data-cxn={`${side}:${r.object.id}`}
              className={`cxn-row${on ? " on" : ""}${dropOn === r.object.id ? " drop" : ""}`}
              role="option"
              aria-selected={on}
              tabIndex={0}
              draggable
              style={{ paddingLeft: 8 + r.depth * 16 }}
              onClick={(e: MouseEvent) => props.onSelect(r.object.id, e.shiftKey ? "range" : "toggle", ids)}
              onKeyDown={(e) => keyDown(e, r.object.id)}
              onDragStart={(e) => dragStart(e, r.object.id)}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes("application/x-cxn")) return;
                e.preventDefault();
                setDropOn(r.object.id);
              }}
              onDragLeave={() => setDropOn((d) => (d === r.object.id ? null : d))}
              onDrop={(e) => dropped(e, r.object.id)}
            >
              <span className="box" aria-hidden>
                {on ? "✓" : ""}
              </span>
              <Glyph glyph={n.glyph} colour={n.ink} />
              <span className="name">{r.object.name}</span>
              <span className="muted meta">{typeName(r.object.type)}</span>
              <span className="cxn-end">
                {r.count > 0 && (
                  <span
                    className="cxn-dot"
                    title={`${r.count} connection${r.count > 1 ? "s" : ""} to the other side's set`}
                    aria-label={`${r.count} connected`}
                  >
                    {r.count}
                  </span>
                )}
                {r.tick ? (
                  <button
                    className={`cxn-tick ${r.tick}`}
                    title={`Connected to ${r.tick} of the other side's selection. Click to unlink.`}
                    aria-label={`Unlink ${r.object.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      props.onUnlink(r.object.id);
                    }}
                  >
                    {r.tick === "all" ? "✓" : "◐"}
                  </button>
                ) : (
                  <span className="cxn-tick" />
                )}
              </span>
            </div>
          );
        })}
      </div>
      <footer>
        <button className="link" onClick={() => props.onSelectAll(ids)}>
          Select all
        </button>
        <button className="link" onClick={() => props.onSelectAll([])}>
          Clear selection
        </button>
      </footer>
    </section>
  );
}

/** + Filter: a pane's list properties with a count per value, and *Related to* an element found by name. */
function FilterMenu(props: {
  metamodel: Metamodel;
  model: PaneModel;
  from: ScopeFilter;
  onAdd(label: string, from: ScopeFilter): void;
  onClose(): void;
}) {
  const { metamodel, model, from, onClose } = props;
  const ref = useRef<HTMLDivElement>(null);
  const list = useMemo(() => facets(metamodel, model.members), [metamodel, model.members]);
  useEffect(() => {
    const away = (e: globalThis.MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const esc = (e: globalThis.KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("mousedown", away);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", away);
      window.removeEventListener("keydown", esc);
    };
  }, [onClose]);
  return (
    <div ref={ref} className="cxn-filter-menu" role="dialog" aria-label="Add a filter">
      <h4>Related to an element</h4>
      <SearchPicker
        label="Related to"
        autoFocus
        placeholder="Type a name…"
        scope={{ objects: () => true }}
        onPick={(f) =>
          props.onAdd(`Related to ${f.name}`, {
            ...from,
            related: { id: f.id },
          })
        }
      />
      {list.map((f) => (
        <div key={f.key} className="cxn-facet">
          <h4>{f.name}</h4>
          {f.values.map((v) => {
            const used = from.where?.[f.key]?.in.includes(v.key) ?? false;
            return (
              <button
                key={v.key}
                disabled={used}
                onClick={() =>
                  props.onAdd(`${f.name}: ${v.label}`, {
                    ...from,
                    where: { ...from.where, [f.key]: { in: [...(from.where?.[f.key]?.in ?? []), v.key] } },
                  })
                }
              >
                <span>{v.label}</span>
                <span className="cxn-dot">{v.count}</span>
              </button>
            );
          })}
        </div>
      ))}
      {list.length === 0 && <p className="muted">No list properties to filter by on these elements.</p>}
    </div>
  );
}

function PreviewDialog(props: {
  plan: LinkPlan;
  connection: Connection;
  name(id: Id): string;
  leftCount: number;
  rightCount: number;
  onCancel(): void;
  onConfirm(): void;
}) {
  const { plan, connection, name } = props;
  const what = connection.kind === "link" ? connection.linkKind.name : connection.type.name;
  return (
    <div className="backdrop" onClick={props.onCancel}>
      <div
        className="dialog cxn-preview"
        role="dialog"
        aria-modal="true"
        aria-label="Link preview"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && props.onCancel()}
      >
        <h2>
          Link {props.leftCount} × {props.rightCount} as “{what}”?
        </h2>
        <dl className="cxn-stats">
          <dt>{plan.add.length}</dt>
          <dd>new</dd>
          <dt>{plan.have.length}</dt>
          <dd>already connected, skipped</dd>
          <dt>{plan.refused.length}</dt>
          <dd>refused by the rules</dd>
        </dl>
        {plan.refused.length > 0 && (
          <ul>
            {plan.refused.slice(0, 8).map((r) => (
              <li key={r.pair.join("|")}>
                {name(r.pair[0])} → {name(r.pair[1])}: {r.reason}
              </li>
            ))}
            {plan.refused.length > 8 && <li>and {plan.refused.length - 8} more</li>}
          </ul>
        )}
        <p className="muted">One change: Undo removes all of them.</p>
        <div className="actions">
          <button onClick={props.onCancel}>Cancel</button>
          <button className="primary" autoFocus onClick={props.onConfirm}>
            Create {plan.add.length}
          </button>
        </div>
      </div>
    </div>
  );
}
