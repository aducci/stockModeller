// Finding objects similar to a name (design/02-model/duplicates-and-identity.md §5–6). Pure: the web app runs it on
// every keystroke of a find-or-create box, and the server will run it for the possible-duplicates report.
import type { Id, TypeKey } from "@connectome/model";
import type { Metamodel } from "./metamodel";
import type { ObjectRow } from "./rows";
import type { ModelState } from "./state";

/** How a candidate's type relates to the type asked for. */
export type Kinship = "same" | "family" | "other";

export interface SimilarObject {
  object: ObjectRow;
  /** 0–1: 1 is the same name once normalised. */
  score: number;
  kinship: Kinship;
  /** Same type and the same normalised name: reusing it is the default. */
  exact: boolean;
  /** Why it matched, in words, e.g. "Same name" or "CRM stands for Customer Relationship Management". */
  reason: string;
}

export interface SimilarQuery {
  name: string;
  /** The type of the object about to be created. Without it every candidate counts as the same type. */
  type?: TypeKey;
  /** Objects never to suggest (the object being renamed, say). */
  exclude?: ReadonlySet<Id>;
  limit?: number;
  /** Scores below this are not suggested. */
  minScore?: number;
}

/**
 * A name as matching sees it: Unicode-normalised, case-folded, without accents, with separators (spaces, dashes,
 * underscores, dots, slashes, brackets, quotes, commas) collapsed to single spaces. Symbols that change meaning
 * (`+`, `#`, `&`) are kept, so *C++* and *C* stay different.
 */
export function normaliseName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\s\-_./\\,;:'"`’()[\]{}|]+/g, " ")
    .trim();
}

const words = (normalised: string) => normalised.split(" ").filter(Boolean);

/** The first letters of a name's words, with and without small words: "Order to Cash" → "otc", "oc". */
function initials(normalised: string): string[] {
  const all = words(normalised);
  const first = (ws: string[]) => ws.map((w) => w[0]).join("");
  return [first(all), first(all.filter((w) => !STOP_WORDS.has(w)))];
}

const STOP_WORDS = new Set(["and", "of", "the", "for", "a", "an", "to", "in", "on"]);

function trigrams(normalised: string): Map<string, number> {
  const padded = `  ${normalised} `;
  const grams = new Map<string, number>();
  for (let i = 0; i + 3 <= padded.length; i++) {
    const g = padded.slice(i, i + 3);
    grams.set(g, (grams.get(g) ?? 0) + 1);
  }
  return grams;
}

/** Dice coefficient over trigram multisets (like pg_trgm's similarity, which the server uses for large sets). */
function trigramSimilarity(a: string, b: string): number {
  const ga = trigrams(a);
  const gb = trigrams(b);
  let shared = 0;
  let total = 0;
  for (const n of ga.values()) total += n;
  for (const n of gb.values()) total += n;
  for (const [g, n] of ga) shared += Math.min(n, gb.get(g) ?? 0);
  return total === 0 ? 0 : (2 * shared) / total;
}

/** Whether every word typed starts a different word of the candidate, in order: "cla man" → "Claims Manager". */
function wordPrefixes(query: string[], candidate: string[]): boolean {
  let at = 0;
  for (const q of query) {
    while (at < candidate.length && !candidate[at]!.startsWith(q)) at++;
    if (at === candidate.length) return false;
    at++;
  }
  return true;
}

/**
 * How alike two names are, 0–1, and why. Both are raw names; they are normalised here. `prefixes: false` leaves out
 * the signals for a name still being typed, so comparing two finished names is symmetric.
 */
