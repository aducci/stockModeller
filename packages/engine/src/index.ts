export { applyChange, invertLog, type ApplyContext, type ApplyResult } from "./apply";
export {
  Metamodel,
  checkSection,
  MetamodelError,
  type CompiledRule,
  type ResolvedDiagramType,
  type ResolvedObjectType,
  type ResolvedRelationshipType,
} from "./metamodel";
export { checkValue } from "./properties";
export { Collection, ModelState, type TouchedRow } from "./state";
export * from "./rows";
export { snapshotRows, stateFromSnapshot, type RepositorySnapshot, type SnapshotRows } from "./snapshot";
export { newlyRefused, relationshipCombinations, unallowedCombinations, type Combination } from "./rule-usage";
export {
  carriedProperties,
  metamodelImpact,
  propertyUsage,
  strandedValues,
  type MetamodelImpact,
  type PropertyUsage,
} from "./property-usage";
export {
  findSimilarObjects,
  kinshipOf,
  nameSimilarity,
  namesOf,
  normaliseName,
  type Kinship,
  type SimilarObject,
  type SimilarQuery,
} from "./similar";
export { containerOf, duplicateRelationships, nameClash, sameName, type NameClash, type NamedPlace } from "./identity";
export { judgedDistinct, possibleDuplicates, type DuplicatePair, type DuplicateQuery } from "./duplicates";
