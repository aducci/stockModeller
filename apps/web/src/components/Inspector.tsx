// The generic inspector (design/04-ux/workbench.md "Properties panel"): a compact header (name, type, key, folder,
// description), a filter toolbar, then collapsible sections. Property sections are grids whose editors come from a
// registry keyed by the property type, so a new data type or editor hint is one entry, not a new panel.
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { create } from "zustand";
import type { ModelState, Metamodel } from "@connectome/engine";
import type { Id, PropertySet, PropertyValue } from "@connectome/model";
import { useWorkbench } from "../state/workbench";
import { displayValue, type EditorKind, type Field, type FieldGroup } from "../inspector";
import { byName } from "../text";

// ---------------------------------------------------------------- remembered layout (per browser)

interface PanelPrefs {
  hideEmpty: boolean;
  /** Section ids the user closed (or opened, for sections closed by default). */
  toggled: string[];
  /** Width of the label column, in percent of the grid. */
  split: number;
  /** The property set chosen per object type ("" or absent: all properties). */
  chosenSets: Record<string, string>;
  /** The user's own property sets, per object type, until user profiles exist. */
  mySets: Record<string, PropertySet[]>;
  /** The open tab of each tool window, and the windows collapsed to their tab strip. */
  tabs: Record<string, string>;
  collapsed: string[];
  /** Height of the top tool window, in percent of the dock. */
  dockSplit: number;
  /** The dock's width in pixels, and whether it is minimised to a narrow rail. */
  dockWidth: number;
  dockMinimised: boolean;
  /** The property columns the object viewer shows, as editing shortcuts (none by default). */
  viewerColumns: string[];
  setHideEmpty(on: boolean): void;
  toggle(id: string): void;
  setToggled(ids: string[]): void;
  setSplit(split: number): void;
  chooseSet(type: string, key: string): void;
  saveMySet(type: string, set: PropertySet): void;
  deleteMySet(type: string, key: string): void;
  openTab(window: string, tab: string): void;
  toggleCollapsed(window: string): void;
  setDockSplit(split: number): void;
  setDockWidth(width: number): void;
  setDockMinimised(minimised: boolean): void;
  setViewerColumns(keys: string[]): void;
}

const PREFS_KEY = "connectome.properties";
const SAVED = [
  "hideEmpty",
  "toggled",
  "split",
  "chosenSets",
  "mySets",
  "tabs",
  "collapsed",
  "dockSplit",
  "dockWidth",
  "dockMinimised",
  "viewerColumns",
] as const;

function loadPrefs(): Partial<PanelPrefs> {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as Partial<PanelPrefs>;
  } catch {
    return {};
  }
}

export const usePanelPrefs = create<PanelPrefs>((set, get) => {
  const save = () => {
    try {
      const prefs = get();
      localStorage.setItem(PREFS_KEY, JSON.stringify(Object.fromEntries(SAVED.map((k) => [k, prefs[k]]))));
    } catch {
      // Private windows and blocked storage: the panel works, it just forgets.
    }
  };
  const update = (patch: (s: PanelPrefs) => Partial<PanelPrefs>) => (set(patch), save());
  return {
    hideEmpty: false,
    toggled: [],
    split: 42,
    chosenSets: {},
    mySets: {},
    tabs: {},
    collapsed: [],
    dockSplit: 58,
    dockWidth: 320,
    dockMinimised: false,
    viewerColumns: [],
    ...loadPrefs(),
    setHideEmpty: (hideEmpty) => update(() => ({ hideEmpty })),
    toggle: (id) =>
      update((s) => ({ toggled: s.toggled.includes(id) ? s.toggled.filter((t) => t !== id) : [...s.toggled, id] })),
    setToggled: (toggled) => update(() => ({ toggled })),
    setSplit: (split) => update(() => ({ split: Math.min(65, Math.max(25, split)) })),
    chooseSet: (type, key) => update((s) => ({ chosenSets: { ...s.chosenSets, [type]: key } })),
    saveMySet: (type, mine) =>
      update((s) => {
        const sets = s.mySets[type] ?? [];
        const at = sets.findIndex((x) => x.key === mine.key);
        return {
          mySets: { ...s.mySets, [type]: at < 0 ? [...sets, mine] : sets.map((x, i) => (i === at ? mine : x)) },
        };
      }),
    deleteMySet: (type, key) =>
      update((s) => ({
        mySets: { ...s.mySets, [type]: (s.mySets[type] ?? []).filter((x) => x.key !== key) },
        chosenSets: { ...s.chosenSets, [type]: "" },
      })),
    openTab: (window, tab) =>
      update((s) => ({ tabs: { ...s.tabs, [window]: tab }, collapsed: s.collapsed.filter((w) => w !== window) })),
    toggleCollapsed: (window) =>
      update((s) => ({
        collapsed: s.collapsed.includes(window) ? s.collapsed.filter((w) => w !== window) : [...s.collapsed, window],
      })),
    setDockSplit: (dockSplit) => update(() => ({ dockSplit: Math.min(85, Math.max(15, dockSplit)) })),
    setDockWidth: (dockWidth) => update(() => ({ dockWidth: Math.round(Math.min(720, Math.max(240, dockWidth))) })),
    setDockMinimised: (dockMinimised) => update(() => ({ dockMinimised })),
    setViewerColumns: (viewerColumns) => update(() => ({ viewerColumns })),
  };
});

