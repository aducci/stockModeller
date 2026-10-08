// Resolving a document template (views-and-design-artifacts.md §8.4): its base (`extends`), its patterns (`use` with
// parameters and a key prefix) and its overrides, into one list of sections and regions. Pure, so the engine checks
// the result when a package loads and the views project the same thing.
import type { TypeKey } from "./model";
import type {
  DocumentPattern,
  DocumentTemplate,
  PatternUse,
  RegionDefinition,
  ResolvedSection,
  ResolvedTemplate,
  SectionDefinition,
  TemplateEntry,
} from "./views";

export const isRegion = (e: TemplateEntry): e is RegionDefinition => "region" in e;
export const isPatternUse = (e: TemplateEntry): e is PatternUse => "use" in e;
export const entryKey = (e: SectionDefinition | RegionDefinition) => ("region" in e ? e.region : e.key);

const PARAM = /^\$template\.([A-Za-z][A-Za-z0-9]*)$/;

/** Replaces `"$template.x"` strings by the parameters; a parameter of `null` removes the key or array item. */
function substitute(value: unknown, params: Record<string, unknown>, missing: Set<string>): unknown {
  if (typeof value === "string") {
    const m = PARAM.exec(value);
    if (!m) return value;
    if (!(m[1]! in params)) {
      missing.add(m[1]!);
      return null;
    }
    return params[m[1]!] ?? null;
  }
  if (Array.isArray(value))
    return value.map((v) => substitute(v, params, missing)).filter((v) => v !== null && v !== undefined);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const next = substitute(v, params, missing);
      if (next !== null && next !== undefined) out[k] = next;
    }
    return out;
  }
  return value;
}

const prefixed = (prefix: string | undefined, key: string) =>
  prefix ? `${prefix}${key.charAt(0).toUpperCase()}${key.slice(1)}` : key;

/** A section's references to other sections of its pattern, renamed with the prefix. */
function renameRefs(section: SectionDefinition, rename: (key: string) => string): SectionDefinition {
  if (section.component === "relationTable" && section.config.source.section !== undefined)
    return {
      ...section,
      config: {
        ...section.config,
        source: { ...section.config.source, section: rename(section.config.source.section) },
      },
    };
  if (section.component === "repeater")
    return { ...section, config: { ...section.config, source: { section: rename(section.config.source.section) } } };
  return section;
}

function expandPattern(
  use: PatternUse,
  pattern: DocumentPattern,
  where: string,
  problems: string[],
): (SectionDefinition | RegionDefinition)[] {
  const params: Record<string, unknown> = {};
  for (const [name, p] of Object.entries(pattern.params ?? {}))
    if (use.with && name in use.with) params[name] = use.with[name];
    else if ("default" in p) params[name] = p.default;
  for (const name of Object.keys(use.with ?? {}))
    if (!(name in (pattern.params ?? {})))
      problems.push(`${where} sets "${name}", which pattern "${pattern.key}" has not`);
  const missing = new Set<string>();
  const own = new Set(pattern.sections.map(entryKey));
  const rename = (key: string) => (own.has(key) ? prefixed(use.prefix, key) : key);
  const out = pattern.sections.map((entry) => {
    const resolved = substitute(entry, params, missing) as SectionDefinition | RegionDefinition;
    if (isRegion(resolved)) return { ...resolved, region: rename(resolved.region) };
    return { ...renameRefs(resolved, rename), key: rename(resolved.key) };
  });
  for (const name of missing) problems.push(`${where} does not set "${name}", which pattern "${pattern.key}" needs`);
  return out;
}

/**
 * Resolves a template. `templateOf` gives another document type's template (for `extends`); problems are collected,
 * not thrown, so a package reports them all at once.
 */
export function resolveTemplate(
  key: TypeKey,
  templateOf: (key: TypeKey) => DocumentTemplate | undefined,
  patterns: readonly DocumentPattern[],
  problems: string[],
  seen: readonly TypeKey[] = [],
): ResolvedTemplate {
  const where = `Document template "${key}"`;
  const template = templateOf(key);
  if (!template) return { subject: {}, entries: [] };
  if (seen.includes(key)) {
    problems.push(`${where} extends itself through ${[...seen, key].join(" → ")}`);
    return { subject: {}, entries: [] };
  }
  let entries: (SectionDefinition | RegionDefinition)[] = [];
  let subject = template.subject ?? {};
  if (template.extends !== undefined) {
    if (!templateOf(template.extends))
      problems.push(`${where} extends "${template.extends}", which is not a document type`);
    else {
      const base = resolveTemplate(template.extends, templateOf, patterns, problems, [...seen, key]);
      entries = base.entries;
      if (!template.subject) subject = base.subject;
    }
  }
  for (const entry of template.sections) {
    let added: (SectionDefinition | RegionDefinition)[];
    if (isPatternUse(entry)) {
      const pattern = patterns.find((p) => p.key === entry.use);
      if (!pattern) {
        problems.push(`${where} uses unknown pattern "${entry.use}"`);
        continue;
      }
      added = expandPattern(entry, pattern, `${where}, pattern "${entry.use}"`, problems);
    } else added = [entry];
    const after = entry.after;
    const strip = (e: SectionDefinition | RegionDefinition) => {
      const { after: _after, ...rest } = e;
      return rest as SectionDefinition | RegionDefinition;
    };
    if (after === undefined) entries.push(...added.map(strip));
    else {
      const at = entries.findIndex((e) => entryKey(e) === after);
      if (at < 0) {
        problems.push(`${where} inserts after "${after}", which it does not have`);
        entries.push(...added.map(strip));
      } else entries.splice(at + 1, 0, ...added.map(strip));
    }
  }
  for (const [k, override] of Object.entries(template.overrides ?? {})) {
    const at = entries.findIndex((e) => !isRegion(e) && e.key === k);
    if (at < 0) problems.push(`${where} overrides "${k}", which it does not have`);
    else entries[at] = { ...entries[at]!, ...override } as SectionDefinition;
  }
  const withLocks = (s: SectionDefinition): ResolvedSection => {
    const section = { ...s, lock: s.lock ?? "configurable", allow: s.allow ?? {} } as ResolvedSection;
    if (section.component === "repeater")
      return {
        ...section,
        config: { ...section.config, sections: section.config.sections.map(withLocks) },
      } as ResolvedSection;
    return section;
  };
  return { subject, entries: entries.map((e) => (isRegion(e) ? e : withLocks(e))) };
}

/** Whether an author may change this in the section (§8.2). */
export function sectionMay(
  section: ResolvedSection,
  freedom: "hide" | "rename" | "addProperties" | "columns",
): boolean {
  if (section.lock === "fixed") return false;
  if (freedom === "hide") return !section.required && (section.lock === "free" || section.allow.hide === true);
  if (freedom === "rename") return section.lock === "free";
  return section.lock === "free" || section.allow[freedom] === true;
}
