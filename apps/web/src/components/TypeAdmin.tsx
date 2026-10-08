// Making types from scratch in the metamodel tab: a new object, relationship or diagram type, the general settings
// of object and relationship types (name, parent, meaning), removing unused ones, and the metamodel as a file.
import { useRef, useState, type FormEvent } from "react";
import type { Metamodel } from "@connectome/engine";
import { SEMANTIC_CATEGORIES, SEMANTIC_KINDS, SEMANTIC_LEVELS, type TypeKey } from "@connectome/model";
import type { Draft } from "../property-admin";
import { typeTree } from "../metamodel-admin";
import {
  exportMetamodel,
  importAsDraft,
  metamodelFileName,
  readMetamodel,
  removeObjectType,
  removeRelationshipType,
  updateObjectType,
  updateRelationshipType,
  whyKeepObjectType,
} from "../type-admin";

/** A button that opens a one-line form asking for the new type's name. */
export function NewTypeButton(props: {
  label: string;
  placeholder: string;
  disabled?: string;
  onCreate(name: string): void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  if (!open)
    return (
      <button disabled={!!props.disabled} title={props.disabled} onClick={() => setOpen(true)}>
        {props.label}
      </button>
    );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    props.onCreate(name.trim());
    setName("");
    setOpen(false);
  };
  return (
    <form className="mm-new-type" onSubmit={submit}>
      <input
        autoFocus
        aria-label={`Name of the ${props.label.replace(/^New /, "").toLowerCase()}`}
        placeholder={props.placeholder}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
      />
      <button type="submit" className="primary" disabled={!name.trim()}>
        Create
      </button>
      <button type="button" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </form>
  );
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Name, parent, meaning and level of an object type; removing it while nothing uses it. */
export function ObjectTypeGeneral(props: {
  type: TypeKey;
  draft: Draft;
  metamodel: Metamodel;
  objects: number;
  onChange(draft: Draft): void;
  onRemoved(): void;
}) {
  const { type, draft, metamodel, objects, onChange } = props;
  const definition = draft.package.objectTypes.find((t) => t.key === type);
  if (!definition) return null;
  const set = (patch: Parameters<typeof updateObjectType>[2]) => onChange(updateObjectType(draft, type, patch));
  const resolved = metamodel.objectType(type);
  // A type cannot inherit from itself or from one of its own subtypes.
  const parents = typeTree(metamodel).filter(({ type: t }) => !t.lineage.includes(type));
  const keep = whyKeepObjectType(draft, type, objects);
  return (
    <section className="mm-general" aria-label="General">
      <label className="field">
        <span>Name</span>
        <input aria-label="Type label" value={definition.name} onChange={(e) => set({ name: e.target.value })} />
      </label>
      <label className="field">
        <span>Plural</span>
        <input
          aria-label="Plural"
          placeholder={`${definition.name}s`}
          value={definition.plural ?? ""}
          onChange={(e) => set({ plural: e.target.value })}
        />
      </label>
      <label className="field">
        <span>Kind of</span>
        <select
          aria-label="Kind of"
          value={definition.extends ?? ""}
          onChange={(e) => set({ extends: e.target.value || undefined })}
        >
          <option value="">Nothing (a type of its own)</option>
          {parents.map(({ type: t, depth }) => (
            <option key={t.definition.key} value={t.definition.key}>
              {" ".repeat(depth * 2)}
              {t.definition.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Category</span>
        <select
          aria-label="Category"
          value={definition.category ?? ""}
          onChange={(e) => set({ category: (e.target.value || undefined) as never })}
        >
          <option value="">{definition.extends ? `As its parent (${resolved?.category ?? "other"})` : "Other"}</option>
          {SEMANTIC_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {capital(c)}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Level</span>
        <select
          aria-label="Level"
          value={definition.level ?? ""}
          onChange={(e) => set({ level: (e.target.value || undefined) as never })}
        >
          <option value="">
            {definition.extends && resolved?.level ? `As its parent (${resolved.level})` : "None"}
          </option>
          {SEMANTIC_LEVELS.map((l) => (
            <option key={l} value={l}>
              {capital(l)}
            </option>
          ))}
        </select>
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={!!definition.abstract}
          onChange={(e) => set({ abstract: e.target.checked || undefined })}
        />
        Abstract: only its subtypes can be created
      </label>
      <div className="mm-general-actions">
        <span className="muted mono small">{type}</span>
        <span className="spacer" />
        <button
          className="danger"
          disabled={!!keep}
          title={keep ? `Cannot delete: ${keep}` : "Remove this type from the draft, with the rules that name it"}
          onClick={() => {
            onChange(removeObjectType(draft, type));
            props.onRemoved();
          }}
        >
          Delete type
        </button>
      </div>
    </section>
  );
}

/** Name, how it reads both ways and its meaning; removing it while no relationship uses it. */
export function RelationshipTypeGeneral(props: {
  type: TypeKey;
  draft: Draft;
  relationships: number;
  onChange(draft: Draft): void;
  onRemoved(): void;
}) {
  const { type, draft, relationships, onChange } = props;
  const definition = draft.package.relationshipTypes.find((t) => t.key === type);
  if (!definition) return null;
  const set = (patch: Parameters<typeof updateRelationshipType>[2]) =>
    onChange(updateRelationshipType(draft, type, patch));
  const keep =
    relationships > 0 ? `${relationships} relationship${relationships === 1 ? "" : "s"} of this type exist` : null;
  return (
    <section className="mm-general" aria-label="General">
      <label className="field">
        <span>Name</span>
        <input aria-label="Type label" value={definition.name} onChange={(e) => set({ name: e.target.value })} />
      </label>
      <label className="field">
        <span>Reads</span>
        <input aria-label="Reads" value={definition.verb} onChange={(e) => set({ verb: e.target.value })} />
      </label>
      <label className="field">
        <span>Reads back</span>
        <input
          aria-label="Reads back"
          value={definition.inverseVerb}
          onChange={(e) => set({ inverseVerb: e.target.value })}
        />
      </label>
      <p className="muted small">
        A <em>{definition.verb || "…"}</em> B; B <em>{definition.inverseVerb || "…"}</em> A.
      </p>
      <label className="field">
        <span>Meaning</span>
        <select
          aria-label="Meaning"
          value={definition.semantic ?? "association"}
          onChange={(e) => {
            const semantic = e.target.value as NonNullable<typeof definition.semantic>;
            const nestable = SEMANTIC_KINDS.find((k) => k.kind === semantic)?.nestable;
            // Only what the new kind allows is kept (containment always nests; only compositions cascade).
            set({
              semantic: semantic === "association" ? undefined : semantic,
              nesting: nestable && semantic !== "containment" ? definition.nesting : undefined,
              singleParent: nestable && semantic !== "containment" ? definition.singleParent : undefined,
              cascadeDelete: semantic === "composition" ? definition.cascadeDelete : undefined,
            });
          }}
        >
          {SEMANTIC_KINDS.map((k) => (
            <option key={k.kind} value={k.kind}>
              {capital(k.kind)}
            </option>
          ))}
        </select>
      </label>
      <p className="muted small">
        Nothing can be connected with it until a rule allows it: tick it in the Connection matrix.
      </p>
      <div className="mm-general-actions">
        <span className="muted mono small">{type}</span>
        <span className="spacer" />
        <button
          className="danger"
          disabled={!!keep}
          title={keep ? `Cannot delete: ${keep}` : "Remove this type from the draft, with its rules"}
          onClick={() => {
            onChange(removeRelationshipType(draft, type));
            props.onRemoved();
          }}
        >
          Delete type
        </button>
      </div>
    </section>
  );
}

/** Export the published metamodel (or the draft, when there is one) to a file; import one as the draft. */
export function MetamodelFileButtons(props: {
  draft: Draft;
  hasDraft: boolean;
  publishedVersion: string;
  onImport(draft: Draft): void;
  onError(message: string): void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const download = () => {
    const blob = new Blob([exportMetamodel(props.draft)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = metamodelFileName(props.draft.package.name, props.publishedVersion);
    a.click();
    URL.revokeObjectURL(url);
  };
  const load = async (file: File) => {
    try {
      props.onImport(importAsDraft(readMetamodel(await file.text()), props.publishedVersion));
    } catch (e) {
      props.onError(`Cannot import ${file.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  return (
    <span className="mm-file">
      <button
        onClick={download}
        title={
          props.hasDraft
            ? "Save the metamodel with your unpublished changes as a file"
            : "Save the metamodel as a file, to import into another repository"
        }
      >
        Export
      </button>
      <button onClick={() => input.current?.click()} title="Load a metamodel file as unpublished changes to review">
        Import…
      </button>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        hidden
        aria-label="Metamodel file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void load(file);
        }}
      />
    </span>
  );
}
