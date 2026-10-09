// Links and Linked from in the properties panel (design/02-model/views-and-design-artifacts.md §13, slice DOC-R2):
// an element's links by kind, each opening what it points at, and the links that point at an element or a diagram.
import { useState } from "react";
import type { ObjectRow } from "@connectome/engine";
import type { Id } from "@connectome/model";
import { useModel, useWorkbench } from "../state/workbench";
import { addLinkPlan, linkedFrom, linksOf, relabelLinkEdit, removeLinkEdit, type ShownLink } from "../links";
import { KIND_GLYPH } from "../views";
import { notationFor } from "../notation";
import { Section, TextField } from "./Inspector";
import { Glyph } from "./Glyph";
import { SearchPicker } from "./SearchPicker";

function LinkTitle({ shown }: { shown: ShownLink }) {
  const { metamodel } = useModel();
  const select = useWorkbench((s) => s.select);
  const openTab = useWorkbench((s) => s.openTab);
  const { link, diagram, object, title } = shown;
  if (diagram)
    return (
      <button
        className="link"
        title={`Open ${diagram.name}`}
        onClick={() => {
          select({ kind: "diagram", id: diagram.id });
          openTab({ kind: "diagram", id: diagram.id });
        }}
      >
        <span aria-hidden>{KIND_GLYPH[metamodel.diagramType(diagram.diagramType)?.definition.kind ?? "canvas"]} </span>
        {title}
      </button>
    );
  if (object) {
    const n = notationFor(metamodel.objectType(object.type));
    return (
      <button className="link" title={`Show ${object.name}`} onClick={() => select({ kind: "object", id: object.id })}>
        <Glyph glyph={n.glyph} colour={n.ink} /> {title}
      </button>
    );
  }
  if ("url" in link.target)
    return (
      <a
        className="link-value"
        href={link.target.url}
        target="_blank"
        rel="noreferrer noopener"
        title={link.target.url}
      >
        ↗ {link.label ?? title}
      </a>
    );
  return <span className="muted">{title}</span>;
}

/** An element's links, by kind, with *+ Add link*. */
export function LinksSection({ object }: { object: ObjectRow }) {
  const { state, metamodel } = useModel();
  const edit = useWorkbench((s) => s.edit);
  const notify = useWorkbench((s) => s.notify);
  const kinds = metamodel.allLinkKinds();
  const groups = linksOf(state, metamodel, object.id);
  const count = groups.reduce((n, g) => n + g.links.length, 0);
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState(kinds[0]?.key ?? "");
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [relabelling, setRelabelling] = useState<Id | null>(null);
  if (kinds.length === 0 && count === 0) return null;
  const chosen = metamodel.linkKind(kind);
  const targets = chosen?.targets ?? [];
  const add = (target: Parameters<typeof addLinkPlan>[4]) => {
    const plan = addLinkPlan(state, metamodel, object.id, kind, target, label);
    if ("error" in plan) return notify(plan.error, "error");
    if (edit(plan.label, plan.edits)) {
      setUrl("");
      setLabel("");
      setAdding(false);
    }
  };
  const isDocument = (diagramType: string) => metamodel.diagramType(diagramType)?.definition.kind === "document";

  return (
    <Section id="object:links" title="Links" count={count || undefined}>
      <div className="links" role="group" aria-label="Links">
        {groups.map((g) => (
          <div key={g.key} className="link-group" role="list" aria-label={g.name}>
            <div className="link-kind muted small">{g.name}</div>
            {g.links.map((s) => (
              <div key={s.link.id} className="link-row" role="listitem">
                <LinkTitle shown={s} />
                {relabelling === s.link.id ? (
                  <TextField
                    label={`Label of ${s.title}`}
                    value={s.link.label ?? ""}
                    autoFocus
                    placeholder="Label"
                    onCommit={(text) => {
                      setRelabelling(null);
                      return edit(`Label the link to ${s.title}`, [relabelLinkEdit(s.link, text)]);
                    }}
                    onCancel={() => setRelabelling(null)}
                  />
                ) : (
                  s.link.label &&
                  !("url" in s.link.target) && <span className="muted small link-label">{s.link.label}</span>
                )}
                <span className="link-actions">
                  <button
                    className="link"
                    aria-label={`Label the link to ${s.title}`}
                    title="Label"
                    onClick={() => setRelabelling(s.link.id)}
                  >
                    ✎
                  </button>
                  <button
                    className="link remove-link"
                    aria-label={`Remove the link to ${s.title}`}
                    title="Remove this link (what it points at stays)"
                    onClick={() => edit(`Remove the link to ${s.title}`, [removeLinkEdit(s.link)])}
                  >
                    ×
                  </button>
                </span>
              </div>
            ))}
          </div>
        ))}
        {adding ? (
          <div className="link-add-form">
            <select aria-label="Kind of link" value={kind} onChange={(e) => setKind(e.target.value)}>
              {kinds.map((k) => (
                <option key={k.key} value={k.key}>
                  {k.name}
                </option>
              ))}
            </select>
            <input
              aria-label="Label of the new link"
              placeholder="Label (optional)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
            {targets.includes("web") && (
              <input
                aria-label="Web address"
                type="url"
                placeholder="https://…"
                value={url}
                autoFocus
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") add({ url });
                  if (e.key === "Escape") setAdding(false);
                }}
              />
            )}
            {(targets.includes("document") || targets.includes("diagram") || targets.includes("element")) && (
              <SearchPicker
                key={kind}
                label="Link to"
                autoFocus={!targets.includes("web")}
                placeholder="Search by name…"
                scope={{
                  diagrams:
                    targets.includes("document") || targets.includes("diagram")
                      ? (d) => targets.includes(isDocument(d.diagramType) ? "document" : "diagram")
                      : undefined,
                  objects: targets.includes("element") ? (o) => o.id !== object.id : undefined,
                  nearFolderId: object.folderId,
                }}
                onPick={(f) => add(f.kind === "diagram" ? { diagramId: f.id } : { objectId: f.id })}
                onCancel={() => setAdding(false)}
              />
            )}
            <span className="link-add-actions">
              {targets.includes("web") && (
                <button onClick={() => add({ url })} disabled={!url.trim()}>
                  Add
                </button>
              )}
              <button className="link" onClick={() => setAdding(false)}>
                Cancel
              </button>
            </span>
          </div>
        ) : (
          kinds.length > 0 && (
            <button className="link add-link" onClick={() => setAdding(true)}>
              + Add link
            </button>
          )
        )}
      </div>
    </Section>
  );
}

/** The links that point at an element or a diagram, by what they mean from here; shown only when there are some. */
export function LinkedFromSection({ target, id }: { target: { objectId: Id } | { diagramId: Id }; id: string }) {
  const { state, metamodel } = useModel();
  const groups = linkedFrom(state, metamodel, target);
  const count = groups.reduce((n, g) => n + g.links.length, 0);
  if (count === 0) return null;
  return (
    <Section id={id} title="Linked from" count={count}>
      <div className="links" role="group" aria-label="Linked from">
        {groups.map((g) => (
          <div key={g.key} className="link-group" role="list" aria-label={g.name}>
            <div className="link-kind muted small">{g.name}</div>
            {g.links.map((s) => (
              <div key={s.link.id} className="link-row" role="listitem">
                <LinkTitle shown={s} />
                {s.link.label && <span className="muted small link-label">{s.link.label}</span>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </Section>
  );
}
