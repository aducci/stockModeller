// The object viewer (design/04-ux/workbench.md "Object viewer"): everything stored in a folder and its subfolders as
// one editable list. Which rows and columns it shows is worked out here, without React.
import type { Metamodel, ModelState, ObjectRow } from "@connectome/engine";
import { ABSTRACTION_PROPERTY, type Id, type PropertyType } from "@connectome/model";
import { byName } from "./text";

/** At most this many property columns, so the list stays readable. */
export const MAX_PROPERTY_COLUMNS = 8;

/** Data types the list edits in place; the others are shown as text and edited in the properties panel. */
const EDITABLE = new Set(["text", "url", "number", "date", "boolean", "list"]);

export interface ViewerRow {
  object: ObjectRow;
  /** The folder it is stored in, relative to the viewed folder ("" when stored there itself). */
  path: string;
}

/** The live objects in a folder (and, with `deep`, its subfolders), with their path below it, by name. */
export function objectsUnder(state: ModelState, folderId: Id, deep: boolean): ViewerRow[] {
  const rows: ViewerRow[] = [];
  const seen = new Set<Id>();
  const visit = (id: Id, path: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    for (const object of state.objects.find("byFolder", id)) rows.push({ object, path });
    if (!deep) return;
    for (const sub of [...state.folders.find("byParent", id)].sort(byName))
      visit(sub.id, path ? `${path} / ${sub.name}` : sub.name);
  };
  visit(folderId, "");
  return rows.sort((a, b) => byName(a.object, b.object) || a.path.localeCompare(b.path));
}

/**
 * The property columns: those every shown object's type carries (so each cell can hold a value), the abstraction first
 * and then in the order of the first type's properties, calculated values left out.
 */
export function viewerColumns(metamodel: Metamodel, types: Iterable<string>): PropertyType[] {
  const carried = [...new Set(types)].map((t) => metamodel.objectType(t)?.properties ?? new Set<string>());
  if (carried.length === 0) return [];
  const [first, ...rest] = carried;
  return [...first!]
    .sort((a, b) => Number(b === ABSTRACTION_PROPERTY) - Number(a === ABSTRACTION_PROPERTY))
    .filter((key) => rest.every((p) => p.has(key)))
    .map((key) => metamodel.propertyType(key))
    .filter((pt): pt is PropertyType => !!pt && pt.dataType !== "calculated")
    .slice(0, MAX_PROPERTY_COLUMNS);
}

/** Whether the list edits this property in place. */
export const editableInList = (pt: PropertyType) => EDITABLE.has(pt.dataType);

/** A typed value from what was entered in a cell: null clears it, undefined means it cannot be read. */
export function parseCell(pt: PropertyType, text: string): string | number | null | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  if (pt.dataType === "number") {
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : undefined;
  }
  return trimmed;
}
