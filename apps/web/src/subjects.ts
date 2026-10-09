// What a diagram is about (design/02-model/views-and-design-artifacts.md §12, slice DOC-1): any diagram may have a
// subject, set when it is made from an element, and its type may link it from the element's documentation. Pure.
import type { DiagramRow, Metamodel, ModelState, ObjectRow, ResolvedDiagramType } from "@connectome/engine";
import { DIAGRAM_LINK, SUBJECT_KEY, linkedDiagramId, linksOf, type Edit, type Id } from "@connectome/model";
import { matchesFilter } from "@connectome/views";

/** The element a diagram is about, if it has one. */
export function subjectIdOf(diagram: DiagramRow | undefined): Id | undefined {
  const subject = diagram?.definition?.[SUBJECT_KEY];
  return typeof subject === "string" ? subject : undefined;
}

/** Whether a diagram of this type may be about the element: its subject filter, or a document's template's. */
export function canBeAbout(metamodel: Metamodel, type: ResolvedDiagramType, object: ObjectRow): boolean {
  const own = type.definition.subject;
  if (own?.type?.length || own?.category?.length) return matchesFilter(metamodel, object, own);
  return type.template ? matchesFilter(metamodel, object, type.template.subject) : true;
}

/** The live diagrams about an element, documents last, then by name. */
export function diagramsAbout(state: ModelState, metamodel: Metamodel, objectId: Id): DiagramRow[] {
  const isDocument = (d: DiagramRow) => metamodel.diagramType(d.diagramType)?.definition.kind === "document";
  return [...state.diagrams.live()]
    .filter((d) => subjectIdOf(d) === objectId)
    .sort((a, b) => Number(isDocument(a)) - Number(isDocument(b)) || a.name.localeCompare(b.name));
}

/** The diagram a symbol of the element opens when the symbol has no child diagram of its own: one about it. */
export function subjectDiagramFor(
  state: ModelState,
  metamodel: Metamodel,
  objectId: Id,
  from: Id,
): DiagramRow | undefined {
  return diagramsAbout(state, metamodel, objectId).find(
    (d) => d.id !== from && metamodel.diagramType(d.diagramType)?.definition.kind !== "document",
  );
}

/**
 * The definition and edits that make a new diagram about an element: its subject, and, when the diagram type names
 * a link property the element's type carries, a link to the diagram added to the element's links (one change).
 */
export function aboutEdits(
  state: ModelState,
  metamodel: Metamodel,
  diagramType: string,
  subjectId: Id,
  diagramId: Id,
): { definition: Record<string, unknown>; edits: Edit[] } {
  const definition = { [SUBJECT_KEY]: subjectId };
  const property = metamodel.diagramType(diagramType)?.definition.subject?.linkProperty;
  const object = state.objects.get(subjectId);
  if (!property || !object || !metamodel.objectType(object.type)?.properties.has(property))
    return { definition, edits: [] };
  const links = linksOf(object.properties[property]);
  const link = `${DIAGRAM_LINK}${diagramId}`;
  if (links.includes(link)) return { definition, edits: [] };
  return {
    definition,
    edits: [
      { edit: "setProperties", id: object.id, baseVersion: object.version, set: { [property]: [...links, link] } },
    ],
  };
}

/** Edits that take links to a diagram out of every element's link properties, e.g. when the diagram is deleted. */
export function unlinkEdits(state: ModelState, metamodel: Metamodel, diagramId: Id): Edit[] {
  const linkProperties = metamodel
    .allPropertyTypes()
    .filter((p) => p.dataType === "url" && p.many)
    .map((p) => p.key);
  if (linkProperties.length === 0) return [];
  const edits: Edit[] = [];
  for (const object of state.objects.live()) {
    const set: Record<string, string[] | null> = {};
    for (const key of linkProperties) {
      const links = linksOf(object.properties[key]);
      const kept = links.filter((l) => linkedDiagramId(l) !== diagramId);
      if (kept.length !== links.length) set[key] = kept.length > 0 ? kept : null;
    }
    if (Object.keys(set).length > 0)
      edits.push({ edit: "setProperties", id: object.id, baseVersion: object.version, set });
  }
  return edits;
}
