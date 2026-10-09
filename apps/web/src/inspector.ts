// The properties panel's field model (design/04-ux/workbench.md "Properties panel"): which editor each property
// gets, which fields a filter or "Hide empty" leaves, and how complete each group is. Pure, so it is unit-tested.
import type { Metamodel } from "@connectome/engine";
import type { PropertyEditor, PropertySet, PropertyType, PropertyValue, ValueList } from "@connectome/model";

/** The editors the panel draws; `auto` on a property type resolves to one of these. */
export type EditorKind =
  | "text"
  | "multiline"
  | "number"
  | "money"
  | "date"
  | "url"
  | "switch"
  | "checkbox"
  | "dropdown"
  | "segmented"
  | "rating"
  | "chips"
  | "objectRef"
  | "calculated";

/** A list is drawn as a segmented control when it has at most this many values… */
export const SEGMENTED_MAX_VALUES = 4;
/** …and their labels together are at most this many characters, so it fits a 300 px panel. */
export const SEGMENTED_MAX_CHARS = 24;

/** Whether a list's values are the ratings 1..n, in order (fit 1–5): drawn as pips. */
export function isRatingList(list: ValueList): boolean {
  return list.values.length >= 2 && list.values.every((v, i) => v.key === String(i + 1));
}

/** The editor for a property type: its `editor` hint when that fits the data type, else chosen automatically. */
export function editorFor(pt: PropertyType, list?: ValueList): EditorKind {
  const hint: PropertyEditor = pt.editor ?? "auto";
  switch (pt.dataType) {
    case "calculated":
      return "calculated";
    case "boolean":
      return hint === "checkbox" ? "checkbox" : "switch";
    case "list": {
      if (hint === "dropdown") return "dropdown";
      if (hint === "segmented" || hint === "radio") return "segmented";
      if (hint === "rating") return "rating";
      if (!list) return "dropdown";
      if (isRatingList(list)) return "rating";
      const chars = list.values.reduce((n, v) => n + v.label.length, 0);
      return list.values.length <= SEGMENTED_MAX_VALUES && chars <= SEGMENTED_MAX_CHARS ? "segmented" : "dropdown";
    }
    case "multiList":
      return "chips";
    case "number":
      return "number";
    case "money":
      return "money";
    case "date":
      return "date";
    case "url":
      return "url";
    case "richText":
      return "multiline";
    case "objectRef":
      return "objectRef";
    default:
      return "text";
  }
}

export function isEmpty(value: PropertyValue | null | undefined): boolean {
  if (value === null || value === undefined || value === "") return true;
  return Array.isArray(value) && value.length === 0;
}

/** The value as a reader sees it: list labels instead of keys, money with its currency. */
export function displayValue(value: PropertyValue | null | undefined, list?: ValueList): string {
  if (isEmpty(value) || value === undefined || value === null) return "";
  const label = (key: string) => list?.values.find((v) => v.key === key)?.label ?? key;
  if (Array.isArray(value)) return value.map((v) => label(String(v))).join(", ");
  if (typeof value === "object") return `${value.amount} ${value.currency}`;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return list ? label(String(value)) : String(value);
}

export interface Field {
  pt: PropertyType;
  value: PropertyValue | null;
  list?: ValueList;
  editor: EditorKind;
  empty: boolean;
}

export interface FieldGroup {
  key: string;
  name: string;
  fields: Field[];
  /** Fields with a value, out of all the group's fields (before filtering). */
  filled: number;
  total: number;
}

export interface FieldOptions {
  /** Matches a field's name, key or displayed value, ignoring case. */
  filter?: string;
  /** Leaves out fields with no value (calculated fields always stay). */
  hideEmpty?: boolean;
  /** Only the set's properties, in its order, as one group named after it. */
  set?: PropertySet;
}