// ---------------------------------------------------------------- header

/** Name, a meta line (type, key, folder) and the description: three lines when the description is short. */
export function InspectorHeader(props: {
  name: string;
  /** Without it the name is shown read-only. Returns whether the edit was accepted. */
  onRename?(name: string): boolean;
  title?: ReactNode;
  type: string;
  itemKey?: string | null;
  path?: string;
  description?: string;
  onDescribe?(description: string): boolean;
  children?: ReactNode;
}) {
  const { name, onRename, title, type, itemKey, path, description, onDescribe, children } = props;
  return (
    <header className="props-header">
      {title ??
        (onRename ? (
          <TextField
            label="Name"
            className="name bare"
            value={name}
            onCommit={(next) => next.trim() !== "" && onRename(next.trim())}
          />
        ) : (
          <h2 className="name">{name}</h2>
        ))}
      <div className="meta">
        <span className="chip">{type}</span>
        {itemKey && <span className="mono">{itemKey}</span>}
        {path !== undefined && (
          <span className="muted breadcrumb" title={path}>
            📁 {path}
          </span>
        )}
        {children}
      </div>
      {onDescribe && (
        <TextField
          label="Description"
          className="description bare"
          value={description ?? ""}
          placeholder="Add a description"
          multiline
          onCommit={(text) => onDescribe(text.trim())}
        />
      )}
    </header>
  );
}

// ---------------------------------------------------------------- toolbar and sections

/** The property sets offered for an item, and what to do with a choice. */
export interface SetPicker {
  /** The package's sets for the item's type. */
  shared: PropertySet[];
  /** The user's own sets for the type. */
  mine: PropertySet[];
  /** The chosen set's key; "" for all properties. */
  chosen: string;
  /** The key of the user's set being edited, if any. */
  editing: string | null;
  onChoose(key: string): void;
  onSaveAs(name: string): void;
  onEdit(key: string | null): void;
  onDelete(key: string): void;
}

// Set keys start with a letter, so these cannot collide with one.
const SAVE_AS = "+saveAs";
const EDIT = "+edit";
const DELETE = "+delete";

