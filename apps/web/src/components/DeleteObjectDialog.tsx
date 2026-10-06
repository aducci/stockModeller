// Shift+Delete (design/04-ux/diagram-editor.md §3): deleting an object from the model says first what goes with
// it: its relationships, its children and the other diagrams it occurs on.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useModel, useWorkbench } from "../state/workbench";
import { deletionImpact } from "../diagram";

export function DeleteObjectDialog() {
  const { state, metamodel } = useModel();
  const id = useWorkbench((s) => s.confirmDelete);
  const ask = useWorkbench((s) => s.askDeleteObject);
  const edit = useWorkbench((s) => s.edit);
  const select = useWorkbench((s) => s.select);
  const activeTab = useWorkbench((s) => s.activeTab);
  const cancel = useRef<HTMLButtonElement>(null);
  const [contentsChoice, setContentsChoice] = useState<"moveUp" | "deleteContents">("moveUp");
  const object = id ? state.objects.get(id) : undefined;
  useEffect(() => cancel.current?.focus(), [id]);
  // Closes by itself if the object is deleted meanwhile.
  useEffect(() => {
    if (id && !object) ask(null);
  }, [id, object, ask]);
  if (!object) return null;

  const { relationships, children, contents, diagrams } = deletionImpact(state, metamodel, object.id, activeTab);
  const name = (objectId: string) => state.objects.get(objectId)?.name ?? objectId;
  const confirm = () => {
    ask(null);
    const deleteContents = contents.length > 0 && contentsChoice === "deleteContents";
    const label = deleteContents ? `Delete ${object.name} and its contents` : `Delete ${object.name}`;
    const contentsEdit = deleteContents ? { contents: "deleteContents" as const } : {};
    if (edit(label, [{ edit: "deleteObject", id: object.id, baseVersion: object.version, ...contentsEdit }])) {
      select(null);
    }
  };
  return (
    <div className="backdrop" onClick={() => ask(null)}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Delete ${object.name}`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && ask(null)}
      >
        <h2>Delete {object.name}?</h2>
        <p>It is removed from the model and from every diagram. Undo brings it back.</p>
        <Section title={`Relationships (${relationships.length})`}>
          {relationships.map((r) => (
            <li key={r.id}>
              {name(r.sourceId)} <span className="muted">{metamodel.relationshipType(r.type)?.verb ?? r.type}</span>{" "}
              {name(r.targetId)}
            </li>
          ))}
        </Section>
        <Section title={`Children (${children.length})`}>
          {children.map((c) => (
            <li key={c}>{name(c)}</li>
          ))}
        </Section>
        {contents.length > 0 && (
          <fieldset className="choice">
            <legend>Its contents ({contents.length})</legend>
            <label>
              <input
                type="radio"
                name="contents"
                checked={contentsChoice === "moveUp"}
                onChange={() => setContentsChoice("moveUp")}
              />
              Keep them, one level up
            </label>
            <label>
              <input
                type="radio"
                name="contents"
                checked={contentsChoice === "deleteContents"}
                onChange={() => setContentsChoice("deleteContents")}
              />
              Delete them too
            </label>
          </fieldset>
        )}
        <Section title={`Also on ${diagrams.length} other diagram${diagrams.length === 1 ? "" : "s"}`}>
          {diagrams.map((d) => (
            <li key={d.id}>⧉ {d.name}</li>
          ))}
        </Section>
        <div className="actions">
          <button ref={cancel} onClick={() => ask(null)}>
            Cancel
          </button>
          <button className="danger" onClick={confirm}>
            Delete object
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode[] }) {
  return (
    <section>
      <h3>{title}</h3>
      {children.length > 0 && <ul className="plain">{children}</ul>}
    </section>
  );
}
