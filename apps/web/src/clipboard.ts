// Copy, paste and duplicate on a canvas (design/04-ux/diagram-editor.md §2 and §6). Pasting shows the *same* objects
// again: it adds occurrences, never copies of the objects, so the model keeps one fact in one place.
import type { ModelState } from "@connectome/engine";
import type { Edit, Id, ObjectOccurrence, RelationshipOccurrence } from "@connectome/model";
import { layoutBoxes, snap } from "./diagram";

/** One copied symbol. A symbol copied with its parent keeps its place inside it; any other keeps its diagram position. */
interface ClipSymbol {
  key: Id;
  objectId: Id;
  parentKey: Id | null;
  x: number;
  y: number;
  w: number;
  h: number;
  style: ObjectOccurrence["style"];
}

/** A copied line or nesting between two copied symbols. */
interface ClipLine {
  relationshipId: Id;
  sourceKey: Id;
  targetKey: Id;
  shownAs: RelationshipOccurrence["shownAs"];
  labelPosition: number;
  style: RelationshipOccurrence["style"];
}

export interface Clip {
  diagramId: Id;
  symbols: ClipSymbol[];
  lines: ClipLine[];
}

/** What copying these symbols of a diagram holds: the symbols and the lines drawn between them. */
export function copySymbols(state: ModelState, diagramId: Id, occIds: readonly Id[]): Clip {
  const chosen = new Set(occIds);
  const boxes = layoutBoxes(state, diagramId);
  const symbols: ClipSymbol[] = occIds.flatMap((occId) => {
    const occ = state.objectOccurrences.get(occId);
    const box = boxes.get(occId);
    if (!occ || !box) return [];
    const parentKey = occ.parentOccurrenceId && chosen.has(occ.parentOccurrenceId) ? occ.parentOccurrenceId : null;
    const at = parentKey ? occ : box;
    return [{ key: occ.id, objectId: occ.objectId, parentKey, x: at.x, y: at.y, w: occ.w, h: occ.h, style: occ.style }];
  });
  const lines = occIds.flatMap((occId) =>
    state.relationshipOccurrences
      .find("bySource", occId)
      .filter((l) => chosen.has(l.targetOccurrenceId))
      .map((l) => ({
        relationshipId: l.relationshipId,
        sourceKey: l.sourceOccurrenceId,
        targetKey: l.targetOccurrenceId,
        shownAs: l.shownAs,
        labelPosition: l.labelPosition,
        style: l.style,
      })),
  );
  return { diagramId, symbols, lines };
}

/**
 * The edits that paste a clip onto a diagram with the top-left of what was copied at `at`. Symbols whose object, and
 * lines whose relationship, were deleted since copying are left out. Returns the new occurrences, first copied first.
 */
export function pasteEdits(
  state: ModelState,
  clip: Clip,
  diagramId: Id,
  at: { x: number; y: number },
  z: number,
  newId: () => Id,
): { edits: Edit[]; occIds: Id[] } {
  const live = clip.symbols.filter((s) => state.objects.get(s.objectId));
  const kept = new Set(live.map((s) => s.key));
  // A symbol whose copied parent was left out lands on the diagram where it was drawn.
  const symbols = live.map((s) => (s.parentKey && !kept.has(s.parentKey) ? { ...s, parentKey: null } : s));
  const roots = symbols.filter((s) => s.parentKey === null);
  if (roots.length === 0) return { edits: [], occIds: [] };
  const dx = at.x - Math.min(...roots.map((s) => s.x));
  const dy = at.y - Math.min(...roots.map((s) => s.y));

  const ids = new Map(symbols.map((s) => [s.key, newId()]));
  // Parents first, so every nested symbol's parent already exists when it is added.
  const ordered: typeof symbols = [];
  const placed = new Set<Id>();
  while (ordered.length < symbols.length) {
    for (const s of symbols) {
      if (placed.has(s.key) || (s.parentKey && !placed.has(s.parentKey))) continue;
      ordered.push(s);
      placed.add(s.key);
    }
  }
  const edits: Edit[] = ordered.map((s) => ({
    edit: "addObjectOccurrence",
    diagramId,
    occurrence: {
      id: ids.get(s.key)!,
      objectId: s.objectId,
      parentOccurrenceId: s.parentKey ? ids.get(s.parentKey)! : null,
      x: s.parentKey ? s.x : Math.max(0, snap(s.x + dx)),
      y: s.parentKey ? s.y : Math.max(0, snap(s.y + dy)),
      w: s.w,
      h: s.h,
      z,
      style: s.style,
      drillDownDiagramId: null,
      pinned: false,
    },
  }));
  for (const l of clip.lines) {
    if (!kept.has(l.sourceKey) || !kept.has(l.targetKey) || !state.relationships.get(l.relationshipId)) continue;
    edits.push({
      edit: "addRelationshipOccurrence",
      diagramId,
      occurrence: {
        id: newId(),
        relationshipId: l.relationshipId,
        sourceOccurrenceId: ids.get(l.sourceKey)!,
        targetOccurrenceId: ids.get(l.targetKey)!,
        shownAs: l.shownAs,
        route: { mode: "auto" },
        labelPosition: l.labelPosition,
        style: l.style,
      },
    });
  }
  return { edits, occIds: symbols.map((s) => ids.get(s.key)!) };
}

/** Where a clip's top-left was on its own diagram, so a paste there can land just beside it. */
export function clipOrigin(clip: Clip): { x: number; y: number } {
  const roots = clip.symbols.filter((s) => s.parentKey === null);
  return { x: Math.min(...roots.map((s) => s.x)), y: Math.min(...roots.map((s) => s.y)) };
}
