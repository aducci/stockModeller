// Validation of packages and diagram types against the JSON Schemas in the design pack (copied to ../schemas).
import { Ajv2020, type ErrorObject } from "ajv/dist/2020.js";
import metamodelSchema from "../schemas/metamodel.schema.json" with { type: "json" };
import diagramTypeSchema from "../schemas/diagram-type.schema.json" with { type: "json" };
import type { DiagramType, MetamodelPackage } from "./metamodel";

const ajv = new Ajv2020({ allErrors: true, strict: false });
const checkPackage = ajv.compile<MetamodelPackage>(metamodelSchema);
const checkDiagramType = ajv.compile<DiagramType>(diagramTypeSchema);

export type SchemaResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

function result<T>(valid: boolean, value: unknown, errors: ErrorObject[] | null | undefined): SchemaResult<T> {
  if (valid) return { ok: true, value: value as T };
  return { ok: false, errors: (errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message ?? "is invalid"}`) };
}

export function validatePackage(value: unknown): SchemaResult<MetamodelPackage> {
  return result(checkPackage(value), value, checkPackage.errors);
}

export function validateDiagramType(value: unknown): SchemaResult<DiagramType> {
  return result(checkDiagramType(value), value, checkDiagramType.errors);
}
