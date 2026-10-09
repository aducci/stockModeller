// New diagram (views in the app, slice U-1): one dialog for every kind of view, grouped by kind, asking only what
// that kind needs: the subject of a document, the lifelines of a sequence, an element to start a canvas around.
import { useMemo, useState, type FormEvent } from "react";
import type { ObjectRow, ResolvedDiagramType } from "@connectome/engine";
import { ulid, type Edit, type Id } from "@connectome/model";
import { canBeSubject } from "@connectome/views";
import { useModel, useWorkbench } from "../state/workbench";
import { folderChain } from "../explorer";
import { byName } from "../text";
import { newDocumentPlan } from "../document";
import { newSequenceEdits } from "../sequence";
import { KINDS, KIND_GLYPH, diagramAroundPlan, kindOfType } from "../views";

export function NewDiagramDialog({ folderId, onDone }: { folderId: Id | null; onDone(): void }) {
  const { state, metamodel } = useModel();
  const edit = useWorkbench((s) => s.edit);
  const select = useWorkbench((s) => s.select);
  const openTab = useWorkbench((s) => s.openTab);
  const types = metamodel.allDiagramTypes();
  const folders = useMemo(
    () =>
      [...state.folders.live()]
        .map((f) => ({
          id: f.id,
          path: folderChain(state, f.id)
            .reverse()
            .map((id) => state.folders.get(id)?.name ?? "?")
            .join(" › "),
        }))
        .sort((a, b) => a.path.localeCompare(b.path)),
    [state],
  );
  const [typeKey, setTypeKey] = useState(types[0]?.definition.key ?? "");
  // With nothing selected, the folder that already holds the most diagrams.
  const [folder, setFolder] = useState<Id>(
    () =>
      folderId ??
      [...folders].sort((a, b) => state.diagrams.count("byFolder", b.id) - state.diagrams.count("byFolder", a.id))[0]
        ?.id ??
      "",
  );
  const [name, setName] = useState("");
  const [subjectId, setSubjectId] = useState<Id>("");
  const [around, setAround] = useState<Id>("");
  const [lifelines, setLifelines] = useState<[Id, Id]>(["", ""]);
  const [withMessages, setWithMessages] = useState(true);
  const type = metamodel.diagramType(typeKey);
  const kind = kindOfType(type);
  const objects = [...state.objects.live()].sort(byName);
  const subjects = type?.template ? objects.filter((o) => canBeSubject(metamodel, type.template!, o)) : [];
  const drawable = type ? objects.filter((o) => metamodel.diagramAllowsObjectType(type, o.type)) : [];
  const named = (id: Id) => state.objects.get(id)?.name;

  const suggestion = !type
    ? ""
    : kind === "document" && subjectId
      ? `${named(subjectId)} ${type.definition.name.toLowerCase()}`
      : kind === "sequence" && lifelines[0] && lifelines[1]
        ? `${named(lifelines[0])} and ${named(lifelines[1])}`
        : kind === "canvas" && around
          ? `${named(around)} ${type.definition.name.toLowerCase()}`
          : type.definition.name;
  const missing = !type
    ? "Choose a type"
    : !folder && folders.length > 0
      ? "Choose a folder"
      : kind === "document" && !subjectId
        ? "Choose what the document is about"
        : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (missing || !type) return;
    const title = name.trim() || suggestion;
    const id = ulid();
    // A repository started from scratch has no folder yet: the first diagram makes one.
    const firstFolder = folder ? null : ulid();
    const target = folder || firstFolder!;
    let plan: { label: string; edits: Edit[] };
    if (kind === "document") {
      const subject = state.objects.get(subjectId)!;
      plan = newDocumentPlan(state, metamodel, type.definition, { ...subject, folderId: target } as ObjectRow, id);
      (plan.edits[0] as { name: string }).name = title;
    } else if (kind === "sequence") {
      const ids = lifelines.filter((x, i) => x && lifelines.indexOf(x) === i);
      plan = {
        label: `Create diagram ${title}`,
        edits: newSequenceEdits(
          state,
          metamodel,
          ids,
          { id, name: title, diagramType: typeKey, folderId: target },
          withMessages,
        ),
      };
    } else if (kind === "canvas" && around) {
      plan = diagramAroundPlan(state, metamodel, type, { ...state.objects.get(around)!, folderId: target }, id);
      (plan.edits[0] as { name: string }).name = title;
      plan.label = `Create diagram ${title}`;
    } else
      plan = {
        label: `Create diagram ${title}`,
        edits: [{ edit: "createDiagram", id, name: title, diagramType: typeKey, folderId: target }],
      };
    if (firstFolder) plan.edits.unshift({ edit: "createFolder", id: firstFolder, parentId: null, name: "Diagrams" });
    if (edit(plan.label, plan.edits)) {
      select({ kind: "diagram", id });
      openTab({ kind: "diagram", id });
      onDone();
    }
  };

  const objectSelect = (label: string, value: Id, onChange: (id: Id) => void, list: ObjectRow[], none: string) => (
    <label className="field">
      <span>{label}</span>
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{none}</option>
        {list.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name} ({metamodel.objectType(o.type)?.definition.name ?? o.type})
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="backdrop" onClick={onDone}>
      <form
        className="dialog new-diagram"
        role="dialog"
        aria-modal="true"
        aria-label="New diagram"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && onDone()}
        onSubmit={submit}
      >
        <h2>New diagram</h2>
        <div className="kinds">
          {KINDS.map((k) => {
            const ofKind = types.filter((t) => kindOfType(t) === k.kind);
            if (ofKind.length === 0) return null;
            return (
              <fieldset key={k.kind} className="kind">
                <legend>
                  <span aria-hidden>{KIND_GLYPH[k.kind]}</span> {k.name}
                  <span className="muted"> · {k.description}</span>
                </legend>
                {ofKind.map((t: ResolvedDiagramType) => (
                  <label key={t.definition.key} className={t.definition.key === typeKey ? "chosen" : undefined}>
                    <input
                      type="radio"
                      name="diagram-type"
                      aria-label={t.definition.name}
                      checked={t.definition.key === typeKey}
                      onChange={() => setTypeKey(t.definition.key)}
                    />
                    <span>
                      <strong>{t.definition.name}</strong>
                      {t.definition.description && <span className="muted"> {t.definition.description}</span>}
                    </span>
                  </label>
                ))}
              </fieldset>
            );
          })}
        </div>
        <div className="fields">
          {kind === "document" && objectSelect("About", subjectId, setSubjectId, subjects, "Choose the subject…")}
          {kind === "sequence" && (
            <>
              {objectSelect(
                "First lifeline",
                lifelines[0],
                (id) => setLifelines([id, lifelines[1]]),
                drawable,
                "None yet",
              )}
              {objectSelect(
                "Second lifeline",
                lifelines[1],
                (id) => setLifelines([lifelines[0], id]),
                drawable,
                "None yet",
              )}
              <label className="check">
                <input type="checkbox" checked={withMessages} onChange={(e) => setWithMessages(e.target.checked)} />
                Draw the messages of their interactions
              </label>
            </>
          )}
          {kind === "canvas" && objectSelect("Start around", around, setAround, drawable, "An empty diagram")}
          {kind === "matrix" && (
            <p className="muted">Rows, columns and relationships come from the type; change them in the toolbar.</p>
          )}
          <label className="field">
            <span>Folder</span>
            <select aria-label="Folder" value={folder} onChange={(e) => setFolder(e.target.value)}>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.path}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Name</span>
            <input
              autoFocus
              aria-label="Diagram name"
              placeholder={suggestion}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        </div>
        <div className="actions">
          {missing && <span className="muted">{missing}</span>}
          <button type="button" onClick={onDone}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={missing !== null}>
            Create
          </button>
        </div>
      </form>
    </div>
  );
}
