// The object viewer (design/04-ux/workbench.md "Object viewer"): a folder's subfolders, objects and their contents as
// one editable tree list. Which rows and columns it shows, and what quick add creates, is worked out here, without React.
import type { Metamodel, ModelState, ObjectRow, ResolvedObjectType } from "@connectome/engine";
import { ulid, type Edit, type Id, type PropertyType } from "@connectome/model";
import { childrenOf, type Parent } from "./dragdrop";
import { containerOf, contentsOf } from "./semantics";

/** At most this many property columns, so the list stays readable. */
export const MAX_PROPERTY_COLUMNS = 8;

/** Data types the list edits in place; the others are shown as text and edited in the properties panel. */
const EDITABLE = new Set(["text", "url", "number", "date", "boolean", "list"]);

interface RowBase {
  id: Id;
  name: string;
  depth: number;
  hasChildren: boolean;
  /** The folder it is stored in, relative to the viewed folder ("" when stored there itself). */
  path: string;
}
export type ViewerRow = (RowBase & { kind: "folder" }) | (RowBase & { kind: "object"; object: ObjectRow });

type Node = Parent & { id: Id };
const shown = (state: ModelState, metamodel: Metamodel, node: Node) =>
  childrenOf(state, metamodel, node).filter((c) => c.kind !== "diagram");

/**
 * The tree under a folder, in the explorer's order: subfolders, then objects stored there that no other object
 * contains, each object followed by what it contains. Diagrams are left out. Rows under a collapsed id are skipped.
 */
export function viewerTree(
  state: ModelState,
  metamodel: Metamodel,
  folderId: Id,
  collapsed: ReadonlySet<Id> = new Set(),
): ViewerRow[] {
  const rows: ViewerRow[] = [];
  const seen = new Set<Id>([folderId]);
  const visit = (parent: Node, depth: number, path: string) => {
    for (const child of shown(state, metamodel, parent)) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      const node: Node = { kind: child.kind as "folder" | "object", id: child.id };
      const hasChildren = shown(state, metamodel, node).length > 0;
      const base = { id: child.id, name: child.name, depth, hasChildren, path };
      if (node.kind === "folder") rows.push({ ...base, kind: "folder" });
      else {
        const object = state.objects.get(child.id);
        if (!object) continue;
        rows.push({ ...base, kind: "object", object });
      }
      if (hasChildren && !collapsed.has(child.id))
        visit(node, depth + 1, node.kind === "folder" ? (path ? `${path} / ${child.name}` : child.name) : path);
    }
  };
  visit({ kind: "folder", id: folderId }, 0, "");
  return rows;
}

/** Every object anywhere under a folder, contents included, as a flat list (for filtering) with its folder path. */
export function objectsUnder(state: ModelState, metamodel: Metamodel, folderId: Id): ViewerRow[] {
  return viewerTree(state, metamodel, folderId)
    .filter((r) => r.kind === "object")
    .map((r) => ({ ...r, depth: 0, hasChildren: false }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));
}

/** Where quick add puts a new object: a folder (stored there) or an object (contained in it). */
export type AddTarget = { kind: "folder"; id: Id } | { kind: "object"; id: Id };

/** A type quick add can create in a target, and for an object target the containment type that holds it. */
export interface AddChoice {
  type: ResolvedObjectType;
  relationshipType?: string;
}

const creatable = (metamodel: Metamodel) =>
  metamodel
    .allObjectTypes()
    .filter((t) => !t.definition.abstract)
    .sort((a, b) => a.definition.name.localeCompare(b.definition.name));

/**
 * The types quick add offers. In a folder: every type that can be created. In an object: the types a containment
 * rule lets sit inside it, each with the first containment type (in package order) whose rules allow it.
 */
