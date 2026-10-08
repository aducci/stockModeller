// The diagram editor v0 (design/04-ux/diagram-editor.md): palette, add a new or an existing object, connect with
// the relationship types the rules allow, move, remove from the diagram vs delete the object, rename. Every
// gesture is one change; layout edits are last-writer-wins, so moving never conflicts with someone's rename.
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { RENDITIONS, ulid, type Edit, type Id } from "@connectome/model";
import type { DiagramRow, ObjectOccurrenceRow } from "@connectome/engine";
import { useModel, useWorkbench } from "../state/workbench";
import { ON_LITERAL_FILL, lineFor, notationFor } from "../notation";
import { FindOrCreate } from "./FindOrCreate";
import { Glyph, GlyphUse } from "./Glyph";
import { ContextMenu, type MenuEntry } from "./Menu";
import { OccurrenceShape } from "./OccurrenceShape";
import {
  connectChoices,
  defaultFolderFor,
  edgePoint,
  layoutBoxes,
  paletteTypes,
  renditionFor,
  renditionSize,
  snap,
  stepZoom,
  symbolFor,
  type Box,
  type ConnectChoice,
} from "../diagram";
import { addPayloadPlan, messageType, payloadText } from "../semantics";

/** Drag-and-drop payloads: an object type from the palette, or an existing object from the explorer. */
export const DRAG_TYPE = "application/x-connectome-type";
export const DRAG_OBJECT = "application/x-connectome-object";

/**
 * Arrowheads for the semantic kinds (design/02-model/notation-and-metamodel-admin.md §3). Open heads are filled
 * with the canvas colour so a line never shows through them.
 */
const ARROW_MARKERS = (
  <>
    <marker id="a-arrowOpen" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
      <path d="M1,1 L9,5 L1,9" fill="none" stroke="currentColor" strokeWidth={1.5} />
    </marker>
    <marker id="a-arrowSmall" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="5" markerHeight="5" orient="auto">
      <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
    </marker>
    <marker id="a-triangleOpen" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="10" markerHeight="10" orient="auto">
      <path d="M1,1 L11,6 L1,11 z" fill="var(--canvas)" stroke="currentColor" strokeWidth={1.2} />
    </marker>
    <marker id="a-diamond" viewBox="0 0 14 8" refX="1" refY="4" markerWidth="12" markerHeight="7" orient="auto">
      <path d="M1,4 L7,1 L13,4 L7,7 z" fill="currentColor" />
    </marker>
    <marker id="a-diamondOpen" viewBox="0 0 14 8" refX="1" refY="4" markerWidth="12" markerHeight="7" orient="auto">
      <path d="M1,4 L7,1 L13,4 L7,7 z" fill="var(--canvas)" stroke="currentColor" strokeWidth={1.2} />
    </marker>
    <marker id="a-dot" viewBox="0 0 8 8" refX="4" refY="4" markerWidth="6" markerHeight="6" orient="auto">
      <circle cx={4} cy={4} r={3} fill="currentColor" />
    </marker>
  </>
);

/** `arrow` keeps the existing marker, so a pending connection and a flow look the same. */
function markerUrl(head: string) {
  if (head === "none") return undefined;
  return head === "arrow" ? "url(#arrow)" : `url(#a-${head})`;
}

/** The order R steps through an occurrence's renditions. */
const RENDITION_ORDER = Object.keys(RENDITIONS);
const RENDITION_NAMES: Record<string, string> = {
  box: "Box",
  card: "Card",
  glyph: "Glyph",
  chip: "Chip",
  container: "Container",
};
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2;

/** Room around the drawing, so there is always space to drop something new. */
const MARGIN = 200;
const FLASH_MS = 1500;

type Point = { x: number; y: number };
type Gesture =
  { kind: "move"; occId: Id; start: Point; dx: number; dy: number } | { kind: "connect"; occId: Id; to: Point };

