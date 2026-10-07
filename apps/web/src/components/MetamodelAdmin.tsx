// The metamodel tab (design/02-model/notation-and-metamodel-admin.md §10): types, the connection matrix, rule
// sentences and "try a connection", all over one draft of the relationship rules that is published as a new
// metamodel version.
import { useMemo, useState, type ReactNode } from "react";
import { newlyRefused, relationshipCombinations, type Combination, type Metamodel } from "@connectome/engine";
import type { TypeKey } from "@connectome/model";
import { useModel, useWorkbench, type MetamodelView } from "../state/workbench";
import { lineFor, notationFor, type Line } from "../notation";
import {
  KIND_FAMILY,
  compileDraft,
  countChanges,
  enforcementOf,
  matrixCell,
  pairUsage,
  ruleChanges,
  ruleKey,
  ruleUsage,
  setRule,
  tryConnection,
  typeLabel,
  typeTree,
  type CellEntry,
  type Enforcement,
  type KindFamily,
  type Rule,
} from "../metamodel-admin";
import { Glyph } from "./Glyph";
import { MatrixGrid } from "./MatrixGrid";

const VIEWS: { view: MetamodelView; label: string }[] = [
  { view: "types", label: "Types" },
  { view: "matrix", label: "Connection matrix" },
  { view: "sentences", label: "Rule sentences" },
  { view: "try", label: "Try a connection" },
];

const FAMILY_LABEL: Record<KindFamily, string> = {
  structure: "Structure",
  dependency: "Dependency",
  dynamic: "Behaviour and flow",
  influence: "Influence",
};