export function groupName(key: string): string {
  if (key === "semantic") return "Semantics";
  if (key === "raid") return "RAID";
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/**
 * The property fields of an item, by group in the type's order (or in a property set's order, as one group);
 * `hidden` counts what Hide empty left out.
 */
export function fieldGroups(
  metamodel: Metamodel,
  keys: Iterable<string>,
  values: Readonly<Record<string, PropertyValue>>,
  options: FieldOptions = {},
): { groups: FieldGroup[]; hidden: number } {
  const query = options.filter?.trim().toLowerCase() ?? "";
  const groups = new Map<string, FieldGroup>();
  let hidden = 0;
  const own = new Set(keys);
  const set = options.set;
  for (const key of set ? set.properties.filter((k) => own.has(k)) : own) {
    const pt = metamodel.propertyType(key);
    if (!pt) continue;
    const list = pt.valueList ? metamodel.valueList(pt.valueList) : undefined;
    const value = values[key] ?? null;
    const empty = pt.dataType !== "calculated" && isEmpty(value);
    const groupKey = set ? `set:${set.key}` : pt.group;
    const group = groups.get(groupKey) ?? {
      key: groupKey,
      name: set ? set.name : groupName(pt.group),
      fields: [],
      filled: 0,
      total: 0,
    };
    groups.set(groupKey, group);
    group.total++;
    if (!empty) group.filled++;
    if (options.hideEmpty && empty) {
      hidden++;
      continue;
    }
    if (query && ![pt.name, pt.key, displayValue(value, list)].some((t) => t.toLowerCase().includes(query))) continue;
    group.fields.push({ pt, value, list, editor: editorFor(pt, list), empty });
  }
  return { groups: [...groups.values()].filter((g) => g.fields.length > 0), hidden };
}

export interface StrandedValue {
  key: string;
  name: string;
  display: string;
}

/**
 * Values an item holds for properties its type no longer carries (slice A-1b): a publish keeps them, and the panel
 * lists them so someone can clear them. Named after the property type when it still exists.
 */
export function strandedValues(
  metamodel: Metamodel,
  carried: ReadonlySet<string>,
  values: Readonly<Record<string, PropertyValue>>,
): StrandedValue[] {
  return Object.entries(values)
    .filter(([key, value]) => !carried.has(key) && !isEmpty(value))
    .map(([key, value]) => {
      const pt = metamodel.propertyType(key);
      const list = pt?.valueList ? metamodel.valueList(pt.valueList) : undefined;
      return { key, name: pt?.name ?? key, display: displayValue(value, list) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** A user's own property set: a key unlikely to collide with a package's, and only properties the type has. */
export function mySet(name: string, properties: Iterable<string>, now = Date.now()): PropertySet {
  return { key: `my${now.toString(36)}`, name: name.trim(), properties: [...properties] };
}

/** A set with one property added (at the end) or removed. */
export function toggleInSet(set: PropertySet, key: string): PropertySet {
  return {
    ...set,
    properties: set.properties.includes(key) ? set.properties.filter((k) => k !== key) : [...set.properties, key],
  };
}

export type ConfirmationState = "none" | "current" | "earlier" | "changed";

export interface ConfirmationInfo {
  state: ConfirmationState;
  by?: string;
  at?: string;
}

/** A quarter as one number, so two dates compare by quarter (reviews are quarterly checkpoints). */
const quarter = (iso: string) => {
  const d = new Date(iso);
  return d.getUTCFullYear() * 4 + Math.floor(d.getUTCMonth() / 3);
};

interface Confirmable {
  confirmations?: Record<string, { by: string; at: string }>;
  fieldVersions: Record<string, { v: number; by: string }>;
}

/**
 * Where a property's confirmation stands (design/04-ux/workbench.md "Confirmations"): never confirmed, confirmed this
 * quarter, confirmed in an earlier quarter, or changed since it was confirmed.
 */
export function confirmationOf(item: Confirmable, key: string, now: string): ConfirmationInfo {
  const c = item.confirmations?.[key];
  if (!c) return { state: "none" };
  const stamp = (field: string) => Math.max(item.fieldVersions[field]?.v ?? 0, item.fieldVersions["*"]?.v ?? 0);
  if (stamp(`properties.${key}`) > stamp(`confirmations.${key}`)) return { state: "changed", ...c };
  return { state: quarter(c.at) === quarter(now) ? "current" : "earlier", ...c };
}

/** "6 Oct" this year, "6 Oct 2025" before. */
export function shortDate(iso: string, now: string): string {
  const d = new Date(iso);
  const sameYear = d.getUTCFullYear() === new Date(now).getUTCFullYear();
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: "UTC",
  });
}