/** Set picker, filter box, Hide empty (with what it hides) and collapse/expand all. `/` focuses the filter. */
export function InspectorToolbar(props: {
  filter: string;
  onFilter(text: string): void;
  hidden: number;
  sectionIds: string[];
  sets?: SetPicker;
}) {
  const { filter, onFilter, hidden, sectionIds, sets } = props;
  const [naming, setNaming] = useState(false);
  const hideEmpty = usePanelPrefs((s) => s.hideEmpty);
  const setHideEmpty = usePanelPrefs((s) => s.setHideEmpty);
  const toggled = usePanelPrefs((s) => s.toggled);
  const setToggled = usePanelPrefs((s) => s.setToggled);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key !== "/" || target.closest("input, textarea, select, [contenteditable]")) return;
      if (!input.current?.closest(".properties, .object-page")) return;
      e.preventDefault();
      input.current.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  const anyOpen = sectionIds.some((id) => !toggled.includes(id));
  const ownChosen = sets?.mine.some((x) => x.key === sets.chosen) ?? false;
  if (sets && naming)
    return (
      <div className="inspector-toolbar">
        <input
          autoFocus
          aria-label="Name of the new property set"
          placeholder="Name the set, then Enter"
          onKeyDown={(e) => {
            const name = e.currentTarget.value.trim();
            if (e.key === "Enter" && name) {
              sets.onSaveAs(name);
              setNaming(false);
            } else if (e.key === "Escape") setNaming(false);
          }}
          onBlur={() => setNaming(false)}
        />
      </div>
    );
  if (sets?.editing)
    return (
      <div className="inspector-toolbar editing-set">
        <span className="hint">
          Tick the properties for <b>{sets.mine.find((x) => x.key === sets.editing)?.name}</b>
        </span>
        <button className="toggle" aria-pressed="true" onClick={() => sets.onEdit(null)}>
          Done
        </button>
      </div>
    );
  return (
    <div className="inspector-toolbar">
      {sets && (
        <select
          className="set-picker"
          aria-label="Property set"
          value={sets.chosen}
          onChange={(e) => {
            const v = e.target.value;
            if (v === SAVE_AS) setNaming(true);
            else if (v === EDIT) sets.onEdit(sets.chosen);
            else if (v === DELETE) sets.onDelete(sets.chosen);
            else sets.onChoose(v);
          }}
        >
          <option value="">All properties</option>
          {sets.shared.length > 0 && (
            <optgroup label="Shared sets">
              {sets.shared.map((x) => (
                <option key={x.key} value={x.key}>
                  {x.name}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="My sets">
            {sets.mine.map((x) => (
              <option key={x.key} value={x.key}>
                {x.name}
              </option>
            ))}
            <option value={SAVE_AS}>Save as set…</option>
            {ownChosen && <option value={EDIT}>Edit this set…</option>}
            {ownChosen && <option value={DELETE}>Delete this set</option>}
          </optgroup>
        </select>
      )}
      <input
        ref={input}
        type="search"
        aria-label="Filter properties"
        placeholder={sets ? "Filter  /" : "Filter properties  /"}
        value={filter}
        onChange={(e) => onFilter(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onFilter("")}
      />
      <button
        className="toggle icon"
        aria-pressed={hideEmpty}
        aria-label={hideEmpty && hidden > 0 ? `Hide empty · ${hidden}` : "Hide empty"}
        title={
          hideEmpty ? `Showing only properties with a value (${hidden} hidden)` : "Hide properties that have no value"
        }
        onClick={() => setHideEmpty(!hideEmpty)}
      >
        ∅{hideEmpty && hidden > 0 && <span className="badge">{hidden}</span>}
      </button>
      <button
        className="toggle"
        title={anyOpen ? "Collapse all sections" : "Expand all sections"}
        aria-label={anyOpen ? "Collapse all sections" : "Expand all sections"}
        onClick={() =>
          setToggled(
            anyOpen ? [...new Set([...toggled, ...sectionIds])] : toggled.filter((id) => !sectionIds.includes(id)),
          )
        }
      >
        {anyOpen ? "⊟" : "⊞"}
      </button>
    </div>
  );
}
/** A collapsible section with a sticky header; open or closed is remembered by `id`. */
export function Section(props: {
  id: string;
  title: string;
  /** Shown at the right of the header: a count, or filled/total. */
  count?: string | number;
  className?: string;
  /** Closed until the user opens it. */
  closedByDefault?: boolean;
  children: ReactNode;
}) {
  const { id, title, count, className, closedByDefault, children } = props;
  const toggledOn = usePanelPrefs((s) => s.toggled.includes(id));
  const toggle = usePanelPrefs((s) => s.toggle);
  const open = closedByDefault ? toggledOn : !toggledOn;
  return (
    <section className={`group${className ? ` ${className}` : ""}`} data-section={id} data-open={open}>
      <h3>
        <button className="section-toggle" aria-expanded={open} onClick={() => toggle(id)}>
          <span className="caret" aria-hidden="true" />
          {title}
          {count !== undefined && <span className="count">{count}</span>}
        </button>
      </h3>
      {open && <div className="section-body">{children}</div>}
    </section>
  );
}

// ---------------------------------------------------------------- property grid

export interface GridContext {
  state: ModelState;
  metamodel: Metamodel;
  /** The item being edited, left out of object pickers. */
  itemId: Id;
  /** Shown when a list property has no value (a type default, for instance). */
  placeholder?(field: Field): string | undefined;
  readOnly?(field: Field): boolean;
  commit(field: Field, value: PropertyValue | null): boolean;
  /** Editing a property set: a checkbox on every row says whether the property is in it. */
  picking?: { has(key: string): boolean; toggle(key: string): void };
}

/** Groups of property fields as sections, each a two-column grid with a draggable splitter. */
export function PropertyGroups({ groups, ctx, prefix }: { groups: FieldGroup[]; ctx: GridContext; prefix: string }) {
  return (
    <>
      {groups.map((g) => (
        <Section key={g.key} id={`${prefix}:${g.key}`} title={g.name} count={`${g.filled}/${g.total}`}>
          <PropertyGrid fields={g.fields} ctx={ctx} />
        </Section>
      ))}
    </>
  );
}

function PropertyGrid({ fields, ctx }: { fields: Field[]; ctx: GridContext }) {
  const split = usePanelPrefs((s) => s.split);
  const setSplit = usePanelPrefs((s) => s.setSplit);
  const grid = useRef<HTMLDivElement>(null);
  const drag = (e: PointerEvent<HTMLDivElement>) => {
    const box = grid.current?.getBoundingClientRect();
    if (!box) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const move = (m: globalThis.PointerEvent) => setSplit(((m.clientX - box.left) / box.width) * 100);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  return (
    <div className="prop-grid" ref={grid} style={{ gridTemplateColumns: `${split}% minmax(0, 1fr)` }}>
      {fields.map((field) => (
        <PropertyRow key={field.pt.key} field={field} ctx={ctx} />
      ))}
      <div
        className="splitter"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the label column"
        style={{ left: `${split}%` }}
        onPointerDown={drag}
      />
    </div>
  );
}

function PropertyRow({ field, ctx }: { field: Field; ctx: GridContext }) {
  const { pt } = field;
  const id = `prop-${pt.key}`;
  const readOnly = field.editor === "calculated" || (ctx.readOnly?.(field) ?? false);
  const clearable = !field.empty && !readOnly && field.editor !== "switch" && field.editor !== "checkbox";
  return (
    <div className="prop-row" data-property={pt.key} data-editor={field.editor}>
      <label htmlFor={id} title={pt.help ? `${pt.name}: ${pt.help}` : pt.name}>
        {ctx.picking && (
          <input
            type="checkbox"
            className="pick"
            aria-label={`Include ${pt.name} in the set`}
            checked={ctx.picking.has(pt.key)}
            onChange={() => ctx.picking!.toggle(pt.key)}
            onClick={(e) => e.stopPropagation()}
          />
        )}
        {pt.name}
        {pt.required && (
          <span className="required" title="Required">
            *
          </span>
        )}
      </label>
      <div className="editor">
        {EDITORS[field.editor]({ id, field, ctx, readOnly })}
        {pt.unit && <span className="unit">{pt.unit}</span>}
        {clearable && (
          <button
            className="clear"
            title={`Clear ${pt.name}`}
            aria-label="Clear value"
            onClick={() => ctx.commit(field, null)}
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- the editor registry

interface EditorProps {
  id: string;
  field: Field;
  ctx: GridContext;
  readOnly: boolean;
}

const str = (v: PropertyValue | null) => (typeof v === "string" ? v : "");

/** One editor per kind (inspector.ts `editorFor` chooses). Each commits one value, or null to clear. */
const EDITORS: Record<EditorKind, (p: EditorProps) => ReactNode> = {
  text: ({ id, field, ctx, readOnly }) => (
    <TextField
      id={id}
      label={field.pt.name}
      className="value"
      value={str(field.value)}
      placeholder="Empty"
      readOnly={readOnly}
      onCommit={(t) => ctx.commit(field, t.trim() === "" ? null : t)}
    />
  ),
  multiline: ({ id, field, ctx, readOnly }) => (
    <TextField
      id={id}
      label={field.pt.name}
      className="value"
      value={str(field.value)}
      placeholder="Empty"
      multiline
      readOnly={readOnly}
      onCommit={(t) => ctx.commit(field, t.trim() === "" ? null : t)}
    />
  ),
  url: (p) => <LinkEditor {...p} />,
  number: ({ id, field, ctx, readOnly }) => (
    <TextField
      id={id}
      label={field.pt.name}
      className="value num"
      type="number"
      value={typeof field.value === "number" ? String(field.value) : ""}
      placeholder="Empty"
      readOnly={readOnly}
      onCommit={(t) => ctx.commit(field, t.trim() === "" ? null : Number(t))}
    />
  ),
  money: ({ id, field, ctx, readOnly }) => {
    const money = field.value && typeof field.value === "object" && !Array.isArray(field.value) ? field.value : null;
    const currency = money?.currency ?? "EUR";
    return (
      <TextField
        id={id}
        label={field.pt.name}
        className="value num"
        type="number"
        value={money ? String(money.amount) : ""}
        placeholder="Empty"
        suffix={currency}
        readOnly={readOnly}
        onCommit={(t) => ctx.commit(field, t.trim() === "" ? null : { amount: Number(t), currency })}
      />
    );
  },
  date: ({ id, field, ctx, readOnly }) => (
    <TextField
      id={id}
      label={field.pt.name}
      className="value"
      type="date"
      value={str(field.value)}
      readOnly={readOnly}
      onCommit={(t) => ctx.commit(field, t || null)}
    />
  ),
  switch: ({ id, field, ctx, readOnly }) => (
    <button
      id={id}
      className="switch"
      role="switch"
      aria-checked={field.value === true}
      aria-label={field.pt.name}
      disabled={readOnly}
      onClick={() => ctx.commit(field, field.value !== true)}
    />
  ),
  checkbox: ({ id, field, ctx, readOnly }) => (
    <input
      id={id}
      type="checkbox"
      checked={field.value === true}
      disabled={readOnly}
      onChange={(e) => ctx.commit(field, e.target.checked)}
    />
  ),
  dropdown: ({ id, field, ctx, readOnly }) => {
    const chosen = field.list?.values.find((v) => v.key === field.value);
    const fallback = ctx.placeholder?.(field);
    return (
      <>
        {chosen?.color && <span className="swatch" style={{ background: chosen.color }} aria-hidden="true" />}
        <select
          id={id}
          className={`value${field.empty ? " is-empty" : ""}`}
          value={str(field.value)}
          disabled={readOnly}
          onChange={(e) => ctx.commit(field, e.target.value || null)}
        >
          <option value="">{fallback ?? "Empty"}</option>
          {field.list?.values.map((v) => (
            <option key={v.key} value={v.key}>
              {v.label}
            </option>
          ))}
        </select>
      </>
    );
  },
  segmented: ({ id, field, ctx, readOnly }) => (
    <span className="segmented" id={id} role="radiogroup" aria-label={field.pt.name}>
      {field.list?.values.map((v) => (
        <button
          key={v.key}
          role="radio"
          aria-checked={field.value === v.key}
          disabled={readOnly}
          onClick={() => ctx.commit(field, field.value === v.key ? null : v.key)}
        >
          {v.label}
        </button>
      ))}
    </span>
  ),
  rating: ({ id, field, ctx, readOnly }) => {
    const values = field.list?.values ?? [];
    const at = values.findIndex((v) => v.key === field.value);
    const colour = at >= 0 ? values[at]!.color : undefined;
    return (
      <span className="rating" id={id} role="radiogroup" aria-label={field.pt.name}>
        {values.map((v, i) => (
          <button
            key={v.key}
            role="radio"
            className={i <= at ? "on" : undefined}
            style={i <= at && colour ? { background: colour } : undefined}
            aria-checked={i === at}
            aria-label={v.label}
            title={v.label}
            disabled={readOnly}
            onClick={() => ctx.commit(field, i === at ? null : v.key)}
          />
        ))}
        <span className="rating-label">{at >= 0 ? values[at]!.label : (ctx.placeholder?.(field) ?? "Empty")}</span>
      </span>
    );
  },
  chips: ({ id, field, ctx, readOnly }) => {
    const chosen = new Set(Array.isArray(field.value) ? field.value.map(String) : []);
    const keys = field.list?.values.map((v) => v.key) ?? [];
    return (
      <span className="chips" id={id} role="group" aria-label={field.pt.name}>
        {field.list?.values.map((v) => (
          <button
            key={v.key}
            aria-pressed={chosen.has(v.key)}
            disabled={readOnly}
            onClick={() => {
              const next = keys.filter((k) => (k === v.key ? !chosen.has(k) : chosen.has(k)));
              ctx.commit(field, next.length ? next : null);
            }}
          >
            {v.label}
          </button>
        ))}
      </span>
    );
  },
  objectRef: ({ id, field, ctx, readOnly }) => <ObjectRefEditor id={id} field={field} ctx={ctx} readOnly={readOnly} />,
  calculated: ({ id, field }) => (
    <span className="readonly calculated" id={id}>
      <span aria-hidden="true">ƒ</span> {field.value === null ? "—" : displayValue(field.value, field.list)}
    </span>
  ),
};

/** A link: shown as one (host and path, opening in a new tab) with a pencil to edit; a field while empty or editing. */
function LinkEditor({ id, field, ctx, readOnly }: EditorProps) {
  const [editing, setEditing] = useState(false);
  const href = str(field.value);
  const safe = /^https?:\/\//i.test(href);
  if (href && safe && !editing)
    return (
      <>
        <a className="link-value" id={id} href={href} target="_blank" rel="noreferrer noopener" title={href}>
          {href.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "")}
        </a>
        {!readOnly && (
          <button
            className="link edit-link"
            title={`Edit ${field.pt.name}`}
            aria-label={`Edit ${field.pt.name}`}
            onClick={() => setEditing(true)}
          >
            ✎
          </button>
        )}
      </>
    );
  return (
    <TextField
      id={id}
      label={field.pt.name}
      className="value"
      type="url"
      value={href}
      placeholder="https://…"
      readOnly={readOnly}
      autoFocus={editing}
      onCommit={(t) => {
        setEditing(false);
        const next = t.trim();
        // Only web links: anything else would be stored but never shown as a link.
        if (next !== "" && !/^https?:\/\//i.test(next)) return ctx.commit(field, `https://${next}`);
        return ctx.commit(field, next === "" ? null : next);
      }}
      onCancel={() => setEditing(false)}
    />
  );
}

function ObjectRefEditor({ id, field, ctx, readOnly }: EditorProps) {
  const select = useWorkbench((s) => s.select);
  const allowed = field.pt.objectTypes ?? [];
  const choices = [...ctx.state.objects.live()]
    .filter((o) => o.id !== ctx.itemId && (allowed.length === 0 || allowed.some((t) => ctx.metamodel.isA(o.type, t))))
    .sort(byName);
  const target = typeof field.value === "string" ? ctx.state.objects.get(field.value) : undefined;
  return (
    <>
      <select
        id={id}
        className={`value${field.empty ? " is-empty" : ""}`}
        value={str(field.value)}
        disabled={readOnly}
        onChange={(e) => ctx.commit(field, e.target.value || null)}
      >
        <option value="">Empty</option>
        {choices.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      {target && (
        <button
          className="link open-link"
          title={`Show ${target.name}`}
          onClick={() => select({ kind: "object", id: target.id })}
        >
          →
        </button>
      )}
    </>
  );
}

// ---------------------------------------------------------------- text input

/** A text input that commits on Enter or when it loses focus, and reverts on Escape. */
export function TextField(props: {
  label: string;
  value: string;
  /** Returns whether the edit was accepted. */
  onCommit(value: string): boolean;
  id?: string;
  type?: "text" | "number" | "date" | "url";
  className?: string;
  suffix?: string;
  multiline?: boolean;
  placeholder?: string;
  readOnly?: boolean;
  autoFocus?: boolean;
  /** Called after Escape reverted the field. */
  onCancel?(): void;
}) {
  const { label, value, onCommit, id, type = "text", className, suffix, multiline, placeholder, readOnly } = props;
  const { autoFocus, onCancel } = props;
  const [draft, setDraft] = useState(value);
  // Follow the model when it changes (someone else's edit, or a rejected one rolling back).
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    // A refused edit leaves the model as it was: show its value again.
    if (draft !== value) {
      if (!onCommit(draft)) setDraft(value);
    } else onCancel?.();
  };
  const common = {
    id,
    "aria-label": label,
    className,
    value: draft,
    placeholder,
    readOnly,
    autoFocus,
    onBlur: commit,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "Enter" && !(multiline && e.shiftKey)) {
        e.preventDefault();
        (e.target as HTMLElement).blur();
      } else if (e.key === "Escape") {
        setDraft(value);
        requestAnimationFrame(() => (e.target as HTMLElement).blur());
        onCancel?.();
      }
    },
  };
  return (
    <span className="field">
      {multiline ? (
        <textarea {...common} rows={1} onChange={(e) => setDraft(e.target.value)} />
      ) : (
        <input {...common} type={type} onChange={(e) => setDraft(e.target.value)} />
      )}
      {suffix && <span className="unit">{suffix}</span>}
    </span>
  );
}
