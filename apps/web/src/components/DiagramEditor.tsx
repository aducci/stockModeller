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
import { ABSTRACTION_PROPERTY, RENDITIONS, ulid, type Edit, type Id } from "@connectome/model";
import type { DiagramRow, ObjectOccurrenceRow } from "@connectome/engine";
import { useModel, useWorkbench } from "../state/workbench";
import { notationFor } from "../notation";
import { FindOrCreate } from "./FindOrCreate";
import { Glyph, GlyphUse } from "./Glyph";
import { ContextMenu, type MenuEntry } from "./Menu";
import { ArrowMarkers, LineShape, SymbolShape, drawnLines, paintOrder, symbolLook } from "./DiagramDrawing";
import {
  connectChoices,
  defaultFolderFor,
  freeSpot,
  layoutBoxes,
  nestingChoice,
  paletteTypes,
  renditionSize,
  snap,
  stepZoom,
  symbolFor,
  type Box,
  type ConnectChoice,
} from "../diagram";
import { addPayloadPlan, messageType } from "../semantics";
import { canvasTypesFor, diagramAroundPlan } from "../views";
import { subjectDiagramFor } from "../subjects";
import { IGNORED_PARTS, breadcrumb, decompositionOf, missingParts, partEdits, placePartsEdits } from "../decompose";
import { byName } from "../text";

