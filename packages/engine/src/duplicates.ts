// Possible duplicates across a repository (design/02-model/duplicates-and-identity.md §6). Pure: the web app runs it
// over the loaded model for the Possible duplicates view and the properties panel.
import type { Id } from "@connectome/model";
import { containerOf, sameName } from "./identity";
import type { Metamodel } from "./metamodel";
import type { ObjectRow } from "./rows";
import { kinshipOf, nameKeys, nameSimilarity, namesOf } from "./similar";
import type { ModelState } from "./state";

export interface DuplicatePair {
  /** The two objects, `a` first by id. */
  a: ObjectRow;
  b: ObjectRow;
  /** 0–1: how likely they are one thing. */
  score: number;
  /** Why, strongest first, e.g. "Same name", "Each serves Handle Claim, Settle Claim". */
  reasons: string[];
}

export interface DuplicateQuery {
  /** Only pairs that include this object. */
  objectId?: Id;
  /** Pairs scoring below this are left out (default 0.75). */
  minScore?: number;
  limit?: number;
}

/** Buckets larger than this are too common to say anything (a word every name has, a hub everything connects to). */
const MAX_BUCKET = 300;
/** How much a perfect neighbour overlap counts, combined with the name score as independent evidence. */
const NEIGHBOUR_WEIGHT = 0.8;
/** Neighbours shared before the overlap counts in full: two objects that both serve one process say little. */
const FULL_OVERLAP_AT = 4;

/** Whether someone judged the two objects different while they had their current names. */
export function judgedDistinct(a: ObjectRow, b: ObjectRow): boolean {
  const judged = (x: ObjectRow, y: ObjectRow) =>
    (x.notDuplicates ?? []).some((v) => v.of === y.id && sameName(v.name, x.name) && sameName(v.otherName, y.name));
  return judged(a, b) || judged(b, a);
}

/**
 * Pairs of live objects that may be one thing entered twice, best first. Only objects of related types (the same
 * type, a parent, a child or a sibling) at the same semantic level are compared, and only when they share a name key
 * or a neighbour. Signals: their names and other names (spelling, word order, acronyms), the related objects they
 * share, and the same folder or container. Pairs judged *not duplicates* under their current names, and pairs related
 * to each other directly, are left out.
 */