export function addChoices(state: ModelState, metamodel: Metamodel, target: AddTarget): AddChoice[] {
  if (target.kind === "folder") return creatable(metamodel).map((type) => ({ type }));
  const parent = state.objects.get(target.id);
  if (!parent) return [];
  const containments = metamodel.allRelationshipTypes().filter((t) => t.semantic === "containment");
  return creatable(metamodel).flatMap((type) => {
    const rel = containments.find((r) => metamodel.matchingRules(r.key, parent.type, type.definition.key).length > 0);
    return rel ? [{ type, relationshipType: rel.key }] : [];
  });
}

/**
 * The type quick add starts with inside an object: the type most of its contents already have, else its own type
 * when it may contain itself (a capability in a capability), else the first choice.
 */
export function defaultChildType(
  state: ModelState,
  metamodel: Metamodel,
  parentId: Id,
  choices: AddChoice[],
): string | undefined {
  const allowed = new Set(choices.map((c) => c.type.definition.key));
  const counts = new Map<string, number>();
  for (const o of contentsOf(state, metamodel, parentId))
    if (allowed.has(o.type)) counts.set(o.type, (counts.get(o.type) ?? 0) + 1);
  const common = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (common) return common;
  const own = state.objects.get(parentId)?.type;
  if (own && allowed.has(own)) return own;
  return choices[0]?.type.definition.key;
}

/** The edits that add an object: created in the folder, or created beside its container and contained in it. */
export function addEdits(
  state: ModelState,
  target: AddTarget,
  choice: AddChoice,
  name: string,
): { label: string; edits: Edit[]; id: Id } | { error: string } {
  const id = ulid();
  const type = choice.type.definition.key;
  if (target.kind === "folder") {
    if (!state.folders.get(target.id)) return { error: "That folder was deleted meanwhile" };
    return { id, label: `Create ${name}`, edits: [{ edit: "createObject", id, type, name, folderId: target.id }] };
  }
  const parent = state.objects.get(target.id);
  if (!parent) return { error: "That object was deleted meanwhile" };
  if (!choice.relationshipType) return { error: `Nothing can be added inside ${parent.name}` };
  return {
    id,
    label: `Create ${name} in ${parent.name}`,
    edits: [
      { edit: "createObject", id, type, name, folderId: parent.folderId },
      { edit: "createRelationship", id: ulid(), type: choice.relationshipType, sourceId: parent.id, targetId: id },
    ],
  };
}

/** The target and the folders and objects it sits inside, below the viewed folder: opened so a new row shows. */
export function targetChain(state: ModelState, metamodel: Metamodel, target: AddTarget, viewed: Id): Id[] {
  const chain: Id[] = [];
  const seen = new Set<Id>();
  let at: AddTarget | undefined = target;
  while (at && at.id !== viewed && !seen.has(at.id)) {
    seen.add(at.id);
    chain.push(at.id);
    if (at.kind === "object") {
      const container = containerOf(state, metamodel, at.id);
      const folderId: Id | undefined = state.objects.get(at.id)?.folderId;
      at = container
        ? { kind: "object", id: container.sourceId }
        : folderId
          ? { kind: "folder", id: folderId }
          : undefined;
    } else {
      const parentId = state.folders.get(at.id)?.parentId;
      at = parentId ? { kind: "folder", id: parentId } : undefined;
    }
  }
  return chain;
}

/** The properties a column can show: those any of the types carries, calculated values left out, by name. */
export function columnChoices(metamodel: Metamodel, types: Iterable<string>): PropertyType[] {
  const keys = new Set<string>();
  for (const t of new Set(types)) for (const key of metamodel.objectType(t)?.properties ?? []) keys.add(key);
  return [...keys]
    .map((key) => metamodel.propertyType(key))
    .filter((pt): pt is PropertyType => !!pt && pt.dataType !== "calculated")
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The chosen columns that still exist, in the order chosen, at most MAX_PROPERTY_COLUMNS. None by default. */
export function viewerColumns(metamodel: Metamodel, chosen: readonly string[]): PropertyType[] {
  return chosen
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