export function DiagramEditor({ id }: { id: Id }) {
  const { state, metamodel } = useModel();
  const edit = useWorkbench((s) => s.edit);
  const select = useWorkbench((s) => s.select);
  const askDeleteObject = useWorkbench((s) => s.askDeleteObject);
  const notify = useWorkbench((s) => s.notify);
  const workbenchSelection = useWorkbench((s) => s.selection);
  const traced = useWorkbench((s) => s.trace?.objectIds);
  const [selected, setSelected] = useState<Id | null>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [naming, setNaming] = useState<{ type: string; at: Point } | null>(null);
  const [renaming, setRenaming] = useState<Id | null>(null);
  const [menu, setMenu] = useState<{ from: Id; to: Id; at: Point; choices: ConnectChoice[] } | null>(null);
  const [flash, setFlash] = useState<ReadonlySet<Id>>(new Set());
  const [occMenu, setOccMenu] = useState<{ x: number; y: number; occId: Id } | null>(null);
  const [zoom, setZoom] = useState(1);
  const canvas = useRef<HTMLDivElement>(null);

  const diagram = state.diagrams.get(id);
  const occurrences = diagram ? state.objectOccurrences.find("byDiagram", id) : [];
  const selectedOcc = selected ? state.objectOccurrences.get(selected) : undefined;
  // The selection goes when its occurrence does (removed here or by someone else).
  useEffect(() => {
    if (selected && !selectedOcc) setSelected(null);
  }, [selected, selectedOcc]);
  // Selecting another item elsewhere (explorer, properties) clears the canvas selection.
  useEffect(() => {
    if (selectedOcc && workbenchSelection?.id !== selectedOcc.objectId) setSelected(null);
  }, [workbenchSelection, selectedOcc]);
  useEffect(() => {
    if (flash.size === 0) return;
    const timer = setTimeout(() => setFlash(new Set()), FLASH_MS);
    return () => clearTimeout(timer);
  }, [flash]);

  // Ctrl/⌘ + wheel zooms the diagram rather than the page; React's wheel listener is passive, so it is added here.
  const hasDiagram = !!diagram;
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom((z) => clampZoom(z * Math.exp(-e.deltaY / 500)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [hasDiagram]);

  if (!diagram) return <p className="muted pad">This diagram was deleted.</p>;

  const offset = gesture?.kind === "move" ? { id: gesture.occId, dx: gesture.dx, dy: gesture.dy } : undefined;
  const boxes = layoutBoxes(state, id, offset);
  const all = [...boxes.values()];
  const width = Math.max(800, ...all.map((b) => b.x + b.w + MARGIN));
  const height = Math.max(600, ...all.map((b) => b.y + b.h + MARGIN));
  const area = (o: ObjectOccurrenceRow) => boxes.get(o.id)!.w * boxes.get(o.id)!.h;
  // Larger symbols behind smaller ones, so nothing placed over a container is hidden by it.
  const ordered = [...occurrences].filter((o) => boxes.has(o.id)).sort((a, b) => area(b) - area(a) || a.z - b.z);
  const lines = state.relationshipOccurrences.find("byDiagram", id).filter((l) => l.shownAs !== "nesting");
  const parallel = new Map<Id, { index: number; count: number }>();
  const pairs = new Map<string, Id[]>();
  for (const l of [...lines].sort((x, y) => x.id.localeCompare(y.id))) {
    const key = [l.sourceOccurrenceId, l.targetOccurrenceId].sort().join("|");
    pairs.set(key, [...(pairs.get(key) ?? []), l.id]);
  }
  for (const ids of pairs.values()) ids.forEach((lineId, index) => parallel.set(lineId, { index, count: ids.length }));
  // Line geometry. Lines between the same two symbols are drawn side by side, never on top of each other (§8).
  const drawn = lines.flatMap((l) => {
    const a = boxes.get(l.sourceOccurrenceId);
    const b = boxes.get(l.targetOccurrenceId);
    if (!a || !b) return [];
    const centre = (x: Box) => ({ x: x.x + x.w / 2, y: x.y + x.h / 2 });
    const p0 = edgePoint(a, centre(b));
    const q0 = edgePoint(b, centre(a));
    const { index, count } = parallel.get(l.id)!;
    const len = Math.hypot(q0.x - p0.x, q0.y - p0.y) || 1;
    const flip = l.sourceOccurrenceId < l.targetOccurrenceId ? 1 : -1;
    const shift = (index - (count - 1) / 2) * 12 * flip;
    const nx = (-(q0.y - p0.y) / len) * shift;
    const ny = ((q0.x - p0.x) / len) * shift;
    const rel = state.relationships.get(l.relationshipId);
    const type = rel ? metamodel.relationshipType(rel.type) : undefined;
    const interaction = type?.semantic === "interaction";
    const operation = rel?.properties["interaction.operation"];
    // An interaction shows its operation; a flow what it carries (design/04-ux/diagram-editor.md §8).
    const label = interaction
      ? `⇄ ${typeof operation === "string" ? operation : (type?.name ?? "")}`
      : rel && rel.payload.length > 0
        ? payloadText(state, rel)
        : "";
    const chosen = rel !== undefined && workbenchSelection?.kind === "relationship" && workbenchSelection.id === rel.id;
    const p = { x: p0.x + nx, y: p0.y + ny };
    const q = { x: q0.x + nx, y: q0.y + ny };
    return [{ l, p, q, rel, type, interaction, label, chosen }];
  });
  const repeats = new Map<Id, number>();
  for (const o of occurrences) repeats.set(o.objectId, (repeats.get(o.objectId) ?? 0) + 1);
  const nextZ = Math.max(0, ...occurrences.map((o) => o.z)) + 1;

  const toCanvas = (clientX: number, clientY: number): Point => {
    const rect = canvas.current!.getBoundingClientRect();
    return { x: (clientX - rect.left) / zoom, y: (clientY - rect.top) / zoom };
  };
  const occAt = (clientX: number, clientY: number): Id | null => {
    const el = document.elementFromPoint(clientX, clientY)?.closest<SVGElement>("[data-occ]");
    return el?.dataset.occ ?? null;
  };
  const choose = (occId: Id | null) => {
    setSelected(occId);
    const occ = occId ? state.objectOccurrences.get(occId) : undefined;
    select(occ ? { kind: "object", id: occ.objectId } : null);
  };
  const nameOf = (objectId: Id) => state.objects.get(objectId)?.name ?? "(deleted)";

  // ---------------------------------------------------------------- adding

  const onDragOver = (e: DragEvent) => {
    if (e.dataTransfer.types.includes(DRAG_TYPE) || e.dataTransfer.types.includes(DRAG_OBJECT)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  };
  const onDrop = (e: DragEvent) => {
    const at = toCanvas(e.clientX, e.clientY);
    const type = e.dataTransfer.getData(DRAG_TYPE);
    const objectId = e.dataTransfer.getData(DRAG_OBJECT);
    if (!type && !objectId) return;
    e.preventDefault();
    if (type) return setNaming({ type, at });
    const object = state.objects.get(objectId);
    if (!object) return;
    // Dropped on a line: the relationship carries it (design/04-ux/diagram-editor.md §8).
    const onLine = document.elementFromPoint(e.clientX, e.clientY)?.closest<SVGElement>("[data-line]");
    if (onLine?.dataset.rel) {
      const plan = addPayloadPlan(state, metamodel, onLine.dataset.rel, objectId);
      if ("error" in plan) return notify(plan.error, "error");
      if (edit(plan.label, plan.edits)) select({ kind: "relationship", id: onLine.dataset.rel });
      return;
    }
    placeExisting(object, at);
  };

  /** Shows an existing object here (dropped from the explorer, or picked in the name box instead of a copy). */
  const placeExisting = (object: { id: Id; name: string; type: string }, at: Point) => {
    const others = occurrences.filter((o) => o.objectId === object.id).map((o) => o.id);
    const occId = ulid();
    const ok = edit(`Add ${object.name} to ${diagram.name}`, [
      { edit: "addObjectOccurrence", diagramId: id, occurrence: newOccurrence(occId, object.id, object.type, at) },
    ]);
    if (ok) {
      // A repeat is allowed, but made visible so it is deliberate.
      if (others.length > 0) setFlash(new Set(others));
      choose(occId);
    }
  };

  const newOccurrence = (occId: Id, objectId: Id, type: string, at: Point) => {
    const symbol = symbolFor(metamodel, diagram, type);
    return {
      id: occId,
      objectId,
      parentOccurrenceId: null,
      x: Math.max(0, snap(at.x - symbol.width / 2)),
      y: Math.max(0, snap(at.y - symbol.height / 2)),
      w: symbol.width,
      h: symbol.height,
      z: nextZ,
      style: {},
      drillDownDiagramId: null,
      pinned: false,
    };
  };

  const createObject = (type: string, at: Point, name: string) => {
    const objectId = ulid();
    const occId = ulid();
    const ok = edit(`Create ${name} on ${diagram.name}`, [
      { edit: "createObject", id: objectId, type, name, folderId: defaultFolderFor(state, metamodel, type, diagram) },
      { edit: "addObjectOccurrence", diagramId: id, occurrence: newOccurrence(occId, objectId, type, at) },
    ]);
    if (ok) choose(occId);
    return ok;
  };

  // ---------------------------------------------------------------- moving and connecting

  const onOccPointerDown = (e: PointerEvent, occId: Id) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    canvas.current?.focus();
    choose(occId);
    setMenu(null);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setGesture({ kind: "move", occId, start: { x: e.clientX, y: e.clientY }, dx: 0, dy: 0 });
  };
  const onHandlePointerDown = (e: PointerEvent, occId: Id) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setGesture({ kind: "connect", occId, to: toCanvas(e.clientX, e.clientY) });
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!gesture) return;
    if (gesture.kind === "move") {
      setGesture({ ...gesture, dx: (e.clientX - gesture.start.x) / zoom, dy: (e.clientY - gesture.start.y) / zoom });
    } else {
      setGesture({ ...gesture, to: toCanvas(e.clientX, e.clientY) });
    }
  };
  const onPointerUp = (e: PointerEvent) => {
    if (!gesture) return;
    setGesture(null);
    if (gesture.kind === "move") return finishMove(gesture);
    const target = occAt(e.clientX, e.clientY);
    if (target && target !== gesture.occId) openConnectMenu(gesture.occId, target, toCanvas(e.clientX, e.clientY));
  };

  const finishMove = (g: Extract<Gesture, { kind: "move" }>) => {
    const occ = state.objectOccurrences.get(g.occId);
    if (!occ || Math.hypot(g.dx, g.dy) < 3) return;
    const x = snap(occ.x + g.dx);
    const y = snap(occ.y + g.dy);
    // Top-level symbols stay on the canvas; nested ones may sit anywhere relative to their parent.
    const clamp = (n: number) => (occ.parentOccurrenceId ? n : Math.max(0, n));
    if (clamp(x) === occ.x && clamp(y) === occ.y) return;
    edit(`Move ${nameOf(occ.objectId)}`, [
      { edit: "moveObjectOccurrence", diagramId: id, occurrenceId: occ.id, x: clamp(x), y: clamp(y) },
    ]);
  };

  const openConnectMenu = (from: Id, to: Id, at: Point) => {
    const a = state.objectOccurrences.get(from);
    const b = state.objectOccurrences.get(to);
    if (!a || !b) return;
    // An existing relationship already drawn between exactly these two symbols would only get a second line.
    const drawn = new Set(
      state.relationshipOccurrences
        .find("bySource", a.id)
        .filter((l) => l.targetOccurrenceId === b.id)
        .map((l) => l.relationshipId),
    );
    const choices = connectChoices(state, metamodel, diagram, a.objectId, b.objectId).filter(
      (c) => !c.existingId || !drawn.has(c.existingId),
    );
    if (choices.length === 0) {
      return notify(`No relationship type connects ${nameOf(a.objectId)} to ${nameOf(b.objectId)}`, "error");
    }
    setMenu({ from, to, at, choices });
  };

  const connect = (choice: ConnectChoice) => {
    if (!menu) return;
    setMenu(null);
    const a = state.objectOccurrences.get(menu.from);
    const b = state.objectOccurrences.get(menu.to);
    if (!a || !b) return;
    const relationshipId = choice.existingId ?? ulid();
    const label = `${nameOf(a.objectId)} ${choice.type.verb} ${nameOf(b.objectId)}`;
    // A containment nests the content inside its container (design/04-ux/diagram-editor.md §8).
    const nest =
      choice.type.semantic === "containment" &&
      metamodel.diagramType(diagram.diagramType)?.nesting === "nested" &&
      b.parentOccurrenceId === null &&
      !isAncestor(b.id, a.id);
    // A new interaction starts with an empty request; the properties panel then asks for payloads (§8).
    const request =
      choice.type.semantic === "interaction" && !choice.existingId
        ? messageType(metamodel, state.objects.get(a.objectId)!.type, state.objects.get(b.objectId)!.type)
        : undefined;
    const ok = edit(choice.existingId ? `Show ${label}` : label, [
      ...(choice.existingId
        ? []
        : [
            {
              edit: "createRelationship" as const,
              id: relationshipId,
              type: choice.type.key,
              sourceId: a.objectId,
              targetId: b.objectId,
            },
          ]),
      ...(request
        ? [
            {
              edit: "createRelationship" as const,
              id: ulid(),
              type: request.key,
              sourceId: a.objectId,
              targetId: b.objectId,
              parentId: relationshipId,
            },
          ]
        : []),
      ...(nest ? nestEdits(a, b) : []),
      {
        edit: "addRelationshipOccurrence",
        diagramId: id,
        occurrence: {
          id: ulid(),
          relationshipId,
          sourceOccurrenceId: a.id,
          targetOccurrenceId: b.id,
          shownAs: nest ? "nesting" : "line",
          route: { mode: "auto" },
          labelPosition: 0.5,
          style: {},
        },
      },
    ]);
    if (ok && choice.type.semantic === "interaction") {
      setSelected(null);
      select({ kind: "relationship", id: relationshipId });
    }
  };

  /** Whether occurrence `ancestor` is `occ` or contains it on this diagram. */
  const isAncestor = (ancestor: Id, occ: Id): boolean => {
    for (
      let o = state.objectOccurrences.get(occ);
      o;
      o = o.parentOccurrenceId ? state.objectOccurrences.get(o.parentOccurrenceId) : undefined
    ) {
      if (o.id === ancestor) return true;
    }
    return false;
  };

  /** Moves `child` inside `parent`, below its other nested symbols, and grows `parent` to fit. */
  const nestEdits = (parent: ObjectOccurrenceRow, child: ObjectOccurrenceRow): Edit[] => {
    const pad = 16;
    const siblings = state.objectOccurrences.find("byDiagram", id).filter((o) => o.parentOccurrenceId === parent.id);
    const y = Math.max(36, ...siblings.map((o) => o.y + o.h + 12));
    return [
      {
        edit: "moveObjectOccurrence",
        diagramId: id,
        occurrenceId: parent.id,
        x: parent.x,
        y: parent.y,
        w: Math.max(parent.w, pad + child.w + pad),
        h: Math.max(parent.h, y + child.h + pad),
      },
      { edit: "moveObjectOccurrence", diagramId: id, occurrenceId: child.id, x: pad, y, parentOccurrenceId: parent.id },
    ];
  };

  // ---------------------------------------------------------------- renditions

  /** Switches an occurrence to a rendition and to that rendition's size, in one change (so one undo). */
  const showAs = (occId: Id, key: string) => {
    const occ = state.objectOccurrences.get(occId);
    const rendition = RENDITIONS[key];
    if (!occ || !rendition) return;
    const object = state.objects.get(occ.objectId);
    const size = renditionSize(rendition, symbolFor(metamodel, diagram, object?.type ?? ""));
    // A container keeps room for what is nested inside it.
    const nested = state.objectOccurrences.count("byParent", occ.id) > 0;
    const w = nested ? Math.max(size.w, occ.w) : size.w;
    const h = nested ? Math.max(size.h, occ.h) : size.h;
    const current = occ.style.rendition ?? "box";
    if (current === key && w === occ.w && h === occ.h) return;
    edit(`Show ${nameOf(occ.objectId)} as ${RENDITION_NAMES[key]?.toLowerCase() ?? key}`, [
      {
        edit: "styleOccurrence",
        diagramId: id,
        occurrenceId: occ.id,
        style: { rendition: key === "box" ? null : key },
      },
      { edit: "moveObjectOccurrence", diagramId: id, occurrenceId: occ.id, x: occ.x, y: occ.y, w, h },
    ]);
  };

  const occMenuEntries = (occId: Id): MenuEntry[] => {
    const occ = state.objectOccurrences.get(occId);
    if (!occ) return [];
    const current = occ.style.rendition ?? "box";
    const objectId = occ.objectId;
    return [
      {
        label: "Show as",
        submenu: RENDITION_ORDER.map((key) => ({
          label: `${key === current ? "✓ " : ""}${RENDITION_NAMES[key] ?? key}`,
          run: () => showAs(occId, key),
        })),
      },
      { label: "Rename", shortcut: "F2", run: () => setRenaming(occId) },
      "separator",
      {
        label: "Remove from diagram",
        shortcut: "Del",
        run: () => {
          if (
            edit(`Remove ${nameOf(objectId)} from ${diagram.name}`, [
              { edit: "removeOccurrence", diagramId: id, occurrenceId: occId },
            ])
          )
            choose(null);
        },
      },
      { label: "Delete object…", shortcut: "⇧Del", danger: true, run: () => askDeleteObject(objectId) },
    ];
  };

  // ---------------------------------------------------------------- keyboard

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.target !== canvas.current) return;
    if (e.key === "Escape") {
      setMenu(null);
      return choose(null);
    }
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === "=" || e.key === "+") {
      e.preventDefault();
      return setZoom((z) => stepZoom(z, 1));
    }
    if (e.key === "-") {
      e.preventDefault();
      return setZoom((z) => stepZoom(z, -1));
    }
    if (e.key === "0" && (mod || !selectedOcc)) {
      e.preventDefault();
      return setZoom(1);
    }
    if (!selectedOcc) return;
    if ((e.key === "r" || e.key === "R") && !mod) {
      e.preventDefault();
      const current = RENDITION_ORDER.indexOf(selectedOcc.style.rendition ?? "box");
      const step = e.shiftKey ? -1 : 1;
      const next = RENDITION_ORDER[(current + step + RENDITION_ORDER.length) % RENDITION_ORDER.length]!;
      return showAs(selectedOcc.id, next);
    }
    if (e.key === "F2") {
      e.preventDefault();
      setRenaming(selectedOcc.id);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      const objectId = selectedOcc.objectId;
      if (e.shiftKey) return askDeleteObject(objectId);
      const ok = edit(
        `Remove ${nameOf(objectId)} from ${diagram.name}`,
        [{ edit: "removeOccurrence", diagramId: id, occurrenceId: selectedOcc.id }],
        { label: "Delete object", run: () => askDeleteObject(objectId) },
      );
      if (ok) choose(null);
    }
  };

  // ---------------------------------------------------------------- rendering

  const siblings = new Set(
    selectedOcc
      ? occurrences.filter((o) => o.objectId === selectedOcc.objectId && o.id !== selected).map((o) => o.id)
      : [],
  );
  const handleBox = selectedOcc && gesture?.kind !== "move" ? boxes.get(selectedOcc.id) : undefined;
  const connecting = gesture?.kind === "connect" ? gesture : null;
  const connectFrom = connecting ? boxes.get(connecting.occId) : undefined;

  return (
    <div className="diagram-editor">
      <Palette diagram={diagram} zoom={zoom} onZoom={(z) => setZoom(clampZoom(z))} />
      <div
        ref={canvas}
        className="canvas"
        tabIndex={0}
        role="application"
        aria-label={`Diagram ${diagram.name}`}
        style={{ width: width * zoom, height: height * zoom }}
        data-zoom={zoom}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setGesture(null)}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget || (e.target as Element).tagName === "svg") {
            choose(null);
            setMenu(null);
          }
        }}
        onKeyDown={onKeyDown}
      >
        <svg width={width * zoom} height={height * zoom} viewBox={`0 0 ${width} ${height}`}>
          <defs>
            <pattern id="grid" width={16} height={16} patternUnits="userSpaceOnUse">
              <path d="M16 0H0V16" fill="none" className="grid-line" />
            </pattern>
            <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
            </marker>
            {ARROW_MARKERS}
          </defs>
          <rect width={width} height={height} fill="url(#grid)" pointerEvents="none" />
          {/* Lines are picked (and dropped on) beneath the symbols, so they never take a symbol's clicks. */}
          {drawn.map(({ l, p, q, rel, type }) => (
            <line
              key={l.id}
              className="line-hit"
              data-line={l.id}
              data-rel={rel?.id}
              x1={p.x}
              y1={p.y}
              x2={q.x}
              y2={q.y}
              aria-label={rel ? `${nameOf(rel.sourceId)} ${type?.verb ?? rel.type} ${nameOf(rel.targetId)}` : undefined}
              onPointerDown={(e) => {
                if (!rel) return;
                e.stopPropagation();
                setSelected(null);
                setMenu(null);
                select({ kind: "relationship", id: rel.id });
              }}
            />
          ))}
          {ordered.map((o) => {
            const b = boxes.get(o.id)!;
            const object = state.objects.get(o.objectId);
            const symbol = symbolFor(metamodel, diagram, object?.type ?? "", o.style);
            const typeNotation = notationFor(object ? metamodel.objectType(object.type) : undefined);
            // A literal fill (set by a diagram type or on the occurrence) is light in either theme, so it takes dark ink.
            const notation = symbol.fill ? { ...typeNotation, ink: ON_LITERAL_FILL } : typeNotation;
            const ink = symbol.fill ? ON_LITERAL_FILL : "var(--fg)";
            const container = state.objectOccurrences.count("byParent", o.id) > 0;
            // Semantic zoom never collapses a container: what is nested inside it stays visible.
            const rendition = renditionFor(metamodel, diagram, symbol, container ? 1 : zoom);
            const count = repeats.get(o.objectId) ?? 1;
            const classes = [
              "occ",
              o.id === selected && "selected",
              siblings.has(o.id) && "sibling",
              flash.has(o.id) && "flash",
              traced?.has(o.objectId) && "traced",
            ].filter(Boolean);
            return (
              <g
                key={o.id}
                data-occ={o.id}
                data-name={object?.name}
                data-rendition={rendition.key}
                style={{ "--occ-ink": ink } as CSSProperties}
                className={classes.join(" ")}
                onPointerDown={(e) => onOccPointerDown(e, o.id)}
                onDoubleClick={() => setRenaming(o.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  choose(o.id);
                  setMenu(null);
                  setOccMenu({ x: e.clientX, y: e.clientY, occId: o.id });
                }}
              >
                <OccurrenceShape
                  box={b}
                  form={rendition.form}
                  rows={rendition.rows ?? 3}
                  object={object}
                  notation={notation}
                  fill={symbol.fill ?? notation.fill}
                  stroke={symbol.stroke ?? notation.stroke}
                  shape={symbol.shape}
                  container={container}
                  zoom={zoom}
                />
                {count > 1 && (
                  <text
                    x={b.x + b.w - 4}
                    y={b.y + 12}
                    textAnchor="end"
                    className="repeat"
                    aria-label={`Occurs ${count} times`}
                  >
                    ×{count}
                  </text>
                )}
              </g>
            );
          })}
          {drawn.map(({ l, p, q, rel, type, interaction, label, chosen }) => {
            const line = lineFor(metamodel, rel?.type);
            return (
              <g key={l.id}>
                <line
                  className={["line", interaction && "interaction", chosen && "selected"].filter(Boolean).join(" ")}
                  data-relationship={type?.verb}
                  x1={p.x}
                  y1={p.y}
                  x2={q.x}
                  y2={q.y}
                  strokeDasharray={line.dash}
                  markerStart={markerUrl(line.start)}
                  markerEnd={markerUrl(line.end)}
                />
                {line.mid && !label && (
                  <GlyphUse
                    glyph={line.mid}
                    x={(p.x + q.x) / 2 - 8}
                    y={(p.y + q.y) / 2 - 8}
                    size={16}
                    colour="var(--fg-2)"
                  />
                )}
                {label && rel && (
                  <text className="line-label" x={(p.x + q.x) / 2} y={(p.y + q.y) / 2 - 4}>
                    {label}
                  </text>
                )}
              </g>
            );
          })}
          {handleBox && (
            <circle
              className="handle"
              aria-label="Connect"
              cx={handleBox.x + handleBox.w}
              cy={handleBox.y + handleBox.h / 2}
              r={6 / Math.max(zoom, 0.5)}
              onPointerDown={(e) => onHandlePointerDown(e, selectedOcc!.id)}
            />
          )}
          {connecting && connectFrom && (
            <line
              className="line pending"
              x1={connectFrom.x + connectFrom.w}
              y1={connectFrom.y + connectFrom.h / 2}
              x2={connecting.to.x}
              y2={connecting.to.y}
              markerEnd="url(#arrow)"
            />
          )}
        </svg>

        {naming && (
          <FindOrCreate
            className="name-box"
            style={{ left: naming.at.x * zoom, top: naming.at.y * zoom }}
            type={naming.type}
            folderId={defaultFolderFor(state, metamodel, naming.type, diagram)}
            label={`Name of the new ${metamodel.objectType(naming.type)?.definition.name ?? naming.type}`}
            commitOnBlur
            onPick={(object) => placeExisting(object, naming.at)}
            onCreate={(name) => createObject(naming.type, naming.at, name)}
            onDone={() => {
              setNaming(null);
              canvas.current?.focus();
            }}
          />
        )}
        {renaming && boxes.get(renaming) && (
          <RenameBox
            occurrence={state.objectOccurrences.get(renaming)!}
            box={scaleBox(boxes.get(renaming)!, zoom)}
            onDone={() => {
              setRenaming(null);
              canvas.current?.focus();
            }}
          />
        )}
        {menu && (
          <ul
            className="menu"
            role="menu"
            aria-label="Relationship type"
            style={{ left: menu.at.x * zoom, top: menu.at.y * zoom }}
          >
            {menu.choices.map((c) => (
              <li key={c.existingId ?? c.type.key}>
                <button role="menuitem" onClick={() => connect(c)}>
                  {c.type.verb}
                  {c.existingId && <span className="muted"> (existing)</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {occMenu && (
        <ContextMenu
          x={occMenu.x}
          y={occMenu.y}
          label="Occurrence"
          entries={occMenuEntries(occMenu.occId)}
          onClose={() => setOccMenu(null)}
        />
      )}
    </div>
  );
}

const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 100) / 100));
const scaleBox = (b: Box, zoom: number): Box => ({ x: b.x * zoom, y: b.y * zoom, w: b.w * zoom, h: b.h * zoom });

function Palette({ diagram, zoom, onZoom }: { diagram: DiagramRow; zoom: number; onZoom(zoom: number): void }) {
  const { metamodel } = useModel();
  const types = paletteTypes(metamodel, diagram);
  return (
    <div className="palette" aria-label="Palette" role="toolbar">
      {types.map((t) => {
        const symbol = symbolFor(metamodel, diagram, t.definition.key);
        const notation = notationFor(t);
        return (
          <div
            key={t.definition.key}
            className="palette-item"
            draggable
            title={`Drag onto the diagram to add a new ${t.definition.name}`}
            onDragStart={(e) => {
              e.dataTransfer.setData(DRAG_TYPE, t.definition.key);
              e.dataTransfer.effectAllowed = "copy";
            }}
          >
            <span className="swatch" style={{ background: symbol.fill ?? notation.fill, color: notation.ink }}>
              <Glyph glyph={notation.glyph} size={12} />
            </span>
            {t.definition.name}
          </div>
        );
      })}
      <div className="zoom" role="group" aria-label="Zoom">
        <button type="button" aria-label="Zoom out" title="Zoom out (−)" onClick={() => onZoom(stepZoom(zoom, -1))}>
          −
        </button>
        <button type="button" aria-label="Reset zoom" title="Actual size (0)" onClick={() => onZoom(1)}>
          {Math.round(zoom * 100)}%
        </button>
        <button type="button" aria-label="Zoom in" title="Zoom in (+)" onClick={() => onZoom(stepZoom(zoom, 1))}>
          +
        </button>
      </div>
    </div>
  );
}

/** A name box: Enter commits, Escape (or no name) cancels. */
function NameBox(props: {
  at: Point;
  label: string;
  initial: string;
  onCommit(name: string): boolean;
  onDone(): void;
}) {
  const { at, label, initial, onCommit, onDone } = props;
  const [name, setName] = useState(initial);
  const done = useRef(false);
  /** A refused name keeps the box open after Enter (to correct it), but not after leaving it. */
  const finish = (commit: boolean, keepIfRefused = false) => {
    if (done.current) return;
    if (commit && !onCommit(name.trim()) && keepIfRefused) return;
    done.current = true;
    onDone();
  };
  return (
    <input
      className="name-box"
      autoFocus
      aria-label={label}
      placeholder="Name"
      style={{ left: at.x, top: at.y }}
      value={name}
      onChange={(e) => setName(e.target.value)}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") finish(true, true);
        else if (e.key === "Escape") finish(false);
      }}
      onBlur={() => finish(true)}
    />
  );
}

function RenameBox({ occurrence, box, onDone }: { occurrence: ObjectOccurrenceRow; box: Box; onDone(): void }) {
  const { state } = useModel();
  const edit = useWorkbench((s) => s.edit);
  const object = state.objects.get(occurrence.objectId);
  // The version the rename is based on is the one shown when the box opened, so a rename someone made
  // meanwhile is reported as a conflict instead of being overwritten.
  const [baseVersion] = useState(object?.version ?? 0);
  if (!object) return null;
  return (
    <NameBox
      at={{ x: box.x, y: box.y + box.h / 2 - 12 }}
      label={`Rename ${object.name}`}
      initial={object.name}
      onCommit={(name) => {
        if (!name || name === object.name) return true;
        edit(`Rename ${object.name} to ${name}`, [{ edit: "renameObject", id: object.id, baseVersion, name }]);
        return true;
      }}
      onDone={onDone}
    />
  );
}
