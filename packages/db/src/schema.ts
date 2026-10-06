// Kysely table types for the tables the application reads and writes so far (see migrations/).
import type { ColumnType, Generated } from "kysely";
import type { RuleFinding } from "@connectome/model";

/** jsonb: read as parsed JSON, written as a JSON string (so arrays are not sent as PostgreSQL arrays). */
type Json<T = unknown> = ColumnType<T, string, string>;
type Timestamp = ColumnType<Date, string | undefined, string>;

interface Tenant {
  workspace_id: string;
}

interface ScenarioRow extends Tenant {
  repository_id: string;
  scenario_id: string;
  id: string;
  deleted: Generated<boolean>;
}

export interface WorkspaceTable {
  id: string;
  name: string;
  region: Generated<string>;
  settings: Json<Record<string, unknown>>;
  created_at: Generated<Date>;
}

export interface RepositoryTable extends Tenant {
  id: string;
  name: string;
  description: Generated<string>;
  metamodel_version: Generated<string>;
  seq: ColumnType<number, number | undefined, number>;
  settings: Json<Record<string, unknown>>;
}

export interface ScenarioTable extends Tenant {
  id: string;
  repository_id: string;
  parent_id: string | null;
  name: string;
  state: Generated<string>;
  branched_at_seq: number | null;
}

export interface FolderTable extends Tenant {
  id: string;
  repository_id: string;
  parent_id: string | null;
  name: string;
  deleted: Generated<boolean>;
}

interface MetamodelRow extends Tenant {
  repository_id: string;
  key: string;
}

export interface ValueListTable extends MetamodelRow {
  values: Json;
}

export interface PropertyTypeTable extends MetamodelRow {
  name: string;
  group_key: string;
  data_type: string;
  definition: Json<Record<string, unknown>>;
  package: string | null;
}

export interface ObjectTypeTable extends MetamodelRow {
  name: string;
  extends: string | null;
  abstract: boolean;
  definition: Json<Record<string, unknown>>;
  package: string | null;
}

export interface RelationshipTypeTable extends MetamodelRow {
  name: string;
  nesting: boolean;
  single_parent: boolean;
  definition: Json<Record<string, unknown>>;
  package: string | null;
}

export interface RuleTable extends MetamodelRow {
  kind: "relationship" | "validation" | "derivation";
  definition: Json<Record<string, unknown>>;
  enabled: Generated<boolean>;
}

export interface DiagramTypeTable extends MetamodelRow {
  name: string;
  definition: Json<Record<string, unknown>>;
  package: string | null;
}

export interface ObjectTable extends ScenarioRow {
  type_key: string;
  folder_id: string;
  name: string;
  key: string | null;
  description: string;
  properties: Json<Record<string, unknown>>;
  tags: string[];
  external_ids: Json<Record<string, string>>;
  version: number;
  field_versions: Json<Record<string, { v: number; by: string }>>;
  base_version: number | null;
  updated_at: Timestamp;
  updated_by: string | null;
}

export interface RelationshipTable extends ScenarioRow {
  type_key: string;
  source_id: string;
  target_id: string;
  name: string;
  properties: Json<Record<string, unknown>>;
  tags: string[];
  external_ids: Json<Record<string, string>>;
  derived_by: string | null;
  version: number;
  field_versions: Json<Record<string, { v: number; by: string }>>;
  base_version: number | null;
  updated_at: Timestamp;
  updated_by: string | null;
}

export interface DiagramTable extends ScenarioRow {
  diagram_type_key: string;
  folder_id: string;
  name: string;
  description: string;
  generated_by: Json<{ rule: string; focusObjectId: string } | null> | null;
  version: number;
  field_versions: Json<Record<string, { v: number; by: string }>>;
}

export interface ObjectOccurrenceTable extends ScenarioRow {
  diagram_id: string;
  object_id: string;
  parent_occurrence_id: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  style: Json<Record<string, unknown>>;
  drill_down_diagram_id: string | null;
  pinned: boolean;
  suppressed: Generated<boolean>;
}

export interface RelationshipOccurrenceTable extends ScenarioRow {
  diagram_id: string;
  relationship_id: string;
  source_occurrence_id: string;
  target_occurrence_id: string;
  shown_as: "line" | "nesting";
  route: Json;
  label_position: number;
  style: Json<Record<string, unknown>>;
}

export interface AnnotationTable extends ScenarioRow {
  diagram_id: string;
  parent_occurrence_id: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  content: Json;
  style: Json<Record<string, unknown>>;
}

export interface ChangeTable extends Tenant {
  id: string;
  repository_id: string;
  seq: number;
  scenario_id: string;
  actor_id: string | null;
  source: string;
  label: string;
  change_request_id: string | null;
  undoes_change_id: string | null;
  committed_at: Generated<Date>;
  outcome: Json<{ versions?: Record<string, number>; findings?: RuleFinding[] }>;
}

export interface ChangeLogTable extends Tenant {
  repository_id: string;
  seq: number;
  edit_index: number;
  change_id: string;
  scenario_id: string;
  item_id: string | null;
  edit: Json;
  inverse: Json;
}

export interface Database {
  workspace: WorkspaceTable;
  repository: RepositoryTable;
  scenario: ScenarioTable;
  folder: FolderTable;
  value_list: ValueListTable;
  property_type: PropertyTypeTable;
  object_type: ObjectTypeTable;
  relationship_type: RelationshipTypeTable;
  rule: RuleTable;
  diagram_type: DiagramTypeTable;
  object: ObjectTable;
  relationship: RelationshipTable;
  diagram: DiagramTable;
  object_occurrence: ObjectOccurrenceTable;
  relationship_occurrence: RelationshipOccurrenceTable;
  annotation: AnnotationTable;
  change: ChangeTable;
  change_log: ChangeLogTable;
}
