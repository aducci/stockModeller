// A document's register (design/02-model/views-and-design-artifacts.md §14, slice DOC-3): adding an item about the
// subject, and making one from a sentence of prose. Each gesture is one change. Pure.
import type { DiagramRow, Metamodel, ModelState, ObjectRow } from "@connectome/engine";
import { ulid, type Edit, type Id, type PropertyKey, type PropertyValue, type TypeKey } from "@connectome/model";
import type { DocumentModel } from "@connectome/views";
import { defaultFolderFor } from "./diagram";

/** What a document's first register lets an author create: its types and the relationship that ties them. */
export interface RegisterAdd {
  title: string;
  types: TypeKey[];
  relationship: TypeKey;
}

export function registerAddOf(doc: DocumentModel): RegisterAdd | undefined {
  for (const s of doc.sections)
    if (s.component === "register" && !s.hidden && s.config.add)
      return { title: s.title, types: s.config.add.types, relationship: s.config.add.relationship };
  return undefined;
}

/** The values a new object of a type starts with: its property types' defaults, e.g. a RAID item's status open. */
export function defaultsFor(metamodel: Metamodel, type: TypeKey): Record<PropertyKey, PropertyValue> {
  const values: Record<PropertyKey, PropertyValue> = {};
  for (const key of metamodel.objectType(type)?.properties ?? []) {
    const value = metamodel.propertyType(key)?.default;
    if (value !== undefined && value !== null) values[key] = value as PropertyValue;
  }
  return values;
}

const MAX_NAME = 200;

/** A name from a selection of prose: one line, at most 200 characters, cut at a word. */
export function itemName(text: string): string {
  const name = text.replace(/\s+/g, " ").trim();
  if (name.length <= MAX_NAME) return name;
  const cut = name.slice(0, MAX_NAME - 1);
  const space = cut.lastIndexOf(" ");
  return `${space > MAX_NAME / 2 ? cut.slice(0, space) : cut}…`;
}

/** "+ Add" in a register, and Make RAID item: a new item, tied to the subject when there is one. */
export function addItemPlan(
  state: ModelState,
  metamodel: Metamodel,
  relationship: TypeKey,
  type: TypeKey,
  name: string,
  subject: ObjectRow | undefined,
  near: { folderId: Id },
  id: Id = ulid(),
  relationshipId: Id = ulid(),
): { label: string; edits: Edit[]; id: Id; name: string } {
  const named = itemName(name);
  const properties = defaultsFor(metamodel, type);
  const folderId = defaultFolderFor(state, metamodel, type, near as DiagramRow);
  const edits: Edit[] = [
    {
      edit: "createObject",
      id,
      type,
      name: named,
      folderId,
      ...(Object.keys(properties).length > 0 ? { properties } : {}),
    },
  ];
  if (subject)
    edits.push({
      edit: "createRelationship",
      id: relationshipId,
      type: relationship,
      sourceId: id,
      targetId: subject.id,
    });
  const typeName = metamodel.objectType(type)?.definition.name ?? type;
  return { label: `Add ${typeName.toLowerCase()} ${named}`, edits, id, name: named };
}