export function nameSimilarity(
  query: string,
  candidate: string,
  { prefixes = true }: { prefixes?: boolean } = {},
): { score: number; reason: string } {
  const q = normaliseName(query);
  const c = normaliseName(candidate);
  if (!q || !c) return { score: 0, reason: "" };
  if (q === c) return { score: 1, reason: "Same name" };
  const qw = words(q);
  const cw = words(c);
  if (qw.length > 1 && [...qw].sort().join(" ") === [...cw].sort().join(" "))
    return { score: 0.95, reason: "Same words in another order" };

  let best = { score: 0, reason: "" };
  const consider = (score: number, reason: string) => {
    if (score > best.score) best = { score, reason };
  };
  // An acronym typed for a long name, or the other way round.
  if (qw.length === 1 && q.length >= 2 && cw.length >= 2 && initials(c).includes(q))
    consider(0.85, `${query.trim()} stands for ${candidate.trim()}`);
  if (cw.length === 1 && c.length >= 2 && qw.length >= 2 && initials(q).includes(c))
    consider(0.85, `${candidate.trim()} stands for ${query.trim()}`);
  // What has been typed so far starts the name (or each of its words).
  if (prefixes && c.startsWith(q)) consider(0.6 + 0.35 * (q.length / c.length), "Starts with what you typed");
  else if (prefixes && wordPrefixes(qw, cw))
    consider(0.55 + 0.35 * (q.replace(/ /g, "").length / c.length), "Matches its words");
  // Spelling: typos, plurals, abbreviations.
  const t = trigramSimilarity(q, c);
  consider(t, "Similar spelling");
  return best;
}

/**
 * Keys under which two names may match, for comparing only likely pairs in a large model: the start of each word, the
 * initials, and the word set. Names that match on spelling, word order or an acronym share at least one.
 */
export function nameKeys(name: string): string[] {
  const n = normaliseName(name);
  const ws = words(n);
  if (ws.length === 0) return [];
  const keys = new Set<string>([`s:${[...ws].sort().join(" ")}`]);
  for (const w of ws) if (!STOP_WORDS.has(w)) keys.add(`w:${w.slice(0, 4)}`);
  if (ws.length > 1) for (const i of initials(n)) keys.add(`i:${i}`);
  else keys.add(`i:${ws[0]}`);
  return [...keys];
}

/** An object's name and its other names (aliases). */
export const namesOf = (object: ObjectRow): string[] => [object.name, ...(object.aliases ?? [])];

/** Same type, a parent or child type (an application and a SaaS application), or unrelated. */
export function kinshipOf(metamodel: Metamodel, wanted: TypeKey, candidate: TypeKey): Kinship {
  if (wanted === candidate) return "same";
  if (metamodel.isA(wanted, candidate) || metamodel.isA(candidate, wanted)) return "family";
  // Siblings under a common (often abstract) parent: application and SaaS application both extend applicationBase.
  const parent = metamodel.objectType(wanted)?.definition.extends;
  if (parent && metamodel.isA(candidate, parent)) return "family";
  return "other";
}

/** How much a related or unrelated type counts against a match when ranking. */
const KIN_PENALTY: Record<Kinship, number> = { same: 0, family: 0.05, other: 0.15 };

/**
 * Live objects whose names are like `query.name`, best first. An exact match (same type, same normalised name) is
 * always first; then the score, with related types ranked a little lower and unrelated ones lower still.
 */
export function findSimilarObjects(state: ModelState, metamodel: Metamodel, query: SimilarQuery): SimilarObject[] {
  const { name, type, exclude, limit = 8, minScore = 0.45 } = query;
  if (!normaliseName(name)) return [];
  const found: SimilarObject[] = [];
  for (const object of state.objects.live()) {
    if (exclude?.has(object.id)) continue;
    // Its other names count too: typing "Claims Mgmt" finds the object that is also known by it.
    let { score, reason } = nameSimilarity(name, object.name);
    for (const alias of object.aliases ?? []) {
      const viaAlias = nameSimilarity(name, alias);
      if (viaAlias.score > score) ({ score, reason } = { score: viaAlias.score, reason: `Also known as ${alias}` });
    }
    if (score < minScore) continue;
    const kinship = type ? kinshipOf(metamodel, type, object.type) : "same";
    // Unrelated types only show when they are close: they are a hint ("link instead?"), not a candidate to reuse.
    if (kinship === "other" && score < 0.8) continue;
    found.push({ object, score, kinship, exact: score === 1 && kinship === "same", reason });
  }
  found.sort(
    (a, b) =>
      Number(b.exact) - Number(a.exact) ||
      b.score - KIN_PENALTY[b.kinship] - (a.score - KIN_PENALTY[a.kinship]) ||
      a.object.name.localeCompare(b.object.name),
  );
  return found.slice(0, limit);
}
