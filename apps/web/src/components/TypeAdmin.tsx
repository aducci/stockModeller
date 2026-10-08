// Making types from scratch in the metamodel tab: a new object, relationship or diagram type, the general settings
// of object and relationship types (name, parent, meaning), removing unused ones, and the metamodel as a file.
import { useState, type FormEvent, type ReactNode } from "react";
import type { Metamodel } from "@connectome/engine";
import { SEMANTIC_CATEGORIES, SEMANTIC_KINDS, SEMANTIC_LEVELS, type TypeKey } from "@connectome/model";
import type { Draft } from "../property-admin";
import { setRule, typeLabel, typeTree, type Rule } from "../metamodel-admin";
import {
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

/** A "?" beside a setting: hovering shows the explanation, clicking keeps it open under the setting. */
export function HelpTip({ about, children }: { about: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="help-tip"
        aria-label={`About ${about}`}
        aria-expanded={open}
        title={typeof children === "string" ? children : undefined}
        onClick={(e) => {
          e.preventDefault();
          setOpen(!open);
        }}
      >
        ?
      </button>
      {open && (
        <span className="help-text" role="note">
          {children}
        </span>
      )}
    </>
  );
}

const LEVEL_HELP =
  "How concrete the type's objects are. Conceptual: what, in business terms (Payment service). Logical: how, " +
  "independent of technology (Payment API). Physical: the concrete technical form (GET /payments/{id}). " +
  "Implementation: the deployed, running thing (payments-service in production). New objects start at this level; " +
  "names may repeat across levels, and the trace view orders by level. Nothing is refused because of a level.";
const ABSTRACT_HELP =
  "An abstract type only groups its subtypes: nobody can create an object of it, but rules, properties and " +
  "diagram types set on it apply to every subtype. Use it for a family such as Application, with Business " +
  "application and Integration platform below it.";

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
        <span>
          Level <HelpTip about="levels">{LEVEL_HELP}</HelpTip>
        </span>
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
        <HelpTip about="abstract types">{ABSTRACT_HELP}</HelpTip>
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
        Nothing can be connected with it until a rule allows it: add one under Rules, or tick it in the Connection
        matrix.
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

/**
 * The rules naming one relationship type (notation-and-metamodel-admin.md §10.6): from which type to which it may
 * connect, whether a broken rule blocks or only warns, and a row to add another. The connection matrix and the rule
 * sentences edit the same rules.
 */
export function RelationshipTypeRules(props: {
  type: TypeKey;
  draft: Draft;
  metamodel: Metamodel;
  onChange(draft: Draft): void;
}) {
  const { type, draft, metamodel, onChange } = props;
  const rules = draft.package.relationshipRules ?? [];
  const own = rules.filter((r) => r.relationshipType === type);
  const types = typeTree(metamodel);
  const [source, setSource] = useState<TypeKey>("*");
  const [target, setTarget] = useState<TypeKey>("*");
  const update = (next: Rule[]) => onChange({ ...draft, package: { ...draft.package, relationshipRules: next } });
  const name = (key: TypeKey) => typeLabel(metamodel, key);
  const exists = own.some((r) => r.sourceType === source && r.targetType === target);
  const typeSelect = (label: string, value: TypeKey, set: (key: TypeKey) => void) => (
    <select aria-label={label} value={value} onChange={(e) => set(e.target.value)}>
      <option value="*">Any type</option>
      {types.map(({ type: t, depth }) => (
        <option key={t.definition.key} value={t.definition.key}>
          {"\u00a0".repeat(depth * 2)}
          {t.definition.name}
        </option>
      ))}
    </select>
  );
  return (
    <section className="mm-general mm-type-rules" aria-label="Rules">
      <h4>Rules</h4>
      {own.length === 0 && <p className="muted small">No rules yet: nothing can be connected with this type.</p>}
      <ul className="plain">
        {own.map((r) => (
          <li key={`${r.sourceType}->${r.targetType}`}>
            <span>
              {name(r.sourceType)} → {name(r.targetType)}
            </span>
            <button
              className={`chip enforcement ${r.enforcement === "warn" ? "warn" : "block"}`}
              title={
                r.enforcement === "warn"
                  ? "Allowed with a warning. Click to block"
                  : "Refused when broken. Click to only warn"
              }
              onClick={() =>
                update(setRule(rules, type, r.sourceType, r.targetType, r.enforcement === "warn" ? "block" : "warn"))
              }
            >
              {r.enforcement === "warn" ? "warns" : "blocks"}
            </button>
            <button
              className="link"
              aria-label={`Remove the rule from ${name(r.sourceType)} to ${name(r.targetType)}`}
              onClick={() => update(setRule(rules, type, r.sourceType, r.targetType, null))}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <div className="mm-rule-add">
        {typeSelect("Rule from", source, setSource)}
        <span>→</span>
        {typeSelect("Rule to", target, setTarget)}
        <button
          disabled={exists}
          title={exists ? "This rule exists already" : undefined}
          onClick={() => update(setRule(rules, type, source, target, "block"))}
        >
          Add rule
        </button>
      </div>
    </section>
  );
}
