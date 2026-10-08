// Property administration in the metamodel tab (slice A-1b; design/02-model/metamodel.md §3): the Properties view
// (every property type, its definition, its list values and the types that carry it) and the panel the Types view
// opens on one type. Both edit the metamodel draft; nothing reaches the model until it is published.
import { useMemo, useState } from "react";
import { propertyUsage, type Metamodel } from "@connectome/engine";
import { LEVEL_PROPERTY, type DataType, type PropertyEditor, type PropertyType, type TypeKey } from "@connectome/model";
import { useModel, useWorkbench } from "../state/workbench";
import { groupName } from "../inspector";
import { typeTree } from "../metamodel-admin";
import { DISTINCT_LABEL, UNIQUE_NAME_LABEL, setIdentityField, type IdentityField } from "../identity-admin";
import {
  CARRIER_LABEL,
  DATA_TYPES,
  dataTypeLabel,
  inheritedFrom,
  isCoreProperty,
  isListType,
  lineageOf,
  listUsers,
  newListKey,
  newPropertyKey,
  newValueKey,
  ownCarriers,
  removePropertyType,
  setCarried,
  upsertPropertyType,
  upsertValueList,
  type CarrierKind,
  type Draft,
} from "../property-admin";

const EDITORS: Partial<Record<DataType, { value: PropertyEditor; label: string }[]>> = {
  list: [
    { value: "auto", label: "Automatic" },
    { value: "dropdown", label: "Drop-down" },
    { value: "segmented", label: "Buttons" },
    { value: "rating", label: "Rating pips" },
  ],
  boolean: [
    { value: "auto", label: "Automatic" },
    { value: "switch", label: "Switch" },
    { value: "checkbox", label: "Checkbox" },
  ],
};