export function possibleDuplicates(
  state: ModelState,
  metamodel: Metamodel,
  query: DuplicateQuery = {},
): DuplicatePair[] {
  const { objectId, minScore = 0.75, limit = 200 } = query;
  const objects = [...state.objects.live()];

  // What each object is related to, as "verb other" for the reasons, and who it is related to directly.
  const neighbours = new Map<Id, Map<string, string>>();
  const direct = new Set<string>();
  const neighbourBuckets = new Map<string, Id[]>();
  for (const rel of state.relationships.live()) {
    const type = metamodel.relationshipType(rel.type);
    const source = state.objects.get(rel.sourceId);
    const target = state.objects.get(rel.targetId);
    if (!type || !source || !target) continue;
    direct.add(pairKey(source.id, target.id));
    const add = (self: Id, key: string, words: string) => {
      let map = neighbours.get(self);
      if (!map) neighbours.set(self, (map = new Map()));
      map.set(key, words);
      push(neighbourBuckets, key, self);
    };
    add(source.id, `${rel.type}>${target.id}`, `${type.verb} ${target.name}`);
    add(target.id, `${rel.type}<${source.id}`, `${type.inverseVerb} ${source.name}`);
  }

  const nameBuckets = new Map<string, Id[]>();
  for (const o of objects) {
    const keys = new Set(namesOf(o).flatMap(nameKeys));
    for (const k of keys) push(nameBuckets, k, o.id);
  }

  // Candidate pairs: objects sharing a bucket that is small enough to mean something.
  const candidates = new Set<string>();
  const collect = (bucket: Id[]) => {
    if (bucket.length < 2 || bucket.length > MAX_BUCKET) return;
    if (objectId) {
      if (bucket.includes(objectId))
        for (const other of bucket) if (other !== objectId) candidates.add(pairKey(objectId, other));
      return;
    }
    for (let i = 0; i < bucket.length; i++)
      for (let j = i + 1; j < bucket.length; j++) candidates.add(pairKey(bucket[i]!, bucket[j]!));
  };
  for (const bucket of nameBuckets.values()) collect(bucket);
  for (const bucket of neighbourBuckets.values()) collect(bucket);

  const containers = new Map<Id, Id | null>();
  const containerOfCached = (id: Id) => {
    if (!containers.has(id)) containers.set(id, containerOf(state, metamodel, id));
    return containers.get(id)!;
  };

  const found: DuplicatePair[] = [];
  for (const key of candidates) {
    if (direct.has(key)) continue;
    const [idA, idB] = key.split("|") as [Id, Id];
    const a = state.objects.get(idA)!;
    const b = state.objects.get(idB)!;
    if (kinshipOf(metamodel, a.type, b.type) === "other") continue;
    if (metamodel.objectLevel(a) !== metamodel.objectLevel(b)) continue;
    if (judgedDistinct(a, b)) continue;

    const reasons: { weight: number; text: string }[] = [];
    // Names: the best match over each one's names and other names.
    let name = { score: 0, text: "" };
    for (const x of namesOf(a))
      for (const y of namesOf(b)) {
        const s = nameSimilarity(x, y, { prefixes: false });
        if (s.score > name.score) name = { score: s.score, text: nameReason(a, b, x, y, s.reason) };
      }
    if (name.score >= 0.5) reasons.push({ weight: name.score, text: name.text });

    // Neighbours: the share of their relationships (by type, direction and other end) they have in common.
    const na = neighbours.get(a.id) ?? new Map<string, string>();
    const nb = neighbours.get(b.id) ?? new Map<string, string>();
    const shared = [...na.keys()].filter((k) => nb.has(k));
    let overlap = 0;
    if (shared.length >= 2) {
      const jaccard = shared.length / (na.size + nb.size - shared.length);
      overlap = jaccard * Math.min(1, shared.length / FULL_OVERLAP_AT);
      reasons.push({ weight: overlap, text: sharedReason(shared.map((k) => na.get(k)!)) });
    }

    const score = 1 - (1 - name.score) * (1 - NEIGHBOUR_WEIGHT * overlap);
    if (score < minScore) continue;
    const together =
      containerOfCached(a.id) !== null && containerOfCached(a.id) === containerOfCached(b.id)
        ? "In the same container"
        : a.folderId === b.folderId
          ? "In the same folder"
          : null;
    reasons.sort((x, y) => y.weight - x.weight);
    found.push({
      a,
      b,
      score: Math.round(score * 100) / 100,
      reasons: [...reasons.map((r) => r.text), ...(together ? [together] : [])],
    });
  }
  found.sort((x, y) => y.score - x.score || x.a.name.localeCompare(y.a.name) || x.b.name.localeCompare(y.b.name));
  return found.slice(0, limit);
}

const pairKey = (x: Id, y: Id) => (x < y ? `${x}|${y}` : `${y}|${x}`);

function push(map: Map<string, Id[]>, key: string, id: Id) {
  const list = map.get(key);
  if (!list) map.set(key, [id]);
  else if (list[list.length - 1] !== id) list.push(id);
}

/** The name reason, saying which other name matched when it was not the object's own name. */
function nameReason(a: ObjectRow, b: ObjectRow, x: string, y: string, reason: string): string {
  if (x === a.name && y === b.name) return reason;
  const via = x !== a.name ? `${a.name} is also known as ${x}` : `${b.name} is also known as ${y}`;
  return reason === "Same name" ? via : `${reason} (${via})`;
}

function sharedReason(phrases: string[]): string {
  const shown = phrases.slice(0, 3);
  const more = phrases.length - shown.length;
  return `Each ${shown.join(", ")}${more > 0 ? ` and ${more} more` : ""}`;
}
