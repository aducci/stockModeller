// The built-in semantic vocabulary (design/02-model/semantics.md): what the engine understands about a model,
// whatever the repository's own types are called.
import corePackageJson from "../core/metamodel.json" with { type: "json" };
import type { MetamodelPackage } from "./metamodel";
import type { SemanticCategory, SemanticKind, SemanticLevel } from "./model";

/** What a kind means and allows (semantics.md §2). */
export interface SemanticKindInfo {
  kind: SemanticKind;
  /** Navigation label from the source's side (outgoing) and from the target's side (incoming), §9.1. */
  outgoing: string;
  incoming: string;
  /** May be shown by placing one symbol inside another. */
  nestable: boolean;
  /** Core properties every relationship type of this kind has (§4.3). */
  properties: string[];
}

const kind = (
  k: SemanticKind,
  outgoing: string,
  incoming: string,
  extra: Partial<Pick<SemanticKindInfo, "nestable" | "properties">> = {},
): SemanticKindInfo => ({ kind: k, outgoing, incoming, nestable: false, properties: [], ...extra });

/** Every kind, in the order the properties panel and the explorer list them. */
export const SEMANTIC_KINDS: readonly SemanticKindInfo[] = [
  kind("containment", "Contents", "Container", { nestable: true }),
  kind("composition", "Parts", "Part of", { nestable: true }),
  kind("aggregation", "Members", "Member of", { nestable: true }),
  kind("specialisation", "Generalisations", "Specialisations"),
  kind("realisation", "What this implements", "Implementations"),
  kind("representation", "What this represents", "Representations"),
  kind("serving", "Consumers", "Providers"),
  kind("assignment", "Performs", "Performed by"),
  kind("access", "Information used", "Used by", { properties: ["access.mode"] }),
  kind("interaction", "Interacts with", "Interacted with by", {
    properties: ["interaction.pattern", "interaction.protocol", "interaction.operation"],
  }),
  kind("flow", "Downstream", "Upstream"),
  kind("trigger", "Triggers", "Triggered by"),
  kind("influence", "Influences", "Influenced by", { properties: ["influence.effect"] }),
  kind("association", "Related", "Related"),
];

const byKind = new Map(SEMANTIC_KINDS.map((k) => [k.kind, k]));

export function semanticKindInfo(k: SemanticKind): SemanticKindInfo {
  return byKind.get(k)!;
}

export const SEMANTIC_CATEGORIES: readonly SemanticCategory[] = [
  "actor",
  "capability",
  "behaviour",
  "service",
  "interface",
  "component",
  "information",
  "technology",
  "location",
  "motivation",
  "other",
];

/** From the most abstract to the most concrete. */
export const SEMANTIC_LEVELS: readonly SemanticLevel[] = ["conceptual", "logical", "physical", "implementation"];

/** The property that holds an object's level (§4.2). Every object type has it. */
export const LEVEL_PROPERTY = "semantic.level";

/**
 * The core package (design/05-structures/core-metamodel.json): property types and value lists every repository has.
 * Other packages may not redefine its keys.
 */
export const corePackage = corePackageJson as MetamodelPackage;
