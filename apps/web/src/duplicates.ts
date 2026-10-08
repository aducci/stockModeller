// Possible duplicates in the workbench (design/02-model/duplicates-and-identity.md §6): other names, and the
// "not duplicates" judgement, which is recorded on both objects so either one remembers it.
import { sameName, type ObjectRow } from "@connectome/engine";
import type { Edit, NotDuplicate } from "@connectome/model";

/** Other names typed as a comma-separated list: trimmed, blanks dropped, each name once. */
export function parseNames(text: string): string[] {
  const names: string[] = [];
  for (const raw of text.split(",")) {
    const name = raw.trim();
    if (name && !names.some((n) => sameName(n, name))) names.push(name);
  }
  return names;
}

/** The edits that record "a and b are not duplicates" under their current names, replacing any older judgement. */
export function notDuplicatesEdits(a: ObjectRow, b: ObjectRow): Edit[] {
  const record = (self: ObjectRow, other: ObjectRow): Edit => {
    const kept = (self.notDuplicates ?? []).filter((v) => v.of !== other.id);
    const verdict: NotDuplicate = { of: other.id, name: self.name, otherName: other.name };
    return { edit: "setNotDuplicates", id: self.id, baseVersion: self.version, notDuplicates: [...kept, verdict] };
  };
  return [record(a, b), record(b, a)];
}

export const percent = (score: number) => `${Math.round(score * 100)}%`;
