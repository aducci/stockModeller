// The CXN Builder in the workbench (design/02-model/views-and-design-artifacts.md §15): opening an unsaved one from
// the menus, and turning it into a saved view.
import type { Metamodel, ModelState, ObjectRow, ResolvedDiagramType } from "@connectome/engine";
import { ulid, type CxnDefinition, type Edit, type Id, type TypeKey } from "@connectome/model";
import { cxnDefinition } from "@connectome/views";
import { useWorkbench } from "./state/workbench";
import { kindOfType } from "./views";

/** The diagram type a CXN Builder is saved as: the first of kind `cxn`, if the metamodel has one. */
export const cxnType = (metamodel: Metamodel): ResolvedDiagramType | undefined =>
  metamodel.allDiagramTypes().find((t) => kindOfType(t) === "cxn");

/** Opens an unsaved CXN Builder: the CXN type's defaults (if any), with `left` and `right` types when given. */
export function openCxnBuilder(
  metamodel: Metamodel,
  options: { left?: TypeKey; right?: TypeKey; selectLeft?: Id[] } = {},
) {
  const base = cxnDefinition(cxnType(metamodel)?.definition, undefined);
  const definition: CxnDefinition = {
    ...base,
    rows: options.left ? { from: { type: [options.left] } } : base.rows,
    columns: options.right ? { from: { type: [options.right] } } : base.columns,
  };
  const id = `cxn:${ulid()}`;
  useWorkbench.getState().openTab({
    kind: "cxn",
    id,
    definition: definition as unknown as Record<string, unknown>,
    selectLeft: options.selectLeft,
  });
}

/** The type an object's type is most often related to, to fill the right pane of *Connect in CXN Builder*. */
export function likelyPartnerType(state: ModelState, object: ObjectRow): TypeKey | undefined {
  const counts = new Map<TypeKey, number>();
  const sameType = [...state.objects.live()].filter((o) => o.type === object.type);
  for (const o of sameType) {
    for (const r of [...state.relationships.find("bySource", o.id), ...state.relationships.find("byTarget", o.id)]) {
      const other = state.objects.get(r.sourceId === o.id ? r.targetId : r.sourceId);
      if (other && other.type !== object.type) counts.set(other.type, (counts.get(other.type) ?? 0) + 1);
    }
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
}

/** Opens a CXN Builder with one object selected on the left, its type's most usual partner type on the right. */
export function connectInCxn(state: ModelState, metamodel: Metamodel, object: ObjectRow) {
  openCxnBuilder(metamodel, {
    left: object.type,
    right: likelyPartnerType(state, object),
    selectLeft: [object.id],
  });
}

/** A name for a saved CXN Builder: its two panes' types. */
export function cxnName(metamodel: Metamodel, definition: CxnDefinition): string {
  const side = (types: TypeKey[] | undefined) =>
    types?.length ? types.map((t) => metamodel.objectType(t)?.definition.name ?? t).join(", ") : "Anything";
  return `${side(definition.rows.from.type)} → ${side(definition.columns.from.type)}`;
}

/** The change that saves an unsaved CXN Builder as a view in a folder (making a folder when there is none). */
export function saveCxnPlan(
  state: ModelState,
  metamodel: Metamodel,
  definition: CxnDefinition,
  folderId: Id | null,
): { label: string; edits: Edit[]; id: Id } | { error: string } {
  const type = cxnType(metamodel);
  if (!type) return { error: "The metamodel has no CXN Builder diagram type to save it as" };
  const id = ulid();
  const name = cxnName(metamodel, definition);
  const edits: Edit[] = [];
  let folder = folderId;
  if (!folder) {
    folder =
      [...state.folders.live()].sort(
        (a, b) => state.diagrams.count("byFolder", b.id) - state.diagrams.count("byFolder", a.id),
      )[0]?.id ?? null;
  }
  if (!folder) {
    folder = ulid();
    edits.push({ edit: "createFolder", id: folder, parentId: null, name: "Diagrams" });
  }
  edits.push({
    edit: "createDiagram",
    id,
    name,
    diagramType: type.definition.key,
    folderId: folder,
    definition: definition as unknown as Record<string, unknown>,
  });
  return { label: `Save ${name}`, edits, id };
}