/** A new property in the draft, keyed from its group and name; returns the draft and its key. */
function addProperty(draft: Draft, metamodel: Metamodel): { draft: Draft; key: string } {
  const taken = metamodel.allPropertyTypes().map((p) => p.key);
  const key = newPropertyKey("custom", "New property", taken);
  const pt: PropertyType = { key, name: "New property", group: "custom", dataType: "text" };
  return { draft: upsertPropertyType(draft, pt), key };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// ------------------------------------------------------------------ properties view

export function PropertiesView(props: {
  draft: Draft;
  published: Draft;
  metamodel: Metamodel;
  onChange(draft: Draft): void;
}) {
  const { draft, published, metamodel, onChange } = props;
  const { state } = useModel();
  const selected = useWorkbench((s) => s.metamodelProperty);
  const select = useWorkbench((s) => s.showMetamodelProperty);
  const [filter, setFilter] = useState("");
  const usage = useMemo(() => propertyUsage(state), [state]);
  const all = metamodel.allPropertyTypes();
  const query = filter.trim().toLowerCase();
  const shown = all.filter((p) => !query || `${p.name} ${p.key} ${p.group}`.toLowerCase().includes(query));
  const groups = new Map<string, PropertyType[]>();
  for (const p of shown) {
    const g = isCoreProperty(draft, p.key) ? "Built in" : groupName(p.group);
    groups.set(g, [...(groups.get(g) ?? []), p]);
  }
  const ordered = [...groups.entries()].sort(([a], [b]) =>
    a === "Built in" ? 1 : b === "Built in" ? -1 : a.localeCompare(b),
  );
  const current = selected ? metamodel.propertyType(selected) : undefined;
  const carriers = (key: string) => {
    const c = ownCarriers(draft, key);
    return c.object.length + c.relationship.length + c.diagram.length;
  };
  const held = (key: string) => {
    const u = usage.get(key);
    return u ? u.objects + u.relationships + u.diagrams : 0;
  };

  return (
    <div className="mm-props">
      <aside className="mm-prop-list" aria-label="Property types">
        <div className="mm-prop-tools">
          <input
            type="search"
            placeholder="Filter properties"
            aria-label="Filter properties"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <button
            className="primary"
            onClick={() => {
              const added = addProperty(draft, metamodel);
              onChange(added.draft);
              select(added.key);
            }}
          >
            New property
          </button>
        </div>
        {ordered.map(([group, items]) => (
          <section key={group}>
            <h4>{group}</h4>
            <ul className="plain">
              {items.map((p) => {
                const isNew = !(published.package.propertyTypes ?? []).some((x) => x.key === p.key);
                return (
                  <li key={p.key}>
                    <button
                      className={`mm-prop-item${p.key === selected ? " active" : ""}`}
                      aria-current={p.key === selected}
                      data-property={p.key}
                      onClick={() => select(p.key)}
                    >
                      <span className="name">{p.name}</span>
                      {isNew && <span className="chip new">new</span>}
                      <span className="muted small">
                        {dataTypeLabel(p.dataType)}
                        {!isCoreProperty(draft, p.key) && ` · ${plural(carriers(p.key), "type")}`}
                        {held(p.key) > 0 && ` · ${plural(held(p.key), "value")}`}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        {shown.length === 0 && <p className="muted pad">No properties match “{filter.trim()}”.</p>}
      </aside>
      <section className="mm-prop-editor">
        {current ? (
          // No key: renaming a new property re-keys it, and the form must keep focus while someone types.
          <PropertyForm
            pt={current}
            draft={draft}
            published={published}
            metamodel={metamodel}
            usage={usage.get(current.key)}
            onChange={onChange}
            onRekey={(key) => select(key)}
            onDeleted={() => select(null)}
          />
        ) : (
          <div className="empty-state muted">
            <p>Choose a property to see where it is used and change it, or add a new one.</p>
            <p className="small">
              Properties are the fields people fill in on objects, relationships and diagrams. Giving a type a property
              makes it appear in the properties panel for every item of that type.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function PropertyForm(props: {
  pt: PropertyType;
  draft: Draft;
  published: Draft;
  metamodel: Metamodel;
  usage: { objects: number; relationships: number; diagrams: number } | undefined;
  onChange(draft: Draft): void;
  onRekey(key: string): void;
  onDeleted(): void;
}) {
  const { pt, draft, published, metamodel, usage, onChange, onRekey, onDeleted } = props;
  const core = isCoreProperty(draft, pt.key);
  const isNew = !core && !(published.package.propertyTypes ?? []).some((p) => p.key === pt.key);
  const held = usage ? usage.objects + usage.relationships + usage.diagrams : 0;
  const publishedPt = (published.package.propertyTypes ?? []).find((p) => p.key === pt.key);
  // A data type can change while nothing holds a value (the server checks this too).
  const typeLocked = held > 0 && publishedPt !== undefined;
  const groups = [...new Set(metamodel.allPropertyTypes().map((p) => p.group))].sort();

  const save = (next: PropertyType) => {
    // Until it is published, a new property's key follows its group and name.
    if (isNew && (next.name !== pt.name || next.group !== pt.group)) {
      const taken = metamodel
        .allPropertyTypes()
        .map((p) => p.key)
        .filter((k) => k !== pt.key);
      const key = newPropertyKey(next.group, next.name, taken);
      onChange(upsertPropertyType(draft, { ...next, key }, pt.key));
      if (key !== pt.key) onRekey(key);
      return;
    }
    onChange(upsertPropertyType(draft, next));
  };
  const set = <K extends keyof PropertyType>(field: K, value: PropertyType[K] | undefined) => {
    const next = { ...pt };
    if (value === undefined || value === "" || value === false) delete next[field];
    else next[field] = value;
    save(next);
  };
  const changeType = (dataType: DataType) => {
    const next: PropertyType = { ...pt, dataType };
    delete next.editor;
    if (dataType !== "number" && dataType !== "money") delete next.unit;
    if (!isListType(dataType)) {
      delete next.valueList;
      save(next);
      return;
    }
    if (next.valueList) return save(next);
    // A list property gets a list of its own, which the form then fills.
    const listKey = newListKey(
      pt.name,
      metamodel.allValueLists().map((l) => l.key),
    );
    const withList = upsertValueList(draft, { key: listKey, values: [] });
    onChange(upsertPropertyType(withList, { ...next, valueList: listKey }));
  };

  return (
    <form className="mm-prop-form" aria-label={`Property ${pt.name}`} onSubmit={(e) => e.preventDefault()}>
      <header>
        <h3>{pt.name}</h3>
        <span className="muted mono">{pt.key}</span>
        {core && <span className="chip">built in</span>}
        {isNew && <span className="chip new">new</span>}
        <span className="spacer" />
        {!core && (
          <button
            type="button"
            className="danger"
            onClick={() => {
              onChange(removePropertyType(draft, pt.key));
              onDeleted();
            }}
          >
            Delete property
          </button>
        )}
      </header>
      {core && (
        <p className="muted small">
          Built-in properties come with the semantic layer. They can be read here but not changed.
        </p>
      )}
      <p className="muted small" aria-label="Values held">
        {held === 0
          ? "No item holds a value yet."
          : `Held by ${plural(usage!.objects, "object")}, ${plural(usage!.relationships, "relationship")} and ${plural(usage!.diagrams, "diagram")}.`}
        {isNew && " Its key follows the group and name until it is published, then it is permanent."}
      </p>
      <fieldset disabled={core}>
        <div className="mm-form-grid">
          <label htmlFor="pt-name">Name</label>
          <input id="pt-name" value={pt.name} onChange={(e) => set("name", e.target.value)} required />
          <label htmlFor="pt-group">Group</label>
          <span>
            <input id="pt-group" list="pt-groups" value={pt.group} onChange={(e) => set("group", e.target.value)} />
            <datalist id="pt-groups">
              {groups.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </span>
          <label htmlFor="pt-type">Data type</label>
          <span>
            <select
              id="pt-type"
              value={pt.dataType}
              disabled={typeLocked}
              onChange={(e) => changeType(e.target.value as DataType)}
            >
              {DATA_TYPES.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
              {pt.dataType === "calculated" && <option value="calculated">Calculated</option>}
            </select>
            {typeLocked && <span className="muted small"> Fixed while items hold values.</span>}
          </span>
          {(pt.dataType === "number" || pt.dataType === "money") && (
            <>
              <label htmlFor="pt-unit">Unit</label>
              <input
                id="pt-unit"
                value={pt.unit ?? ""}
                placeholder="e.g. users, days"
                onChange={(e) => set("unit", e.target.value)}
              />
            </>
          )}
          {EDITORS[pt.dataType] && (
            <>
              <label htmlFor="pt-editor">Shown as</label>
              <select
                id="pt-editor"
                value={pt.editor ?? "auto"}
                onChange={(e) =>
                  set("editor", e.target.value === "auto" ? undefined : (e.target.value as PropertyEditor))
                }
              >
                {EDITORS[pt.dataType]!.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </>
          )}
          <label htmlFor="pt-required">Required</label>
          <label className="check">
            <input
              id="pt-required"
              type="checkbox"
              checked={pt.required ?? false}
              onChange={(e) => set("required", e.target.checked)}
            />
            Warn when it is empty
          </label>
          <label htmlFor="pt-help">Help</label>
          <input
            id="pt-help"
            value={pt.help ?? ""}
            placeholder="Shown as a hint in the properties panel"
            onChange={(e) => set("help", e.target.value)}
          />
        </div>
      </fieldset>
      {isListType(pt.dataType) && (
        <ValuesEditor pt={pt} draft={draft} metamodel={metamodel} readOnly={core} onChange={onChange} save={save} />
      )}
      {!core && <UsedBy pt={pt} draft={draft} metamodel={metamodel} onChange={onChange} />}
    </form>
  );
}

function ValuesEditor(props: {
  pt: PropertyType;
  draft: Draft;
  metamodel: Metamodel;
  readOnly: boolean;
  onChange(draft: Draft): void;
  save(pt: PropertyType): void;
}) {
  const { pt, draft, metamodel, readOnly, onChange, save } = props;
  const { state } = useModel();
  const [label, setLabel] = useState("");
  const list = pt.valueList ? metamodel.valueList(pt.valueList) : undefined;
  const editable = !readOnly && (draft.package.valueLists ?? []).some((l) => l.key === pt.valueList);
  const others = pt.valueList ? listUsers(draft, pt.valueList).filter((p) => p.key !== pt.key) : [];
  const inUse = useMemo(() => {
    const counts = new Map<string, number>();
    const count = (props: Record<string, unknown>) => {
      const v = props[pt.key];
      for (const item of Array.isArray(v) ? v : v === undefined || v === null ? [] : [v])
        counts.set(String(item), (counts.get(String(item)) ?? 0) + 1);
    };
    for (const o of state.objects.live()) count(o.properties);
    for (const r of state.relationships.live()) count(r.properties);
    for (const d of state.diagrams.live()) count(d.properties ?? {});
    return counts;
  }, [state, pt.key]);
  const lists = metamodel.allValueLists();

  const setValues = (values: NonNullable<typeof list>["values"]) =>
    list && onChange(upsertValueList(draft, { ...list, values }));
  const move = (i: number, by: -1 | 1) => {
    if (!list) return;
    const values = [...list.values];
    const [v] = values.splice(i, 1);
    values.splice(i + by, 0, v!);
    setValues(values);
  };

  return (
    <section className="mm-values" aria-label="List values">
      <h4>List values</h4>
      <div className="mm-form-grid">
        <label htmlFor="pt-list">List</label>
        <select
          id="pt-list"
          value={pt.valueList ?? ""}
          disabled={readOnly}
          onChange={(e) => save({ ...pt, valueList: e.target.value })}
        >
          {lists.map((l) => (
            <option key={l.key} value={l.key}>
              {l.key} ({l.values.length} values)
            </option>
          ))}
        </select>
      </div>
      {others.length > 0 && (
        <p className="muted small">Shared with {others.map((p) => p.name).join(", ")}: changes apply to them too.</p>
      )}
      {list && (
        <ul className="plain mm-value-list">
          {list.values.map((v, i) => (
            <li key={v.key} data-value={v.key}>
              <input
                type="color"
                aria-label={`Colour of ${v.label}`}
                value={v.color ?? "#cccccc"}
                disabled={!editable}
                onChange={(e) =>
                  setValues(list.values.map((x) => (x.key === v.key ? { ...x, color: e.target.value } : x)))
                }
              />
              <input
                aria-label={`Label of ${v.key}`}
                value={v.label}
                disabled={!editable}
                onChange={(e) =>
                  setValues(list.values.map((x) => (x.key === v.key ? { ...x, label: e.target.value } : x)))
                }
              />
              <span className="muted small">{inUse.get(v.key) ? `${inUse.get(v.key)} in use` : "not used"}</span>
              {editable && (
                <>
                  <button
                    type="button"
                    aria-label={`Move ${v.label} up`}
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${v.label} down`}
                    disabled={i === list.values.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="link"
                    aria-label={`Remove value ${v.label}`}
                    disabled={(inUse.get(v.key) ?? 0) > 0}
                    title={(inUse.get(v.key) ?? 0) > 0 ? "Items still use this value" : "Remove this value"}
                    onClick={() => setValues(list.values.filter((x) => x.key !== v.key))}
                  >
                    ×
                  </button>
                </>
              )}
            </li>
          ))}
          {list.values.length === 0 && <li className="muted small">No values yet: add the first one below.</li>}
        </ul>
      )}
      {list && editable && (
        <div className="mm-add-value">
          <input
            aria-label="New value"
            placeholder="New value"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (!label.trim()) return;
                setValues([...list.values, { key: newValueKey(label, list), label: label.trim() }]);
                setLabel("");
              }
            }}
          />
          <button
            type="button"
            disabled={!label.trim()}
            onClick={() => {
              setValues([...list.values, { key: newValueKey(label, list), label: label.trim() }]);
              setLabel("");
            }}
          >
            Add value
          </button>
        </div>
      )}
    </section>
  );
}

/** Which types carry the property: tick to give it to a type, untick to take it away. */
function UsedBy(props: { pt: PropertyType; draft: Draft; metamodel: Metamodel; onChange(draft: Draft): void }) {
  const { pt, draft, metamodel, onChange } = props;
  const own = ownCarriers(draft, pt.key);
  const toggle = (kind: CarrierKind, type: TypeKey, on: boolean) => onChange(setCarried(draft, kind, type, pt.key, on));
  const count = own.object.length + own.relationship.length + own.diagram.length;
  return (
    <section className="mm-used-by" aria-label="Used by">
      <h4>Used by {count === 0 ? <span className="muted small">no type yet</span> : null}</h4>
      <div className="mm-used-columns">
        <fieldset>
          <legend>{CARRIER_LABEL.object}</legend>
          {typeTree(metamodel).map(({ type: t, depth }) => {
            const key = t.definition.key;
            const via = inheritedFrom(draft.package, key, pt.key);
            return (
              <label key={key} className="check" style={{ paddingLeft: depth * 14 }}>
                <input
                  type="checkbox"
                  checked={own.object.includes(key) || via !== undefined}
                  disabled={via !== undefined}
                  onChange={(e) => toggle("object", key, e.target.checked)}
                />
                {t.definition.name}
                {via && <span className="muted small"> via {via.name}</span>}
              </label>
            );
          })}
        </fieldset>
        <div>
          <fieldset>
            <legend>{CARRIER_LABEL.relationship}</legend>
            {metamodel.allRelationshipTypes().map((rt) => (
              <label key={rt.key} className="check">
                <input
                  type="checkbox"
                  checked={own.relationship.includes(rt.key)}
                  onChange={(e) => toggle("relationship", rt.key, e.target.checked)}
                />
                {rt.name}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>{CARRIER_LABEL.diagram}</legend>
            {metamodel.allDiagramTypes().map((dt) => (
              <label key={dt.definition.key} className="check">
                <input
                  type="checkbox"
                  checked={own.diagram.includes(dt.definition.key)}
                  onChange={(e) => toggle("diagram", dt.definition.key, e.target.checked)}
                />
                {dt.definition.name}
              </label>
            ))}
          </fieldset>
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ one type's properties

/** The properties of one type (opened from the Types view): inherited and built-in ones, its own, and adding more. */
export function TypePropertiesPanel(props: {
  kind: CarrierKind;
  type: TypeKey;
  draft: Draft;
  metamodel: Metamodel;
  onChange(draft: Draft): void;
  /** Without it the panel has no close button (inside the diagram type editor). */
  onClose?(): void;
}) {
  const { kind, type, draft, metamodel, onChange, onClose } = props;
  const showProperty = useWorkbench((s) => s.showMetamodelProperty);
  const definition =
    kind === "object"
      ? draft.package.objectTypes.find((t) => t.key === type)
      : kind === "relationship"
        ? draft.package.relationshipTypes.find((t) => t.key === type)
        : draft.diagramTypes.find((t) => t.key === type);
  if (!definition) return null;
  const own = definition.properties ?? [];
  const fixed: { key: string; from: string }[] = [];
  if (kind === "object") {
    for (const ancestor of lineageOf(draft.package, type).slice(1))
      for (const key of ancestor.properties ?? []) fixed.push({ key, from: `from ${ancestor.name}` });
    fixed.push({ key: LEVEL_PROPERTY, from: "built in" });
  }
  if (kind === "relationship") {
    const rt = metamodel.relationshipType(type);
    for (const key of metamodel.relationshipTypeProperties(type))
      if (!own.includes(key)) fixed.push({ key, from: `built in for ${rt?.semantic ?? "its kind"}` });
  }
  const carried = new Set([...own, ...fixed.map((f) => f.key)]);
  const addable = metamodel
    .allPropertyTypes()
    .filter((p) => !carried.has(p.key) && !isCoreProperty(draft, p.key))
    .sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
  const byGroup = new Map<string, PropertyType[]>();
  for (const p of addable) byGroup.set(p.group, [...(byGroup.get(p.group) ?? []), p]);
  const name = (key: string) => metamodel.propertyType(key)?.name ?? key;

  return (
    <aside className="mm-type-panel" aria-label={`Properties of ${definition.name}`}>
      <header>
        <h3>{definition.name}</h3>
        <span className="muted small">{CARRIER_LABEL[kind].replace(/s$/, "").toLowerCase()}</span>
        <span className="spacer" />
        {onClose && (
          <button className="link" aria-label="Close" onClick={onClose}>
            ×
          </button>
        )}
      </header>
      <h4>Its properties ({own.length})</h4>
      <ul className="plain mm-type-props" aria-label="Own properties">
        {own.map((key) => (
          <li key={key}>
            <button className="link" onClick={() => showProperty(key)}>
              {name(key)}
            </button>
            <span className="muted small">{dataTypeLabel(metamodel.propertyType(key)?.dataType ?? "text")}</span>
            <span className="spacer" />
            <button
              className="link"
              aria-label={`Remove ${name(key)} from ${definition.name}`}
              title="Take this property away from the type. Values already filled in are kept."
              onClick={() => onChange(setCarried(draft, kind, type, key, false))}
            >
              ×
            </button>
          </li>
        ))}
        {own.length === 0 && <li className="muted small">None of its own yet.</li>}
      </ul>
      <div className="mm-type-add">
        <select
          aria-label={`Add a property to ${definition.name}`}
          value=""
          onChange={(e) => e.target.value && onChange(setCarried(draft, kind, type, e.target.value, true))}
        >
          <option value="">Add a property…</option>
          {[...byGroup.entries()].map(([group, items]) => (
            <optgroup key={group} label={groupName(group)}>
              {items.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <button
          onClick={() => {
            const added = addProperty(draft, metamodel);
            onChange(setCarried(added.draft, kind, type, added.key, true));
            showProperty(added.key);
          }}
        >
          New property…
        </button>
      </div>
      {kind !== "diagram" && (
        <DuplicatesSettings kind={kind} type={type} draft={draft} metamodel={metamodel} onChange={onChange} />
      )}
      {fixed.length > 0 && (
        <>
          <h4>Inherited and built in ({fixed.length})</h4>
          <ul className="plain mm-type-props inherited" aria-label="Inherited properties">
            {fixed.map((f) => (
              <li key={f.key}>
                <span>{name(f.key)}</span>
                <span className="muted small">{f.from}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}

/** How unique the type's names are, or what counts as a repeated relationship (duplicates-and-identity.md §4). */
function DuplicatesSettings(props: {
  kind: "object" | "relationship";
  type: TypeKey;
  draft: Draft;
  metamodel: Metamodel;
  onChange(draft: Draft): void;
}) {
  const { kind, type, draft, metamodel, onChange } = props;
  const set = (field: IdentityField, value: string | boolean | undefined) =>
    onChange(setIdentityField(draft, kind, type, field, value));
  if (kind === "relationship") {
    const rt = metamodel.relationshipType(type);
    if (!rt) return null;
    return (
      <section className="mm-identity" aria-label="Duplicates">
        <h4>Duplicates</h4>
        <label>
          Allowed between the same two objects
          <select value={rt.distinct} onChange={(e) => set("distinct", e.target.value)}>
            {Object.entries(DISTINCT_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <p className="muted small">A repeat is saved with a warning.</p>
      </section>
    );
  }
  const t = metamodel.objectType(type);
  if (!t) return null;
  return (
    <section className="mm-identity" aria-label="Duplicates">
      <h4>Duplicates</h4>
      <label>
        Uniqueness
        <select value={t.uniqueName} onChange={(e) => set("uniqueName", e.target.value)}>
          {Object.entries(UNIQUE_NAME_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {t.uniqueName !== "none" && (
        <>
          <label className="check">
            <input
              type="checkbox"
              checked={t.uniqueAcross === "family"}
              onChange={(e) => set("uniqueAcross", e.target.checked ? "family" : "type")}
            />
            Also against related types (parent, subtypes, siblings)
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={!t.uniquePerLevel}
              onChange={(e) => set("uniquePerLevel", !e.target.checked)}
            />
            Also across levels (conceptual, logical, …)
          </label>
          <label>
            A repeated name is
            <select value={t.onClash} onChange={(e) => set("onClash", e.target.value)}>
              <option value="block">Refused</option>
              <option value="warn">Saved with a warning</option>
            </select>
          </label>
        </>
      )}
    </section>
  );
}