/** Drag-and-drop payloads: an object type from the palette, or an existing object from the explorer. */
export const DRAG_TYPE = "application/x-connectome-type";
export const DRAG_OBJECT = "application/x-connectome-object";

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
  const openTab = useWorkbench((s) => s.openTab);
  const notify = useWorkbench((s) => s.notify);
  const workbenchSelection = useWorkbench((s) => s.selection);
  const traced = useWorkbench((s) => s.trace?.objectIds);
  const [selected, setSelected] = useState<Id | null>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  /** A new symbol being named: where it will go, and the symbol it goes inside, if any. */
  const [naming, setNaming] = useState<{ key: number; type: string; box: Box; parent: Id | null } | null>(null);
  const [dropTarget, setDropTarget] = useState<Id | null>(null);
  const [renaming, setRenaming] = useState<Id | null>(null);
  const [menu, setMenu] = useState<{ from: Id; to: Id; at: Point; choices: ConnectChoice[] } | null>(null);
  const [flash, setFlash] = useState<ReadonlySet<Id>>(new Set());
  const [occMenu, setOccMenu] = useState<{ x: number; y: number; occId: Id } | null>(null);
  /** Double-click on a symbol with nowhere to drill: what it could have (a decomposition), or Rename. */
  const [drillOffer, setDrillOffer] = useState<{ x: number; y: number; occId: Id } | null>(null);
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
  const ordered = paintOrder([...occurrences], boxes);
  const isChosen = (rel: { id: Id } | undefined) =>
    rel !== undefined && workbenchSelection?.kind === "relationship" && workbenchSelection.id === rel.id;
  const drawn = drawnLines(state, metamodel, id, boxes);
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

  /** The box a new symbol of `type` gets, centred on `at`. */
  const boxAt = (type: string, at: Point): Box => {
    const symbol = symbolFor(metamodel, diagram, type);
    return {
      x: Math.max(0, snap(at.x - symbol.width / 2)),
      y: Math.max(0, snap(at.y - symbol.height / 2)),
      w: symbol.width,
      h: symbol.height,
    };
  };
  const startNaming = (type: string, box: Box, parent: Id | null) =>
    setNaming((n) => ({ key: (n?.key ?? 0) + 1, type, box, parent }));

  /** Adds a new symbol of a type where there is room in view: clicking a palette item. */
  const addInView = (type: string) => {
    const el = canvas.current;
    if (!el) return;
    const view = (el.closest(".tab-body") ?? el).getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    const top = Math.max(rect.top, view.top + 48); // below the sticky palette
    const area = {
      x: (Math.max(rect.left, view.left) - rect.left) / zoom,
      y: (top - rect.top) / zoom,
      w: (Math.min(rect.right, view.right) - Math.max(rect.left, view.left)) / zoom,
      h: (Math.min(rect.bottom, view.bottom) - top) / zoom,
    };
    const symbol = symbolFor(metamodel, diagram, type);
    const spot = freeSpot(boxes.values(), { w: symbol.width, h: symbol.height }, area);
    startNaming(type, { ...spot, w: symbol.width, h: symbol.height }, null);
  };

  const onDragOver = (e: DragEvent) => {
    if (e.dataTransfer.types.includes(DRAG_TYPE) || e.dataTransfer.types.includes(DRAG_OBJECT)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      const under = occAt(e.clientX, e.clientY);
      if (under !== dropTarget) setDropTarget(under);
    }
  };
  const onDrop = (e: DragEvent) => {
    setDropTarget(null);
    const at = toCanvas(e.clientX, e.clientY);
    const type = e.dataTransfer.getData(DRAG_TYPE);
    const objectId = e.dataTransfer.getData(DRAG_OBJECT);
    if (!type && !objectId) return;
    e.preventDefault();
    // Dropped on a symbol: the new one goes inside it, when a rule allows (design/04-ux/diagram-editor.md §8).
    const parent = occAt(e.clientX, e.clientY);
    if (type) return startNaming(type, boxAt(type, at), parent);
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
    placeExisting(object, boxAt(object.type, at), parent);
  };

  /**
   * The edits that show an object in `box`: inside `parentOcc` through a nesting relationship (an existing one, or a
   * new one the rules allow), else on the diagram itself, with the reason it could not go inside.
   */
  const placement = (objectId: Id, isNew: boolean, type: string, box: Box, parentOcc: Id | null) => {
    const occId = ulid();
    const parent = parentOcc ? state.objectOccurrences.get(parentOcc) : undefined;
    const choice = parent
      ? nestingChoice(state, metamodel, diagram, parent.objectId, type, isNew ? null : objectId)
      : null;
    if (!parent || !choice || "refused" in choice) {
      return {
        occId,
        inside: null,
        note: choice && "refused" in choice ? `${choice.refused}, so it was placed on the diagram` : null,
        edits: [
          { edit: "addObjectOccurrence", diagramId: id, occurrence: newOccurrence(occId, objectId, box) },
        ] as Edit[],
      };
    }
    const outer = boxes.get(parent.id)!;
    const pad = 16;
    const x = Math.max(pad, snap(box.x - outer.x));
    const y = Math.max(36, snap(box.y - outer.y)); // below the container's own label
    const w = Math.max(parent.w, x + box.w + pad);
    const h = Math.max(parent.h, y + box.h + pad);
    const relationshipId = choice.existingId ?? ulid();
    const edits: Edit[] = [
      ...(choice.existingId
        ? []
        : [
            {
              edit: "createRelationship" as const,
              id: relationshipId,
              type: choice.type.key,
              sourceId: parent.objectId,
              targetId: objectId,
            },
          ]),
      ...(w !== parent.w || h !== parent.h
        ? [
            {
              edit: "moveObjectOccurrence" as const,
              diagramId: id,
              occurrenceId: parent.id,
              x: parent.x,
              y: parent.y,
              w,
              h,
            },
          ]
        : []),
      {
        edit: "addObjectOccurrence",
        diagramId: id,
        occurrence: { ...newOccurrence(occId, objectId, { ...box, x, y }), parentOccurrenceId: parent.id },
      },
      {
        edit: "addRelationshipOccurrence",
        diagramId: id,
        occurrence: {
          id: ulid(),
          relationshipId,
          sourceOccurrenceId: parent.id,
          targetOccurrenceId: occId,
          shownAs: "nesting",
          route: { mode: "auto" },
          labelPosition: 0.5,
          style: {},
        },
      },
    ];
    return { occId, inside: nameOf(parent.objectId), note: null, edits };
  };

  /** Shows an existing object (dropped from the explorer, or picked in the name box instead of a copy). */
  const placeExisting = (object: { id: Id; name: string; type: string }, box: Box, parent: Id | null) => {
    const others = occurrences.filter((o) => o.objectId === object.id).map((o) => o.id);
    const place = placement(object.id, false, object.type, box, parent);
    const part = place.inside ? { edits: [] } : partEdits(state, metamodel, diagram, object);
    const label = part.edits.length
      ? `Add ${object.name} to ${decompositionOf(state, metamodel, diagram)!.subject.name}`
      : `Add ${object.name} to ${place.inside ?? diagram.name}`;
    const ok = edit(label, [...place.edits, ...part.edits]);
    if (ok) {
      // A repeat is allowed, but made visible so it is deliberate.
      if (others.length > 0) setFlash(new Set(others));
      if (place.note ?? part.note) notify((place.note ?? part.note)!);
      choose(place.occId);
    }
    return ok;
  };

  const newOccurrence = (occId: Id, objectId: Id, box: Box) => ({
    id: occId,
    objectId,
    parentOccurrenceId: null,
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    z: nextZ,
    style: {},
    drillDownDiagramId: null,
    pinned: false,
  });

  const createObject = (type: string, box: Box, parent: Id | null, name: string) => {
    const objectId = ulid();
    const place = placement(objectId, true, type, box, parent);
    // On a decomposition (DOC-1b), what is drawn becomes a part of what the diagram is about.
    const part = place.inside ? { edits: [] } : partEdits(state, metamodel, diagram, { id: objectId, type });
    const where = place.inside
      ? `in ${place.inside}`
      : part.edits.length
        ? `in ${decompositionOf(state, metamodel, diagram)!.subject.name}`
        : `on ${diagram.name}`;
    const ok = edit(`Create ${name} ${where}`, [
      { edit: "createObject", id: objectId, type, name, folderId: defaultFolderFor(state, metamodel, type, diagram) },
      ...place.edits,
      ...part.edits,
    ]);
    if (ok) {
      if (place.note) notify(place.note);
      choose(place.occId);
    }
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

  /** A line drawn on a type that sets `lineAbstraction` (e.g. a conceptual context) gets it, unless that is the default. */
  const lineAbstraction = (type: string) => {
    const wanted = metamodel.diagramType(diagram.diagramType)?.definition.lineAbstraction;
    return wanted && wanted !== metamodel.relationshipType(type)?.abstraction
      ? { properties: { [ABSTRACTION_PROPERTY]: wanted } }
      : {};
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
              ...lineAbstraction(choice.type.key),
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

  // ---------------------------------------------------------------- drill-down

  /**
   * The live diagram a symbol drills down to: its own child diagram, else one about its element (DOC-1), so every
   * symbol of an element opens the element's diagram without being linked one by one.
   */
  const drillTarget = (occ: ObjectOccurrenceRow): Id | null =>
    occ.drillDownDiagramId && state.diagrams.get(occ.drillDownDiagramId)
      ? occ.drillDownDiagramId
      : (subjectDiagramFor(state, metamodel, occ.objectId, id)?.id ?? null);
  const openDiagram = (diagramId: Id) => {
    select({ kind: "diagram", id: diagramId });
    openTab({ kind: "diagram", id: diagramId });
  };
  const linkEdit = (occ: ObjectOccurrenceRow, to: Id | null): Edit => ({
    edit: "setDrillDown",
    diagramId: id,
    occurrenceId: occ.id,
    drillDownDiagramId: to,
  });
  /** "Child diagram ▸": open or unlink the linked one; else a new canvas around the object, or link an existing view. */
  const childDiagramMenu = (occ: ObjectOccurrenceRow): MenuEntry => {
    const object = state.objects.get(occ.objectId);
    const name = object?.name ?? "it";
    const own = occ.drillDownDiagramId && state.diagrams.get(occ.drillDownDiagramId) ? occ.drillDownDiagramId : null;
    const about = own ? null : drillTarget(occ);
    if (own) {
      const target = own;
      const child = state.diagrams.get(target)!;
      return {
        label: "Child diagram",
        submenu: [
          { label: `Open ${child.name}`, run: () => openDiagram(target) },
          {
            label: "Unlink child diagram",
            run: () => edit(`Unlink ${child.name} from ${name}`, [linkEdit(occ, null)]),
          },
        ],
      };
    }
    const create: MenuEntry[] = object
      ? canvasTypesFor(metamodel, object).map((t) => ({
          label: `New ${t.definition.name.toLowerCase()}`,
          run: () => {
            const plan = diagramAroundPlan(state, metamodel, t, object);
            const childId = (plan.edits[0] as { id: Id }).id;
            // A decomposition opens from every symbol of the element through its subject, so it needs no link.
            const own = t.definition.decomposes ? [] : [linkEdit(occ, childId)];
            if (edit(`${plan.label} as a child of ${name}`, [...plan.edits, ...own])) openDiagram(childId);
          },
        }))
      : [];
    // Views named after the object, or stored beside it, come first.
    const near = (d: DiagramRow) =>
      (object && d.name.toLocaleLowerCase().includes(object.name.toLocaleLowerCase())) ||
      d.folderId === object?.folderId
        ? 0
        : 1;
    const existing = [...state.diagrams.live()]
      .filter((d) => d.id !== id)
      .sort((a, b) => near(a) - near(b) || byName(a, b))
      .slice(0, 25);
    // A diagram about the element opens from every symbol of it; a child diagram of this symbol would override it.
    const aboutDiagram = about ? state.diagrams.get(about) : undefined;
    const opens: MenuEntry[] = aboutDiagram
      ? [{ label: `Open ${aboutDiagram.name}`, run: () => openDiagram(aboutDiagram.id) }, "separator"]
      : [];
    return {
      label: "Child diagram",
      submenu: [
        ...opens,
        ...create,
        ...(create.length ? (["separator"] as MenuEntry[]) : []),
        {
          label: "Link to existing",
          disabled: existing.length ? null : "There is no other diagram yet",
          submenu: existing.map((d) => ({
            label: d.name,
            run: () => edit(`Link ${d.name} as the child of ${name}`, [linkEdit(occ, d.id)]),
          })),
        },
      ],
    };
  };

  /** New decompositions of the symbol's element, e.g. its value chain, opened once made. */
  const decompositionOffers = (occ: ObjectOccurrenceRow): MenuEntry[] => {
    const object = state.objects.get(occ.objectId);
    if (!object) return [];
    return canvasTypesFor(metamodel, object)
      .filter((t) => t.definition.decomposes)
      .map((t) => ({
        label: `New ${t.definition.name.toLowerCase()} for ${object.name}`,
        run: () => {
          const plan = diagramAroundPlan(state, metamodel, t, object);
          if (edit(plan.label, plan.edits)) openDiagram((plan.edits[0] as { id: Id }).id);
        },
      }));
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
      childDiagramMenu(occ),
      "separator",
      { label: "Remove from diagram", shortcut: "Del", run: () => removeFromDiagram(occId) },
      { label: "Delete object…", shortcut: "⇧Del", danger: true, run: () => askDeleteObject(objectId) },
    ];
  };

  /**
   * Takes a symbol off the diagram; the object stays in the model. On a decomposition (DOC-1b), a part's last symbol
   * is also no longer offered as missing, and the toast offers to take it out of the subject as well.
   */
  const removeFromDiagram = (occId: Id, otherwise?: Parameters<typeof edit>[2]) => {
    const occ = state.objectOccurrences.get(occId);
    if (!occ) return;
    const objectId = occ.objectId;
    const d = decompositionOf(state, metamodel, diagram);
    const last = occurrences.filter((o) => o.objectId === objectId).length === 1;
    const link =
      d && last
        ? state.relationships
            .find("byTarget", objectId)
            .find((r) => r.type === d.relationship && r.sourceId === d.subject.id)
        : undefined;
    const edits: Edit[] = [{ edit: "removeOccurrence", diagramId: id, occurrenceId: occId }];
    if (d && link) {
      const ignored = ((diagram.definition?.[IGNORED_PARTS] as Id[] | undefined) ?? []).filter((p) => p !== objectId);
      edits.push({
        edit: "setViewDefinition",
        diagramId: id,
        baseVersion: diagram.version,
        set: { [IGNORED_PARTS]: [...ignored, objectId] },
      });
    }
    const action =
      d && link
        ? {
            label: `Also remove from ${d.subject.name}`,
            run: () =>
              edit(`Remove ${nameOf(objectId)} from ${d.subject.name}`, [
                { edit: "deleteRelationship", id: link.id, baseVersion: link.version },
              ]),
          }
        : otherwise;
    if (edit(`Remove ${nameOf(objectId)} from ${diagram.name}`, edits, action)) choose(null);
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
      removeFromDiagram(selectedOcc.id, { label: "Delete object", run: () => askDeleteObject(objectId) });
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
  // A decomposition (DOC-1b): the way up, and the subject's parts not drawn yet. Both stay quiet when empty.
  const decomposing = decompositionOf(state, metamodel, diagram);
  const crumbs = breadcrumb(state, metamodel, diagram);
  const missing = missingParts(state, metamodel, diagram);
  const addMissing = () =>
    edit(`Add ${missing.length} to ${diagram.name}`, placePartsEdits(state, metamodel, diagram, missing));
  const ignoreMissing = () => {
    const ignored = (diagram.definition?.[IGNORED_PARTS] as Id[] | undefined) ?? [];
    edit(`Ignore ${missing.length} on ${diagram.name}`, [
      {
        edit: "setViewDefinition",
        diagramId: id,
        baseVersion: diagram.version,
        set: { [IGNORED_PARTS]: [...ignored, ...missing.map((p) => p.id)] },
      },
    ]);
  };

  return (
    <div className="diagram-editor">
      <Palette diagram={diagram} zoom={zoom} onZoom={(z) => setZoom(clampZoom(z))} onAdd={addInView} />
      {crumbs.length > 0 && (
        <nav className="crumbs" aria-label="Decomposition">
          {crumbs.map((c, i) => (
            <span key={c.object.id}>
              {i > 0 && <span className="crumb-sep">›</span>}
              {c.diagramId && i < crumbs.length - 1 ? (
                <button className="link" onClick={() => openDiagram(c.diagramId!)}>
                  {c.object.name}
                </button>
              ) : (
                <span aria-current={i === crumbs.length - 1 ? "page" : undefined}>{c.object.name}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      {decomposing && missing.length > 0 && (
        <div className="doc-banner diagram-banner" role="status">
          <span>
            {missing.length === 1 ? "1 part" : `${missing.length} parts`} of {decomposing.subject.name}{" "}
            {missing.length === 1 ? "is" : "are"} not on this diagram: {missing.map((p) => p.name).join(", ")}
          </span>
          <button onClick={addMissing}>Add to diagram</button>
          <button className="link" onClick={ignoreMissing}>
            Ignore
          </button>
        </div>
      )}
      <div
        ref={canvas}
        className="canvas"
        tabIndex={0}
        role="application"
        aria-label={`Diagram ${diagram.name}`}
        style={{ width: width * zoom, height: height * zoom }}
        data-zoom={zoom}
        onDragOver={onDragOver}
        onDragLeave={(e) => {
          if (!canvas.current?.contains(e.relatedTarget as Node | null)) setDropTarget(null);
        }}
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
            <ArrowMarkers />
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
            const look = symbolLook(state, metamodel, diagram, o, zoom);
            const { object, ink, rendition } = look;
            const count = repeats.get(o.objectId) ?? 1;
            const classes = [
              "occ",
              o.id === selected && "selected",
              siblings.has(o.id) && "sibling",
              flash.has(o.id) && "flash",
              traced?.has(o.objectId) && "traced",
              o.id === dropTarget && "drop-target",
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
                onDoubleClick={(e) => {
                  // Double-click drills down when the symbol has a child diagram; F2 always renames. With none, an
                  // element that could have a decomposition (DOC-1b) is offered one before renaming.
                  const target = drillTarget(o);
                  if (target) openDiagram(target);
                  else if (decompositionOffers(o).length) setDrillOffer({ x: e.clientX, y: e.clientY, occId: o.id });
                  else setRenaming(o.id);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  choose(o.id);
                  setMenu(null);
                  setOccMenu({ x: e.clientX, y: e.clientY, occId: o.id });
                }}
              >
                <SymbolShape look={look} box={b} zoom={zoom} />
                {drillTarget(o) && (
                  <g
                    className="drill"
                    role="link"
                    aria-label={`Open the child diagram of ${object?.name ?? "this symbol"}`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      openDiagram(drillTarget(o)!);
                    }}
                  >
                    <title>
                      {o.drillDownDiagramId ? "Child diagram" : "About it"}: {state.diagrams.get(drillTarget(o)!)?.name}
                    </title>
                    <rect x={b.x + b.w - 17} y={b.y + b.h - 17} width={14} height={14} rx={3} />
                    <GlyphUse glyph="drill" x={b.x + b.w - 16} y={b.y + b.h - 16} size={12} />
                  </g>
                )}
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
          {drawn.map((line) => (
            <LineShape key={line.l.id} metamodel={metamodel} line={line} selected={isChosen(line.rel)} />
          ))}
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
          <div
            className="new-symbol"
            style={{
              left: naming.box.x * zoom,
              top: naming.box.y * zoom,
              width: Math.max(naming.box.w * zoom, 200),
              minHeight: naming.box.h * zoom,
            }}
          >
            <div className="new-symbol-type">
              <Glyph glyph={notationFor(metamodel.objectType(naming.type)).glyph} size={12} />
              New {metamodel.objectType(naming.type)?.definition.name ?? naming.type}
              {naming.parent && <> in {nameOf(state.objectOccurrences.get(naming.parent)?.objectId ?? "")}</>}
            </div>
            <FindOrCreate
              key={naming.key}
              type={naming.type}
              folderId={defaultFolderFor(state, metamodel, naming.type, diagram)}
              label={`Name of the new ${metamodel.objectType(naming.type)?.definition.name ?? naming.type}`}
              commitOnBlur
              hint="Enter adds · Ctrl+Enter adds another · Esc cancels"
              onPick={(object) => placeExisting(object, naming.box, naming.parent)}
              onCreate={(name) => createObject(naming.type, naming.box, naming.parent, name)}
              onDone={(again) => {
                // Ctrl+Enter: the next one of the same type goes beside it, ready to be named.
                if (again)
                  startNaming(naming.type, { ...naming.box, x: naming.box.x + naming.box.w + 24 }, naming.parent);
                else {
                  setNaming(null);
                  canvas.current?.focus();
                }
              }}
            />
          </div>
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
      {drillOffer && (
        <ContextMenu
          x={drillOffer.x}
          y={drillOffer.y}
          label="Nothing to open yet"
          entries={(() => {
            const occ = state.objectOccurrences.get(drillOffer.occId);
            if (!occ) return [];
            return [
              ...decompositionOffers(occ),
              "separator",
              { label: "Rename", shortcut: "F2", run: () => setRenaming(occ.id) },
            ] as MenuEntry[];
          })()}
          onClose={() => setDrillOffer(null)}
        />
      )}
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

function Palette(props: { diagram: DiagramRow; zoom: number; onZoom(zoom: number): void; onAdd(type: string): void }) {
  const { diagram, zoom, onZoom, onAdd } = props;
  const { metamodel } = useModel();
  const types = paletteTypes(metamodel, diagram);
  return (
    <div className="palette" aria-label="Palette" role="toolbar">
      {types.map((t) => {
        const symbol = symbolFor(metamodel, diagram, t.definition.key);
        const notation = notationFor(t);
        return (
          <button
            type="button"
            key={t.definition.key}
            className="palette-item"
            draggable
            title={`Click to add a new ${t.definition.name} where there is room, or drag it to a spot (onto a symbol to put it inside)`}
            onClick={() => onAdd(t.definition.key)}
            onDragStart={(e) => {
              e.dataTransfer.setData(DRAG_TYPE, t.definition.key);
              e.dataTransfer.effectAllowed = "copy";
            }}
          >
            <span className="swatch" style={{ background: symbol.fill ?? notation.fill, color: notation.ink }}>
              <Glyph glyph={notation.glyph} size={12} />
            </span>
            {t.definition.name}
          </button>
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
