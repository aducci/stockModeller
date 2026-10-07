// Runtime validation of changes arriving from outside (API, live connection, imports).
// The inferred types are checked against the hand-written ones in test/schemas.test.ts.
import { z } from "zod";
import { MAX_EDITS_PER_CHANGE } from "./changes";

const id = z.string().min(1).max(64);
const typeKey = z.string().regex(/^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)?$/);
const propertyKey = z.string().min(1).max(128);
const version = z.number().int().min(1);
const coordinate = z.number().int();
const size = z.number().int().positive();
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const moneySchema = z.strictObject({ amount: z.number().finite(), currency: z.string().regex(/^[A-Z]{3}$/) });
export const propertyValueSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  moneySchema,
  z.array(z.string()),
  z.null(),
]);
const properties = z.record(propertyKey, propertyValueSchema);
const tags = z.array(z.string().min(1).max(100)).max(100);
const externalIds = z.record(z.string().min(1).max(64), z.string().min(1).max(256));
const confirmation = z.strictObject({ by: id, at: z.iso.datetime({ offset: true }) });
const confirmations = z.record(propertyKey, confirmation);
/** A view's definition (slice V-1): top-level keys, any JSON below them; the web app and packages/views read it. */
const viewDefinition = z
  .record(z.string().regex(/^[a-z][a-zA-Z0-9]*$/), z.unknown())
  .refine((d) => JSON.stringify(d).length <= 262_144, "A view definition can be at most 256 kB");

const shape = z.enum(["rect", "roundRect", "ellipse", "hexagon", "cylinder", "person", "icon"]);
const arrow = z.enum(["none", "arrow", "diamond", "circle"]);
const symbolStyle = z.strictObject({
  shape: shape.optional(),
  fill: color.optional(),
  stroke: color.optional(),
  icon: z.string().optional(),
  rendition: z.string().optional(),
  width: size.optional(),
  height: size.optional(),
  label: z.string().optional(),
});
const lineStyle = z.strictObject({
  style: z.enum(["solid", "dashed", "dotted"]).optional(),
  color: color.optional(),
  startArrow: arrow.optional(),
  endArrow: arrow.optional(),
});
const stylePatch = z.strictObject({
  shape: shape.nullable().optional(),
  fill: color.nullable().optional(),
  stroke: color.nullable().optional(),
  icon: z.string().nullable().optional(),
  rendition: z.string().nullable().optional(),
  width: size.nullable().optional(),
  height: size.nullable().optional(),
  label: z.string().nullable().optional(),
  style: z.enum(["solid", "dashed", "dotted"]).nullable().optional(),
  color: color.nullable().optional(),
  startArrow: arrow.nullable().optional(),
  endArrow: arrow.nullable().optional(),
});

const route = z.union([
  z.strictObject({ mode: z.literal("auto") }),
  z.strictObject({ mode: z.literal("manual"), points: z.array(z.tuple([z.number(), z.number()])).max(500) }),
]);

export const objectOccurrenceSchema = z.strictObject({
  id,
  objectId: id,
  parentOccurrenceId: id.nullable().default(null),
  x: coordinate,
  y: coordinate,
  w: size,
  h: size,
  z: z.number().int().default(0),
  style: symbolStyle.default({}),
  drillDownDiagramId: id.nullable().default(null),
  pinned: z.boolean().default(false),
});

export const relationshipOccurrenceSchema = z.strictObject({
  id,
  relationshipId: id,
  sourceOccurrenceId: id,
  targetOccurrenceId: id,
  shownAs: z.enum(["line", "nesting"]).default("line"),
  route: route.default({ mode: "auto" }),
  labelPosition: z.number().min(0).max(1).default(0.5),
  style: lineStyle.default({}),
});

const annotationContent = z.union([
  z.strictObject({ shape: z.enum(["text", "note", "rect", "ellipse"]), text: z.string().max(10_000) }),
  z.strictObject({ shape: z.literal("frame"), title: z.string().max(500) }),
  z.strictObject({ shape: z.literal("image"), attachmentId: id }),
]);

export const annotationSchema = z.strictObject({
  id,
  parentOccurrenceId: id.nullable().default(null),
  x: coordinate,
  y: coordinate,
  w: size,
  h: size,
  z: z.number().int().default(0),
  content: annotationContent,
  style: symbolStyle.default({}),
});

const onExisting = { id, baseVersion: version };

