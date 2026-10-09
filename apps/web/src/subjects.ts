// What a diagram is about (design/02-model/views-and-design-artifacts.md §12, slice DOC-1): any diagram may have a
// subject, set when it is made from an element, and its type may link it from the element (by link kind, §13). Pure.
import type { DiagramRow, Metamodel, ModelState, ObjectRow, ResolvedDiagramType } from "@connectome/engine";
import { SUBJECT_KEY, ulid, type Edit, type Id } from "@connectome/model";
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

/**
 * The diagram a symbol of the element opens when the symbol has no child diagram of its own: the first link of a
 * drill-down kind (slice DOC-R2), else a diagram about it that is not a document.
 */
export function subjectDiagramFor(
  state: ModelState,
  metamodel: Metamodel,
  objectId: Id,
  from: Id,
): DiagramRow | undefined {
  for (const link of state.links.find("bySource", objectId)) {
    if (!("diagramId" in link.target) || !metamodel.linkKind(link.kind)?.drillDown) continue;
    const diagram = state.diagrams.get(link.target.diagramId);
    if (diagram && diagram.id !== from) return diagram;
  }
  return diagramsAbout(state, metamodel, objectId).find(
    (d) => d.id !== from && metamodel.diagramType(d.diagramType)?.definition.kind !== "document",
  );
}

/**
 * The definition and edits that make a new diagram about an element: its subject, and, when the diagram type names
 * a link kind, a link of that kind from the element to the diagram (one change, after the diagram is created).
 */
export function aboutEdits(
  state: ModelState,
  metamodel: Metamodel,
  diagramType: string,
  subjectId: Id,
  diagramId: Id,
  linkId: Id = ulid(),
): { definition: Record<string, unknown>; edits: Edit[] } {
  const definition = { [SUBJECT_KEY]: subjectId };
  const kind = metamodel.diagramType(diagramType)?.definition.subject?.linkKind;
  if (!kind || !metamodel.linkKind(kind) || !state.objects.get(subjectId)) return { definition, edits: [] };
  const linked = state.links
    .find("bySource", subjectId)
    .some((l) => l.kind === kind && "diagramId" in l.target && l.target.diagramId === diagramId);
  if (linked) return { definition, edits: [] };
  return {
    definition,
    edits: [{ edit: "createLink", id: linkId, sourceId: subjectId, kind, target: { diagramId } }],
  };
}
