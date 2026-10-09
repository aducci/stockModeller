// Links (design/02-model/views-and-design-artifacts.md §13, slice DOC-R2): an element's links by kind, the links
// that point at an element or a diagram, and the edits that add, relabel and remove them. Pure.
import type { DiagramRow, LinkRow, Metamodel, ModelState, ObjectRow } from "@connectome/engine";
import { ulid, type Edit, type Id, type LinkKind, type LinkTarget } from "@connectome/model";

export interface ShownLink {
  link: LinkRow;
  /** What it points at, by its current name: a diagram, an element, or the web address. */
  title: string;
  /** The live diagram or element it points at; absent for a web link. */
  diagram?: DiagramRow;
  object?: ObjectRow;
}

export interface LinkGroup {
  key: string;
  /** The kind's name (from the element) or inverse name (from the target). */
  name: string;
  links: ShownLink[];
}

const shown = (state: ModelState, link: LinkRow, end: "target" | "source"): ShownLink => {
  if (end === "source") {
    const object = state.objects.get(link.sourceId);
    return { link, title: object?.name ?? "Deleted element", ...(object ? { object } : {}) };
  }
  const t = link.target;
  if ("diagramId" in t) {
    const diagram = state.diagrams.get(t.diagramId);
    return { link, title: diagram?.name ?? "Deleted diagram", ...(diagram ? { diagram } : {}) };
  }
  if ("objectId" in t) {
    const object = state.objects.get(t.objectId);
    return { link, title: object?.name ?? "Deleted element", ...(object ? { object } : {}) };
  }
  return { link, title: t.url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "") };
};

/** Groups links by kind, in the metamodel's order of kinds (unknown kinds last, by key), each in the order added. */
function grouped(
  metamodel: Metamodel,
  links: LinkRow[],
  name: (kind: LinkKind) => string,
  show: (l: LinkRow) => ShownLink,
): LinkGroup[] {
  const order = metamodel.allLinkKinds().map((k) => k.key);
  const keys = [...new Set(links.map((l) => l.kind))].sort(
    (a, b) =>
      (order.indexOf(a) + 1 || order.length + 1) - (order.indexOf(b) + 1 || order.length + 1) || a.localeCompare(b),
  );
  return keys.map((key) => {
    const kind = metamodel.linkKind(key);
    return { key, name: kind ? name(kind) : key, links: links.filter((l) => l.kind === key).map(show) };
  });
}

/** An element's links, by kind. */
export function linksOf(state: ModelState, metamodel: Metamodel, objectId: Id): LinkGroup[] {
  return grouped(
    metamodel,
    state.links.find("bySource", objectId),
    (k) => k.name,
    (l) => shown(state, l, "target"),
  );
}

/** The links that point at an element or a diagram, by the kind's inverse name ("Linked from"). */
export function linkedFrom(state: ModelState, metamodel: Metamodel, target: { objectId: Id } | { diagramId: Id }) {
  const links =
    "objectId" in target
      ? state.links.find("byObject", target.objectId)
      : state.links.find("byDiagram", target.diagramId);
  return grouped(
    metamodel,
    links.filter((l) => state.objects.get(l.sourceId)),
    (k) => k.inverseName ?? k.name,
    (l) => shown(state, l, "source"),
  );
}

/** What a kind's links may point at, as search scopes: documents and diagrams, elements. */
export function linkScope(kind: LinkKind | undefined, from: Id) {
  const targets = kind?.targets ?? [];
  return {
    web: targets.includes("web"),
    diagrams: targets.includes("document") || targets.includes("diagram"),
    documents: targets.includes("document"),
    otherViews: targets.includes("diagram"),
    elements: targets.includes("element"),
    from,
  };
}

/** A new link from an element; `null` with the reason when it cannot be made. */
export function addLinkPlan(
  state: ModelState,
  metamodel: Metamodel,
  sourceId: Id,
  kind: string,
  target: LinkTarget,
  label?: string,
  id: Id = ulid(),
): { label: string; edits: Edit[] } | { error: string } {
  const source = state.objects.get(sourceId);
  const k = metamodel.linkKind(kind);
  if (!source || !k) return { error: "That element or kind of link is gone" };
  let to: LinkTarget = target;
  if ("url" in target) {
    const url = target.url.trim();
    if (!url) return { error: "Type a web address" };
    to = { url: /^https?:\/\//i.test(url) ? url : `https://${url}` };
  }
  const exists = state.links
    .find("bySource", sourceId)
    .some((l) => l.kind === kind && JSON.stringify(l.target) === JSON.stringify(to));
  if (exists) return { error: `${source.name} already has this link` };
  const text = label?.trim();
  return {
    label: `Link ${source.name}`,
    edits: [{ edit: "createLink", id, sourceId, kind, target: to, ...(text ? { label: text } : {}) }],
  };
}

export const relabelLinkEdit = (link: LinkRow, label: string): Edit => ({
  edit: "updateLink",
  id: link.id,
  set: { label: label.trim() || null },
});

export const removeLinkEdit = (link: LinkRow): Edit => ({ edit: "deleteLink", id: link.id });