export const editSchema = z.discriminatedUnion("edit", [
  // model edits
  z.strictObject({
    edit: z.literal("createObject"),
    id,
    type: typeKey,
    name: z.string(),
    folderId: id,
    key: z.string().min(1).max(64).optional(),
    description: z.string().max(100_000).optional(),
    properties: properties.optional(),
    tags: tags.optional(),
    externalIds: externalIds.optional(),
    confirmations: confirmations.optional(),
  }),
  z.strictObject({ edit: z.literal("setProperties"), ...onExisting, set: properties }),
  z.strictObject({ edit: z.literal("renameObject"), ...onExisting, name: z.string() }),
  z.strictObject({ edit: z.literal("setTags"), ...onExisting, tags }),
  z.strictObject({ edit: z.literal("setDescription"), ...onExisting, description: z.string() }),
  z.strictObject({
    edit: z.literal("confirmProperties"),
    ...onExisting,
    keys: z.array(propertyKey).min(1).max(1000),
  }),
  z.strictObject({
    edit: z.literal("setConfirmations"),
    ...onExisting,
    set: z.record(propertyKey, confirmation.nullable()),
  }),
  z.strictObject({ edit: z.literal("moveToFolder"), ...onExisting, folderId: id }),
  z.strictObject({
    edit: z.literal("changeObjectType"),
    ...onExisting,
    type: typeKey,
    propertyMap: z.record(propertyKey, propertyKey).optional(),
  }),
  z.strictObject({
    edit: z.literal("deleteObject"),
    ...onExisting,
    contents: z.enum(["moveUp", "deleteContents"]).optional(),
  }),
  z.strictObject({
    edit: z.literal("createRelationship"),
    id,
    type: typeKey,
    sourceId: id,
    targetId: id,
    name: z.string().max(200).optional(),
    properties: properties.optional(),
    tags: tags.optional(),
    externalIds: externalIds.optional(),
    payload: z.array(id).max(1000).optional(),
    parentId: id.nullable().optional(),
    rank: z.number().int().optional(),
  }),
  z.strictObject({
    edit: z.literal("reconnectRelationship"),
    ...onExisting,
    sourceId: id.optional(),
    targetId: id.optional(),
  }),
  z.strictObject({
    edit: z.literal("changeRelationshipType"),
    ...onExisting,
    type: typeKey,
    propertyMap: z.record(propertyKey, propertyKey).optional(),
    set: properties.optional(),
  }),
  z.strictObject({ edit: z.literal("setPayload"), ...onExisting, payload: z.array(id).max(1000) }),
  z.strictObject({ edit: z.literal("deleteRelationship"), ...onExisting }),
  z.strictObject({ edit: z.literal("createFolder"), id, parentId: id.nullable(), name: z.string() }),
  z.strictObject({ edit: z.literal("renameFolder"), id, name: z.string() }),
  z.strictObject({ edit: z.literal("moveFolder"), id, parentId: id.nullable() }),
  z.strictObject({ edit: z.literal("deleteFolder"), id, contents: z.enum(["refuseIfNotEmpty", "deleteContents"]) }),
  z.strictObject({
    edit: z.literal("setRank"),
    item: z.enum(["folder", "object", "diagram"]),
    id,
    rank: z.string().min(1).max(200).nullable(),
  }),
  // diagram edits
  z.strictObject({
    edit: z.literal("createDiagram"),
    id,
    name: z.string(),
    diagramType: typeKey,
    folderId: id,
    description: z.string().max(100_000).optional(),
    definition: viewDefinition.optional(),
  }),
  z.strictObject({
    edit: z.literal("updateDiagram"),
    id,
    baseVersion: version,
    set: z.strictObject({
      name: z.string().optional(),
      description: z.string().max(100_000).optional(),
      folderId: id.optional(),
      diagramType: typeKey.optional(),
    }),
  }),
  z.strictObject({ edit: z.literal("deleteDiagram"), id }),
  z.strictObject({ edit: z.literal("setViewDefinition"), diagramId: id, baseVersion: version, set: viewDefinition }),
  z.strictObject({ edit: z.literal("addObjectOccurrence"), diagramId: id, occurrence: objectOccurrenceSchema }),
  z.strictObject({
    edit: z.literal("moveObjectOccurrence"),
    diagramId: id,
    occurrenceId: id,
    x: coordinate,
    y: coordinate,
    w: size.optional(),
    h: size.optional(),
    parentOccurrenceId: id.nullable().optional(),
  }),
  z.strictObject({
    edit: z.literal("styleOccurrence"),
    diagramId: id,
    occurrenceId: id,
    style: stylePatch,
    z: z.number().int().optional(),
  }),
  z.strictObject({ edit: z.literal("removeOccurrence"), diagramId: id, occurrenceId: id }),
  z.strictObject({
    edit: z.literal("addRelationshipOccurrence"),
    diagramId: id,
    occurrence: relationshipOccurrenceSchema,
  }),
  z.strictObject({
    edit: z.literal("routeRelationshipOccurrence"),
    diagramId: id,
    occurrenceId: id,
    route,
    labelPosition: z.number().min(0).max(1).optional(),
  }),
  z.strictObject({ edit: z.literal("addAnnotation"), diagramId: id, annotation: annotationSchema }),
  z.strictObject({
    edit: z.literal("updateAnnotation"),
    diagramId: id,
    annotationId: id,
    set: z.strictObject({
      parentOccurrenceId: id.nullable().optional(),
      x: coordinate.optional(),
      y: coordinate.optional(),
      w: size.optional(),
      h: size.optional(),
      z: z.number().int().optional(),
      content: annotationContent.optional(),
      style: symbolStyle.optional(),
    }),
  }),
  z.strictObject({ edit: z.literal("removeAnnotation"), diagramId: id, annotationId: id }),
]);

export const changeSchema = z.strictObject({
  id,
  scenarioId: id,
  label: z.string().max(500),
  changeRequestId: id.optional(),
  edits: z.array(editSchema).min(1).max(MAX_EDITS_PER_CHANGE),
});

/** Parses and normalises a change (fills occurrence defaults). Throws a ZodError when it is malformed. */
export function parseChange(input: unknown) {
  return changeSchema.parse(input);
}

/** Messages a browser sends over the live connection (ClientMessage in changes.ts). */
export const clientMessageSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("submit"), change: changeSchema }),
  z.strictObject({
    type: z.literal("presence"),
    diagramId: id.optional(),
    selection: z.array(id).max(1000).optional(),
    cursor: z.strictObject({ x: z.number().finite(), y: z.number().finite() }).optional(),
  }),
  z.strictObject({
    type: z.literal("interest"),
    add: z.array(id).max(10_000).optional(),
    remove: z.array(id).max(10_000).optional(),
  }),
]);