export function MetamodelAdmin() {
  const { store, state } = useModel();
  const view = useWorkbench((s) => s.metamodelView);
  const openMetamodel = useWorkbench((s) => s.openMetamodel);
  const draft = useWorkbench((s) => s.ruleDraft);
  const setDraft = useWorkbench((s) => s.setRuleDraft);
  const [reviewing, setReviewing] = useState(false);

  const published = store.metamodelPackage;
  const version = published.package.version;
  const publishedRules = published.package.relationshipRules ?? [];
  const rules = draft?.rules ?? publishedRules;
  const compiled = useMemo(() => compileDraft(published, rules), [published, rules]);
  // The draft always compiles (edits only pick existing types), but fall back to the published one if not.
  const metamodel = compiled.metamodel ?? store.metamodel;
  const combinations = useMemo(() => relationshipCombinations(state), [state]);
  const changes = ruleChanges(publishedRules, rules);
  const pending = countChanges(changes);

  const update = (next: Rule[]) =>
    setDraft(countChanges(ruleChanges(publishedRules, next)) === 0 ? null : { baseVersion: version, rules: next });

  return (
    <div className="metamodel-admin">
      <header className="mm-header">
        <h2>
          Metamodel <span className="muted">{published.package.name}</span>{" "}
          <span className="chip" title="Published version">
            {version}
          </span>
        </h2>
        <div className="mm-views" role="tablist" aria-label="Metamodel views">
          {VIEWS.map((v) => (
            <button
              key={v.view}
              role="tab"
              aria-selected={view === v.view}
              className={view === v.view ? "active" : ""}
              onClick={() => openMetamodel(v.view)}
            >
              {v.label}
            </button>
          ))}
        </div>
      </header>
      {draft && draft.baseVersion !== version && (
        <div className="banner error" role="alert">
          Someone published version {version} while you were editing. Discard your changes to see theirs.
        </div>
      )}
      <div className="mm-body">
        {view === "types" && <TypesView metamodel={metamodel} combinations={combinations} rules={rules} />}
        {view === "matrix" && (
          <MatrixView metamodel={metamodel} rules={rules} published={publishedRules} onChange={update} />
        )}
        {view === "sentences" && (
          <SentencesView
            metamodel={metamodel}
            rules={rules}
            published={publishedRules}
            combinations={combinations}
            onChange={update}
          />
        )}
        {view === "try" && <TryView metamodel={metamodel} rules={rules} />}
      </div>
      {pending > 0 && (
        <div className="mm-draft" role="region" aria-label="Unpublished changes">
          <span>
            {pending} change{pending === 1 ? "" : "s"} not published
          </span>
          <span className="spacer" />
          <button onClick={() => setDraft(null)}>Discard</button>
          <button className="primary" onClick={() => setReviewing(true)}>
            Review and publish…
          </button>
        </div>
      )}
      {reviewing && compiled.metamodel && (
        <PublishDialog
          draftMetamodel={compiled.metamodel}
          rules={rules}
          changes={changes}
          onClose={() => setReviewing(false)}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ types

function TypesView(props: { metamodel: Metamodel; combinations: Combination[]; rules: Rule[] }) {
  const { metamodel, combinations, rules } = props;
  const { state } = useModel();
  const objectsByType = new Map<string, number>();
  for (const o of state.objects.live()) objectsByType.set(o.type, (objectsByType.get(o.type) ?? 0) + 1);
  const relsByType = new Map<string, number>();
  for (const c of combinations) relsByType.set(c.relationshipType, (relsByType.get(c.relationshipType) ?? 0) + c.count);
  const rulesByType = new Map<string, number>();
  for (const r of rules) rulesByType.set(r.relationshipType, (rulesByType.get(r.relationshipType) ?? 0) + 1);

  return (
    <div className="mm-types">
      <section>
        <h3>Object types</h3>
        <table className="mm-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Key</th>
              <th>Category</th>
              <th>Level</th>
              <th className="num">Properties</th>
              <th className="num">Objects</th>
            </tr>
          </thead>
          <tbody>
            {typeTree(metamodel).map(({ type: t, depth }) => {
              const notation = notationFor(t);
              return (
                <tr key={t.definition.key} data-type={t.definition.key}>
                  <td style={{ paddingLeft: 8 + depth * 16 }}>
                    <span className="mm-type">
                      <Glyph glyph={notation.glyph} colour={notation.ink} />
                      {t.definition.name}
                      {t.definition.abstract && <span className="chip">abstract</span>}
                    </span>
                  </td>
                  <td className="muted mono">{t.definition.key}</td>
                  <td>{t.category}</td>
                  <td>{t.level ?? <span className="muted">—</span>}</td>
                  <td className="num">{t.properties.size}</td>
                  <td className="num">{objectsByType.get(t.definition.key) ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <section>
        <h3>Relationship types</h3>
        <table className="mm-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Line</th>
              <th>Reads</th>
              <th>Kind</th>
              <th className="num">Rules</th>
              <th className="num">Relationships</th>
            </tr>
          </thead>
          <tbody>
            {metamodel.allRelationshipTypes().map((rt) => (
              <tr key={rt.key} data-type={rt.key}>
                <td>{rt.name}</td>
                <td>
                  <LineSample line={lineFor(metamodel, rt.key)} />
                </td>
                <td>
                  {rt.verb} <span className="muted">/ {rt.inverseVerb}</span>
                </td>
                <td>{rt.semantic}</td>
                <td className="num">{rulesByType.get(rt.key) ?? 0}</td>
                <td className="num">{relsByType.get(rt.key) ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

// ------------------------------------------------------------------ matrix

function MatrixView(props: { metamodel: Metamodel; rules: Rule[]; published: Rule[]; onChange(rules: Rule[]): void }) {
  const { metamodel, rules, published, onChange } = props;
  const { state } = useModel();
  const [family, setFamily] = useState<KindFamily | "">("");
  const [only, setOnly] = useState<TypeKey>("");
  const [usedOnly, setUsedOnly] = useState(false);
  const [open, setOpen] = useState<{ source: TypeKey; target: TypeKey; at: { x: number; y: number } } | null>(null);
  const tree = typeTree(metamodel);
  const used = useMemo(() => pairUsage(state), [state]);
  const publishedKeys = new Set(published.map(ruleKey));

  const shown = (e: CellEntry) =>
    (!family || KIND_FAMILY[e.relationshipType.semantic] === family) && (!only || e.relationshipType.key === only);
  const pairUsed = (s: TypeKey, t: TypeKey) =>
    [...used.entries()].some(([k, n]) => {
      const [a, b] = k.split("->");
      return n > 0 && metamodel.isA(a!, s) && metamodel.isA(b!, t);
    });
  const rows = usedOnly
    ? tree.filter((r) => tree.some((c) => pairUsed(r.type.definition.key, c.type.definition.key)))
    : tree;
  const cols = usedOnly
    ? tree.filter((c) => tree.some((r) => pairUsed(r.type.definition.key, c.type.definition.key)))
    : tree;

  return (
    <div className="mm-matrix-view">
      <div className="mm-filters">
        <label>
          Kind
          <select value={family} onChange={(e) => setFamily(e.target.value as KindFamily | "")}>
            <option value="">All kinds</option>
            {(Object.keys(FAMILY_LABEL) as KindFamily[]).map((f) => (
              <option key={f} value={f}>
                {FAMILY_LABEL[f]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Relationship type
          <select value={only} onChange={(e) => setOnly(e.target.value)}>
            <option value="">All types</option>
            {metamodel.allRelationshipTypes().map((rt) => (
              <option key={rt.key} value={rt.key}>
                {rt.name}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={usedOnly} onChange={(e) => setUsedOnly(e.target.checked)} />
          Only types in use
        </label>
        <span className="spacer" />
        <Legend />
      </div>
      <MatrixGrid
        ariaLabel="Connection matrix"
        corner={<span className="muted">From ↓ · to →</span>}
        rows={rows.map(({ type: s, depth }) => ({
          key: s.definition.key,
          title: s.definition.name,
          depth,
          label: (
            <span className="mm-type">
              <Glyph glyph={notationFor(s).glyph} colour={notationFor(s).ink} />
              {s.definition.name}
            </span>
          ),
        }))}
        columns={cols.map(({ type: t }) => ({
          key: t.definition.key,
          title: t.definition.name,
          label: t.definition.name,
        }))}
        cellClass={(r, c) =>
          `${pairUsed(r.key, c.key) ? "used" : ""}${open?.source === r.key && open.target === c.key ? " open" : ""}`
        }
        renderCell={(r, c) => {
          const source = r.key;
          const target = c.key;
          const entries = matrixCell(metamodel, rules, source, target).filter(shown);
          const isOpen = open?.source === source && open.target === target;
          const label = `${r.title} to ${c.title}: ${
            entries.length ? entries.map((e) => e.relationshipType.verb).join(", ") : "nothing allowed"
          }`;
          return (
            <>
              <button
                className="cell-button"
                aria-label={label}
                title={label}
                data-source={source}
                data-target={target}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setOpen(isOpen ? null : { source, target, at: { x: rect.left, y: rect.bottom } });
                }}
              >
                {entries.map((e) => (
                  <span
                    key={e.relationshipType.key}
                    className={`dot ${KIND_FAMILY[e.relationshipType.semantic]}${
                      e.enforcement === "warn" ? " warn" : ""
                    }${e.own ? "" : " inherited"}${e.own && !publishedKeys.has(ruleKey(e.own)) ? " added" : ""}`}
                  />
                ))}
              </button>
              {isOpen && (
                <CellEditor
                  metamodel={metamodel}
                  rules={rules}
                  source={source}
                  target={target}
                  at={open.at}
                  onChange={onChange}
                  onClose={() => setOpen(null)}
                />
              )}
            </>
          );
        }}
      />
    </div>
  );
}

function Legend() {
  return (
    <span className="mm-legend" aria-label="Legend">
      {(Object.keys(FAMILY_LABEL) as KindFamily[]).map((f) => (
        <span key={f}>
          <span className={`dot ${f}`} /> {FAMILY_LABEL[f]}
        </span>
      ))}
      <span>
        <span className="dot dependency warn" /> Warns only
      </span>
      <span>
        <span className="dot dependency inherited" /> From a broader rule
      </span>
    </span>
  );
}

/** The popover on a matrix cell: every relationship type, ticked when a rule allows it for this exact pair. */
function CellEditor(props: {
  metamodel: Metamodel;
  rules: Rule[];
  source: TypeKey;
  target: TypeKey;
  /** Where the cell is on screen: the editor is fixed there, so the matrix's scrolling never clips it. */
  at: { x: number; y: number };
  onChange(rules: Rule[]): void;
  onClose(): void;
}) {
  const { metamodel, rules, source, target, at, onChange, onClose } = props;
  const entries = new Map(matrixCell(metamodel, rules, source, target).map((e) => [e.relationshipType.key, e]));
  const name = (k: TypeKey | "*") => typeLabel(metamodel, k);
  return (
    <div
      className="mm-cell-editor"
      style={{
        left: Math.max(8, Math.min(at.x, window.innerWidth - 340)),
        top: Math.max(8, Math.min(at.y + 4, window.innerHeight - 440)),
      }}
      role="dialog"
      aria-label={`Rules from ${name(source)} to ${name(target)}`}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <h4>
        {name(source)} → {name(target)}
      </h4>
      <ul className="plain">
        {metamodel.allRelationshipTypes().map((rt) => {
          const e = entries.get(rt.key);
          const inherited = e && !e.own ? e.inheritedFrom : undefined;
          return (
            <li key={rt.key}>
              <label>
                <input
                  type="checkbox"
                  checked={!!e}
                  disabled={!!inherited}
                  onChange={(ev) =>
                    onChange(setRule(rules, rt.key, source, target, ev.target.checked ? "block" : null))
                  }
                />
                <LineSample line={lineFor(metamodel, rt.key)} /> {rt.verb}
              </label>
              {inherited && (
                <span className="muted small">
                  {" "}
                  via {name(inherited.sourceType)} · {rt.verb} · {name(inherited.targetType)}
                </span>
              )}
              {e?.own && (
                <EnforcementToggle
                  value={enforcementOf(e.own)}
                  onChange={(v) => onChange(setRule(rules, rt.key, source, target, v))}
                />
              )}
            </li>
          );
        })}
      </ul>
      <div className="actions">
        <button onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

function EnforcementToggle({ value, onChange }: { value: Enforcement; onChange(v: Enforcement): void }) {
  return (
    <button
      className={`chip enforcement ${value}`}
      title={value === "block" ? "Refused when broken. Click to only warn" : "Allowed with a warning. Click to block"}
      onClick={() => onChange(value === "block" ? "warn" : "block")}
    >
      {value === "block" ? "blocks" : "warns"}
    </button>
  );
}

// ------------------------------------------------------------------ sentences

function SentencesView(props: {
  metamodel: Metamodel;
  rules: Rule[];
  published: Rule[];
  combinations: Combination[];
  onChange(rules: Rule[]): void;
}) {
  const { metamodel, rules, published, combinations, onChange } = props;
  const [filter, setFilter] = useState("");
  const [source, setSource] = useState<TypeKey>("");
  const [relationship, setRelationship] = useState<TypeKey>("");
  const [target, setTarget] = useState<TypeKey>("");
  const usage = ruleUsage(metamodel, rules, combinations);
  const publishedKeys = new Set(published.map(ruleKey));
  const name = (k: TypeKey | "*") => typeLabel(metamodel, k);
  const sentence = (r: Rule) =>
    `${name(r.sourceType)} ${metamodel.relationshipType(r.relationshipType)?.verb ?? r.relationshipType} ${name(r.targetType)}`;
  const sorted = [...rules].sort(
    (a, b) =>
      a.relationshipType.localeCompare(b.relationshipType) ||
      name(a.sourceType).localeCompare(name(b.sourceType)) ||
      name(a.targetType).localeCompare(name(b.targetType)),
  );
  const shown = sorted.filter((r) => sentence(r).toLowerCase().includes(filter.trim().toLowerCase()));
  const exists = rules.some(
    (r) => ruleKey(r) === ruleKey({ relationshipType: relationship, sourceType: source, targetType: target }),
  );
  const types = typeTree(metamodel);

  const typeOptions = (withAny: boolean) => (
    <>
      <option value="">Choose…</option>
      {withAny && <option value="*">any type</option>}
      {types.map(({ type: t, depth }) => (
        <option key={t.definition.key} value={t.definition.key}>
          {"  ".repeat(depth)}
          {t.definition.name}
        </option>
      ))}
    </>
  );

  return (
    <div className="mm-sentences">
      <form
        className="mm-add"
        aria-label="Add a rule"
        onSubmit={(e) => {
          e.preventDefault();
          if (!source || !relationship || !target || exists) return;
          onChange(setRule(rules, relationship, source, target, "block"));
        }}
      >
        <select aria-label="Source type" value={source} onChange={(e) => setSource(e.target.value)}>
          {typeOptions(true)}
        </select>
        <select aria-label="Relationship type" value={relationship} onChange={(e) => setRelationship(e.target.value)}>
          <option value="">Choose…</option>
          {metamodel.allRelationshipTypes().map((rt) => (
            <option key={rt.key} value={rt.key}>
              {rt.verb}
            </option>
          ))}
        </select>
        <select aria-label="Target type" value={target} onChange={(e) => setTarget(e.target.value)}>
          {typeOptions(true)}
        </select>
        <button className="primary" type="submit" disabled={!source || !relationship || !target || exists}>
          {exists ? "Already a rule" : "Add rule"}
        </button>
      </form>
      <input
        className="mm-filter"
        type="search"
        placeholder="Filter rules"
        aria-label="Filter rules"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <ul className="plain mm-rule-list" aria-label="Rules">
        {shown.map((r) => {
          const rt = metamodel.relationshipType(r.relationshipType);
          const uses = usage.get(ruleKey(r)) ?? 0;
          return (
            <li key={ruleKey(r)} data-rule={ruleKey(r)} className={publishedKeys.has(ruleKey(r)) ? "" : "added"}>
              <span className="sentence">
                <strong>{name(r.sourceType)}</strong>{" "}
                <span className="verb">
                  <LineSample line={lineFor(metamodel, r.relationshipType)} /> {rt?.verb ?? r.relationshipType}
                </span>{" "}
                <strong>{name(r.targetType)}</strong>
              </span>
              {!publishedKeys.has(ruleKey(r)) && <span className="chip new">new</span>}
              <span className="spacer" />
              <span className="muted small">{uses === 0 ? "not used" : `${uses} in use`}</span>
              <EnforcementToggle
                value={enforcementOf(r)}
                onChange={(v) => onChange(setRule(rules, r.relationshipType, r.sourceType, r.targetType, v))}
              />
              <button
                className="link"
                aria-label={`Remove rule ${sentence(r)}`}
                title="Remove this rule"
                onClick={() => onChange(setRule(rules, r.relationshipType, r.sourceType, r.targetType, null))}
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>
      <p className="muted small">
        {rules.length} rules. A rule on a parent type also covers its subtypes; "any type" covers every type.
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ try it

function TryView({ metamodel, rules }: { metamodel: Metamodel; rules: Rule[] }) {
  const concrete = typeTree(metamodel).filter(({ type: t }) => !t.definition.abstract);
  const [source, setSource] = useState<TypeKey>(concrete[0]?.type.definition.key ?? "");
  const [target, setTarget] = useState<TypeKey>(concrete[1]?.type.definition.key ?? "");
  const result = source && target ? tryConnection(metamodel, rules, source, target) : null;
  const name = (k: TypeKey | "*") => typeLabel(metamodel, k);
  const picker = (label: string, value: TypeKey, set: (k: TypeKey) => void) => (
    <label>
      {label}
      <select aria-label={label} value={value} onChange={(e) => set(e.target.value)}>
        {concrete.map(({ type: t }) => (
          <option key={t.definition.key} value={t.definition.key}>
            {t.definition.name}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="mm-try">
      <div className="mm-filters">
        {picker("From", source, setSource)}
        <button
          aria-label="Swap"
          title="Swap"
          onClick={() => {
            setSource(target);
            setTarget(source);
          }}
        >
          ⇄
        </button>
        {picker("To", target, setTarget)}
      </div>
      {result && (
        <div className="mm-try-result" aria-label="What a modeller gets">
          <Block title="Connecting them offers">
            {result.connect.length === 0 ? (
              <p className="refused" role="status">
                {result.refused}
              </p>
            ) : (
              <ol className="mm-offer">
                {result.connect.map((c) => (
                  <li key={c.relationshipType.key}>
                    <LineSample line={lineFor(metamodel, c.relationshipType.key)} /> <strong>{name(source)}</strong>{" "}
                    {c.relationshipType.verb} <strong>{name(target)}</strong>
                    {c.enforcement === "warn" && <span className="chip warn">with a warning</span>}
                    <span className="muted small">
                      {" "}
                      rule: {name(c.rule.sourceType)} · {c.relationshipType.verb} · {name(c.rule.targetType)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Block>
          <Block title="Nesting">
            <p>
              {result.nest.length > 0
                ? `${name(target)} can be placed inside ${name(source)} (${result.nest.map((n) => n.verb).join(", ")}).`
                : `${name(target)} can't be placed inside ${name(source)}.`}
            </p>
          </Block>
        </div>
      )}
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mm-block">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

// ------------------------------------------------------------------ publishing

function PublishDialog(props: {
  draftMetamodel: Metamodel;
  rules: Rule[];
  changes: ReturnType<typeof ruleChanges>;
  onClose(): void;
}) {
  const { draftMetamodel, rules, changes, onClose } = props;
  const { store, state, metamodel } = useModel();
  const session = useWorkbench((s) => s.session)!;
  const draft = useWorkbench((s) => s.ruleDraft);
  const setDraft = useWorkbench((s) => s.setRuleDraft);
  const notify = useWorkbench((s) => s.notify);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refused = useMemo(() => newlyRefused(state, metamodel, draftMetamodel), [state, metamodel, draftMetamodel]);
  const name = (k: TypeKey | "*") => typeLabel(draftMetamodel, k);
  const verb = (k: TypeKey) => draftMetamodel.relationshipType(k)?.verb ?? k;
  const sentence = (r: { relationshipType: TypeKey; sourceType: TypeKey; targetType: TypeKey }) =>
    `${name(r.sourceType)} · ${verb(r.relationshipType)} · ${name(r.targetType)}`;

  const publish = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await session.api.publishRelationshipRules(store.repository.id, {
        baseVersion: draft?.baseVersion ?? store.metamodelPackage.package.version,
        relationshipRules: rules,
      });
      setDraft(null);
      onClose();
      notify(`Published metamodel ${result.version}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const list = (title: string, items: Rule[], className: string) =>
    items.length > 0 && (
      <section>
        <h3>
          {title} ({items.length})
        </h3>
        <ul className={`plain ${className}`}>
          {items.map((r) => (
            <li key={ruleKey(r)}>
              {sentence(r)} <span className="muted small">{enforcementOf(r) === "warn" ? "warns" : "blocks"}</span>
            </li>
          ))}
        </ul>
      </section>
    );

  return (
    <div className="backdrop" onClick={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Publish the metamodel"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
      >
        <h2>Publish the metamodel?</h2>
        <p>
          Everyone working in {store.repository.name} gets the new rules at once, in every scenario. Nothing in the
          model is changed or deleted.
        </p>
        {list("Rules added", changes.added, "added")}
        {list("Rules removed", changes.removed, "removed")}
        {list("Rules changed", changes.changed, "changed")}
        <section>
          <h3>Effect on existing relationships</h3>
          {refused.length === 0 ? (
            <p className="muted">Every existing relationship is still allowed.</p>
          ) : (
            <>
              <p>
                {refused.reduce((n, c) => n + c.count, 0)} relationships will no longer be allowed. They stay in the
                model and are flagged until someone fixes them:
              </p>
              <ul className="plain removed">
                {refused.map((c) => (
                  <li key={`${c.relationshipType}|${c.sourceType}|${c.targetType}`}>
                    {sentence(c)} <span className="muted small">× {c.count}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          <button onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy} onClick={() => void publish()}>
            {busy ? "Publishing…" : "Publish"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ line sample

const HEADS: Record<string, (x: number, dir: 1 | -1) => ReactNode> = {
  arrow: (x, d) => <path d={`M${x - 6 * d} 2L${x} 6L${x - 6 * d} 10z`} fill="currentColor" />,
  arrowOpen: (x, d) => <path d={`M${x - 6 * d} 2L${x} 6L${x - 6 * d} 10`} fill="none" stroke="currentColor" />,
  arrowSmall: (x, d) => <path d={`M${x - 4 * d} 4L${x} 6L${x - 4 * d} 8z`} fill="currentColor" />,
  triangleOpen: (x, d) => (
    <path d={`M${x - 7 * d} 2L${x} 6L${x - 7 * d} 10z`} fill="var(--pane)" stroke="currentColor" />
  ),
  diamond: (x, d) => <path d={`M${x} 6L${x - 5 * d} 3L${x - 10 * d} 6L${x - 5 * d} 9z`} fill="currentColor" />,
  diamondOpen: (x, d) => (
    <path d={`M${x} 6L${x - 5 * d} 3L${x - 10 * d} 6L${x - 5 * d} 9z`} fill="var(--pane)" stroke="currentColor" />
  ),
  dot: (x) => <circle cx={x} cy={6} r={2.5} fill="currentColor" />,
};

/** A relationship type's line, small: its dash and its heads (notation-and-metamodel-admin.md §3). */
function LineSample({ line }: { line: Line }) {
  return (
    <svg className="line-sample" width={40} height={12} viewBox="0 0 40 12" aria-hidden="true">
      <line
        x1={3}
        y1={6}
        x2={37}
        y2={6}
        stroke="currentColor"
        strokeWidth={line.width ? 2.5 : 1.25}
        strokeDasharray={line.dash}
      />
      {HEADS[line.start]?.(3, -1)}
      {HEADS[line.end]?.(37, 1)}
    </svg>
  );
}
