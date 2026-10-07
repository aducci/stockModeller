// Property test: for random valid changes, applying the logged inverses restores the previous state exactly.
import { describe, expect, it } from "vitest";
import type { Edit, Id } from "@connectome/model";
import { COLLECTIONS, invertLog, type ModelState, type TouchedRow } from "../src";
import { apply, applyOk, checkInvariants, exampleState, line, metamodel, occurrence, snapshot } from "./fixtures";

/** Destructive edits are picked less often, so the model keeps growing structure to test against. */
const RARE = new Set([
  "deleteFolder",
  "deleteDiagram",
  "deleteObject",
  "createObject",
  "createFolder",
  "createDiagram",
]);

/** Small deterministic PRNG (mulberry32), so failures can be replayed from the seed. */
function random(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function candidates(state: ModelState, next: () => number, n: number): Edit[] {
  const pick = <T>(items: T[]): T | undefined => items[Math.floor(next() * items.length)];
  const objects = [...state.objects.live()];
  const rels = [...state.relationships.live()];
  const occs = [...state.objectOccurrences.live()];
  const ros = [...state.relationshipOccurrences.live()];
  const anns = [...state.annotations.live()];
  const folders = [...state.folders.live()];
  const diagrams = [...state.diagrams.live()];
  const o = pick(objects);
  const o2 = pick(objects);
  const r = pick(rels);
  const occ = pick(occs);
  const ro = pick(ros);
  const f = pick(folders);
  const d = pick(diagrams);
  const an = pick(anns);
  const id = `G${n}`;
  // A nesting relationship with an occurrence of its parent: lets us place the child inside it.
  const nestable = rels
    .filter((x) => x.type === "contains")
    .flatMap((x) => state.objectOccurrences.find("byObject", x.sourceId).map((p) => ({ rel: x, parent: p })));
  const nest = pick(nestable);
  // Interactions, for messages (semantics.md §6), and relationships that can carry a payload (§5).
  const interaction = pick(rels.filter((x) => metamodel.relationshipType(x.type)!.semantic === "interaction"));
  const carrier = pick(rels.filter((x) => metamodel.relationshipType(x.type)!.payload !== "none"));
  const all: (Edit | null)[] = [
    f
      ? {
          edit: "createObject",
          id,
          type: pick(["server", "application", "capability", "process", "interface", "dataObject"])!,
          name: `Gen ${n}`,
          folderId: f.id,
        }
      : null,
    o ? { edit: "renameObject", id: o.id, baseVersion: o.version, name: `${o.name}'` } : null,
    o ? { edit: "setTags", id: o.id, baseVersion: o.version, tags: [`t${n}`] } : null,
    o ? { edit: "setDescription", id: o.id, baseVersion: o.version, description: n % 3 ? `About ${n}` : "" } : null,
    o ? { edit: "confirmProperties", id: o.id, baseVersion: o.version, keys: ["semantic.level"] } : null,
    o
      ? {
          edit: "setProperties",
          id: o.id,
          baseVersion: o.version,
          set: { "lifecycle.status": pick(["planned", "active", null])! },
        }
      : null,
    interaction
      ? {
          edit: "setRelationshipProperties",
          id: interaction.id,
          baseVersion: interaction.version,
          set: { "interaction.protocol": pick([`HTTP/${n}`, null])! },
        }
      : null,
    o && f ? { edit: "moveToFolder", id: o.id, baseVersion: o.version, folderId: f.id } : null,
    o ? { edit: "deleteObject", id: o.id, baseVersion: o.version } : null,
    o && o2
      ? {
          edit: "createRelationship",
          id,
          type: pick(metamodel.allowedRelationshipTypes(o.type, o2.type))?.key ?? "contains",
          sourceId: o.id,
          targetId: o2.id,
        }
      : null,
    r && o ? { edit: "reconnectRelationship", id: r.id, baseVersion: r.version, targetId: o.id } : null,
    r ? { edit: "deleteRelationship", id: r.id, baseVersion: r.version } : null,
    r && o ? { edit: "reconnectRelationship", id: r.id, baseVersion: r.version, sourceId: o.id } : null,
    r
      ? {
          edit: "changeRelationshipType",
          id: r.id,
          baseVersion: r.version,
          type:
            pick(
              metamodel.allowedRelationshipTypes(
                state.objects.get(r.sourceId)!.type,
                state.objects.get(r.targetId)!.type,
              ),
            )?.key ?? r.type,
        }
      : null,
    o ? { edit: "deleteObject", id: o.id, baseVersion: o.version, contents: "deleteContents" } : null,
    carrier && o
      ? {
          edit: "setPayload",
          id: carrier.id,
          baseVersion: carrier.version,
          payload: next() < 0.2 ? [] : [...new Set([o.id, ...(o2 && next() < 0.5 ? [o2.id] : [])])],
        }
      : null,
    o && o2
      ? {
          edit: "createRelationship",
          id,
          type: "calls",
          sourceId: o.id,
          targetId: o2.id,
        }
      : null,
    interaction && o
      ? {
          edit: "createRelationship",
          id,
          type: "flowsTo",
          ...(next() < 0.6
            ? { sourceId: interaction.sourceId, targetId: interaction.targetId }
            : { sourceId: interaction.targetId, targetId: interaction.sourceId }),
          parentId: interaction.id,
          payload: [o.id],
          ...(next() < 0.3 ? { rank: n } : {}),
        }
      : null,
    { edit: "createFolder", id, parentId: f?.id ?? null, name: `Folder ${n}` },
    f ? { edit: "setRank", item: "folder", id: f.id, rank: pick([`a${n}`, null])! } : null,
    o ? { edit: "setRank", item: "object", id: o.id, rank: pick([`a${n}`, null])! } : null,
    d ? { edit: "setRank", item: "diagram", id: d.id, rank: pick([`a${n}`, null])! } : null,
    f ? { edit: "renameFolder", id: f.id, name: `${f.name}'` } : null,
    f ? { edit: "deleteFolder", id: f.id, contents: "deleteContents" } : null,
    f ? { edit: "createDiagram", id, name: `Diagram ${n}`, diagramType: "applicationLandscape", folderId: f.id } : null,
    d ? { edit: "updateDiagram", id: d.id, baseVersion: d.version, set: { name: `${d.name}'` } } : null,
    d
      ? {
          edit: "setViewDefinition",
          diagramId: d.id,
          baseVersion: d.version,
          set: pick([
            { hideEmpty: n % 2 === 0 },
            { groupRows: null },
            { rows: { from: { type: ["capability"] } }, hideEmpty: null },
            ...(o ? [{ subject: o.id, summary: { paragraphs: [["See ", { mention: o.id }]] } }] : []),
          ])!,
        }
      : null,
    d
      ? {
          edit: "setDiagramProperties",
          id: d.id,
          baseVersion: d.version,
          set: { "documentation.link": pick([`https://docs.example/${n}`, null])! },
        }
      : null,
    d ? { edit: "deleteDiagram", id: d.id } : null,
    d && o
      ? {
          edit: "addObjectOccurrence",
          diagramId: d.id,
          occurrence: occurrence(id, o.id, { x: n, parentOccurrenceId: occ?.diagramId === d.id ? occ.id : null }),
        }
      : null,
    nest
      ? {
          edit: "addObjectOccurrence",
          diagramId: nest.parent.diagramId,
          occurrence: occurrence(id, nest.rel.targetId, { parentOccurrenceId: nest.parent.id }),
        }
      : null,
    nest
      ? { edit: "createRelationship", id, type: "contains", sourceId: nest.rel.sourceId, targetId: pick(objects)!.id }
      : null,
    occ
      ? {
          edit: "moveObjectOccurrence",
          diagramId: occ.diagramId,
          occurrenceId: occ.id,
          x: n,
          y: n,
          parentOccurrenceId: null,
        }
      : null,
    occ
      ? {
          edit: "styleOccurrence",
          diagramId: occ.diagramId,
          occurrenceId: occ.id,
          style: { fill: "#123456", shape: null, rendition: n % 2 ? "card" : null },
          z: n,
        }
      : null,
    occ ? { edit: "removeOccurrence", diagramId: occ.diagramId, occurrenceId: occ.id } : null,
    ro
      ? {
          edit: "routeRelationshipOccurrence",
          diagramId: ro.diagramId,
          occurrenceId: ro.id,
          route: { mode: "manual", points: [[n, n]] },
        }
      : null,
    ro ? { edit: "removeOccurrence", diagramId: ro.diagramId, occurrenceId: ro.id } : null,
    occ && r
      ? {
          edit: "addRelationshipOccurrence",
          diagramId: occ.diagramId,
          occurrence: line(id, r.id, occ.id, pick(occs)!.id),
        }
      : null,
    d
      ? {
          edit: "addAnnotation",
          diagramId: d.id,
          annotation: {
            id,
            parentOccurrenceId: null,
            x: 1,
            y: 1,
            w: 10,
            h: 10,
            z: 0,
            content: { shape: "text", text: "hi" },
            style: {},
          },
        }
      : null,
    an
      ? {
          edit: "updateAnnotation",
          diagramId: an.diagramId,
          annotationId: an.id,
          set: { x: n, content: { shape: "frame", title: "T" } },
        }
      : null,
    an ? { edit: "removeAnnotation", diagramId: an.diagramId, annotationId: an.id } : null,
  ];
  return all.filter((e): e is Edit => e !== null);
}

describe("inverses", () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])("undo restores the previous state for random changes (seed %i)", (seed) => {
    const next = random(seed);
    const state = exampleState();
    let applied = 0;
    for (let n = 0; n < 400; n++) {
      const options = candidates(state, next, n).filter((e) => !RARE.has(e.edit) || next() < 0.15);
      if (options.length === 0) continue;
      const edits = [options[Math.floor(next() * options.length)]!];
      if (next() < 0.3) edits.push(...candidates(state, next, n + 1000).slice(0, 1)); // some two-edit changes
      const before = snapshot(state);
      const result = apply(state, edits);
      if (!result.ok) {
        expect(snapshot(state)).toEqual(before); // a rejected change leaves no trace
        continue;
      }
      applied++;
      checkInvariants(state);
      // Inverses are stored as JSON in change_log, so round-trip them the way the database will.
      const undo = applyOk(state, JSON.parse(JSON.stringify(invertLog(result.log))) as Edit[]);
      expect(snapshot(state), `undo of ${JSON.stringify(edits)}`).toEqual(before);
      // redo (the inverse of the undo) and keep going from there
      applyOk(state, JSON.parse(JSON.stringify(invertLog(undo.log))) as Edit[]);
      checkInvariants(state);
    }
    expect(applied).toBeGreaterThan(50);
  });

  it.each([1, 2, 3])("revert restores rows exactly, versions and tombstones included (seed %i)", (seed) => {
    const next = random(seed);
    const state = exampleState();
    // Every row, deleted ones too, with all bookkeeping: revert must be exact, unlike undo.
    const dump = () =>
      Object.fromEntries(
        COLLECTIONS.map((c) => [
          c,
          [...state.collection(c).all()].sort((a, b) => a.id.localeCompare(b.id)).map((r) => structuredClone(r)),
        ]),
      );
    for (let round = 0; round < 20; round++) {
      const before = dump();
      const touched: TouchedRow[][] = [];
      for (let n = 0; n < 10; n++) {
        const options = candidates(state, next, round * 100 + n).filter((e) => !RARE.has(e.edit) || next() < 0.15);
        const result = apply(state, [options[Math.floor(next() * options.length)]!]);
        if (result.ok) touched.push(result.touched);
      }
      const after = dump();
      for (const t of [...touched].reverse()) state.revert(t);
      expect(dump()).toEqual(before);
      checkInvariants(state);
      // Put them back on (as the browser does after a rebase) and keep going from there.
      for (const t of touched) for (const row of t) state.collection(row.collection).set(row.after as never, row.id);
      expect(dump()).toEqual(after);
    }
  });

  it("keeps ids stable across undo and redo", () => {
    const state = exampleState();
    const result = applyOk(state, [{ edit: "deleteObject", id: "O-APP-1", baseVersion: 1 }]);
    applyOk(state, invertLog(result.log));
    const ids = (rows: Iterable<{ id: Id }>) => [...rows].map((r) => r.id).sort();
    expect(ids(state.objectOccurrences.find("byObject", "O-APP-1"))).toEqual(["OO-4", "OO-6"]);
    expect(state.relationshipOccurrences.get("RO-3")).toBeDefined();
    expect(state.relationshipOccurrences.get("RO-4")).toBeDefined();
  });
});
