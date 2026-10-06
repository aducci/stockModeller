-- Connectome — PostgreSQL 16 schema (design baseline). See storage.md.
-- Ids are ULIDs (text). Every tenant table has workspace_id and row-level security.
-- Scenario-aware tables (object, relationship, diagram and its items) have scenario_id:
--   baseline rows are the base; a scenario row with the same id overrides it (deleted = true hides it).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================ accounts
CREATE TABLE workspace (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  region      text NOT NULL DEFAULT 'eu',
  settings    jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app_user (
  id            text PRIMARY KEY,
  email         text NOT NULL UNIQUE,
  display_name  text NOT NULL,
  external_sub  text UNIQUE
);

CREATE TABLE membership (
  workspace_id  text NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  user_id       text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  role          text NOT NULL CHECK (role IN ('owner','admin','modeller','contributor','viewer')),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE user_group (
  id            text PRIMARY KEY,
  workspace_id  text NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  name          text NOT NULL,
  external_id   text,
  UNIQUE (workspace_id, name)
);

CREATE TABLE group_member (
  group_id  text NOT NULL REFERENCES user_group(id) ON DELETE CASCADE,
  user_id   text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, user_id)
);

-- ============================================================ repository, scenarios, folders
CREATE TABLE repository (
  id                 text PRIMARY KEY,
  workspace_id       text NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  name               text NOT NULL,
  description        text NOT NULL DEFAULT '',
  metamodel_version  text NOT NULL DEFAULT '1.0.0',
  seq                bigint NOT NULL DEFAULT 0,           -- last committed change
  settings           jsonb NOT NULL DEFAULT '{}',         -- currency, default diagram type, ...
  UNIQUE (workspace_id, name)
);

CREATE TABLE scenario (
  id               text PRIMARY KEY,
  workspace_id     text NOT NULL,
  repository_id    text NOT NULL REFERENCES repository(id) ON DELETE CASCADE,
  parent_id        text REFERENCES scenario(id),         -- NULL = baseline
  name             text NOT NULL,
  state            text NOT NULL DEFAULT 'draft'
                   CHECK (state IN ('baseline','draft','proposed','approved','merged','archived')),
  branched_at_seq  bigint,
  UNIQUE (repository_id, name)
);
CREATE UNIQUE INDEX scenario_one_baseline ON scenario (repository_id) WHERE parent_id IS NULL;

CREATE TABLE folder (
  id             text PRIMARY KEY,
  workspace_id   text NOT NULL,
  repository_id  text NOT NULL REFERENCES repository(id) ON DELETE CASCADE,
  parent_id      text REFERENCES folder(id),
  name           text NOT NULL,
  UNIQUE NULLS NOT DISTINCT (repository_id, parent_id, name)
);

-- ============================================================ metamodel
CREATE TABLE value_list (
  repository_id  text NOT NULL REFERENCES repository(id) ON DELETE CASCADE,
  workspace_id   text NOT NULL,
  key            text NOT NULL,
  values         jsonb NOT NULL,          -- [{ "key":"active", "label":"Active", "color":"#7fd1a2", "order":2 }]
  PRIMARY KEY (repository_id, key)
);

CREATE TABLE property_type (
  repository_id  text NOT NULL REFERENCES repository(id) ON DELETE CASCADE,
  workspace_id   text NOT NULL,
  key            text NOT NULL,           -- 'lifecycle.status'
  name           text NOT NULL,
  group_key      text NOT NULL,           -- 'lifecycle'
  data_type      text NOT NULL CHECK (data_type IN ('text','richText','number','money','date','boolean','list','multiList','objectRef','person','url','calculated')),
  definition     jsonb NOT NULL DEFAULT '{}',   -- unit, valueList, objectTypes, required, default, validation, formula, role, master
  package        text,
  PRIMARY KEY (repository_id, key)
);

CREATE TABLE object_type (
  repository_id  text NOT NULL REFERENCES repository(id) ON DELETE CASCADE,
  workspace_id   text NOT NULL,
  key            text NOT NULL,           -- 'application'
  name           text NOT NULL,
  extends        text,
  abstract       boolean NOT NULL DEFAULT false,
  definition     jsonb NOT NULL DEFAULT '{}',   -- plural, layer, properties[], symbol, uniqueName, keyPattern, defaultFolder
  package        text,
  PRIMARY KEY (repository_id, key)
);

CREATE TABLE relationship_type (
  repository_id  text NOT NULL REFERENCES repository(id) ON DELETE CASCADE,
  workspace_id   text NOT NULL,
  key            text NOT NULL,           -- 'serves', 'contains'
  name           text NOT NULL,
  nesting        boolean NOT NULL DEFAULT false,
  single_parent  boolean NOT NULL DEFAULT false,
  definition     jsonb NOT NULL DEFAULT '{}',   -- verb, inverseVerb, properties[], line
  package        text,
  PRIMARY KEY (repository_id, key)
);

CREATE TABLE rule (
  repository_id  text NOT NULL REFERENCES repository(id) ON DELETE CASCADE,
  workspace_id   text NOT NULL,
  key            text NOT NULL,
  kind           text NOT NULL CHECK (kind IN ('relationship','validation','derivation')),
  definition     jsonb NOT NULL,          -- relationship: {relationshipType, sourceType, targetType, cardinality, enforcement}
  enabled        boolean NOT NULL DEFAULT true,
  PRIMARY KEY (repository_id, key)
);

CREATE TABLE diagram_type (
  repository_id  text NOT NULL REFERENCES repository(id) ON DELETE CASCADE,
  workspace_id   text NOT NULL,
  key            text NOT NULL,
  name           text NOT NULL,
  definition     jsonb NOT NULL,          -- see 05-structures/diagram-type.schema.json
  package        text,
  PRIMARY KEY (repository_id, key)
);

-- ============================================================ model (scenario-aware)
CREATE TABLE object (
  workspace_id   text NOT NULL,
  repository_id  text NOT NULL REFERENCES repository(id) ON DELETE CASCADE,
  scenario_id    text NOT NULL REFERENCES scenario(id) ON DELETE CASCADE,
  id             text NOT NULL,
  type_key       text NOT NULL,
  folder_id      text NOT NULL REFERENCES folder(id),
  name           text NOT NULL,
  key            text,
  description    text NOT NULL DEFAULT '',
  properties     jsonb NOT NULL DEFAULT '{}',   -- { "lifecycle.status": "active", "cost.runCost": {"amount":120000,"currency":"EUR"} }
  tags           text[] NOT NULL DEFAULT '{}',
  external_ids   jsonb NOT NULL DEFAULT '{}',
  version        integer NOT NULL DEFAULT 1,
  base_version   integer,                       -- scenario rows: version of the row it was copied from
  deleted        boolean NOT NULL DEFAULT false,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     text,
  PRIMARY KEY (repository_id, scenario_id, id)
);
CREATE INDEX object_by_type   ON object (repository_id, scenario_id, type_key) WHERE NOT deleted;
CREATE INDEX object_by_folder ON object (repository_id, scenario_id, folder_id) WHERE NOT deleted;
CREATE INDEX object_props     ON object USING gin (properties jsonb_path_ops);
CREATE INDEX object_name_trgm ON object USING gin (name gin_trgm_ops);
CREATE INDEX object_fulltext  ON object USING gin (to_tsvector('simple', name || ' ' || description));
CREATE INDEX object_ext_ids   ON object USING gin (external_ids jsonb_path_ops);

CREATE TABLE relationship (
  workspace_id   text NOT NULL,
  repository_id  text NOT NULL REFERENCES repository(id) ON DELETE CASCADE,
  scenario_id    text NOT NULL REFERENCES scenario(id) ON DELETE CASCADE,
  id             text NOT NULL,
  type_key       text NOT NULL,
  source_id      text NOT NULL,
  target_id      text NOT NULL,
  name           text NOT NULL DEFAULT '',
  properties     jsonb NOT NULL DEFAULT '{}',
  tags           text[] NOT NULL DEFAULT '{}',
  external_ids   jsonb NOT NULL DEFAULT '{}',
  derived_by     text,                          -- stored derived relationship: rule key
  version        integer NOT NULL DEFAULT 1,
  base_version   integer,
  deleted        boolean NOT NULL DEFAULT false,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     text,
  PRIMARY KEY (repository_id, scenario_id, id),
  CHECK (source_id <> target_id)
);
CREATE INDEX relationship_by_source ON relationship (repository_id, scenario_id, source_id) WHERE NOT deleted;
CREATE INDEX relationship_by_target ON relationship (repository_id, scenario_id, target_id) WHERE NOT deleted;
CREATE INDEX relationship_by_type   ON relationship (repository_id, scenario_id, type_key) WHERE NOT deleted;

-- ============================================================ views (diagrams are scenario-aware)
CREATE TABLE diagram (
  workspace_id      text NOT NULL,
  repository_id     text NOT NULL REFERENCES repository(id) ON DELETE CASCADE,
  scenario_id       text NOT NULL REFERENCES scenario(id) ON DELETE CASCADE,
  id                text NOT NULL,
  diagram_type_key  text NOT NULL,
  folder_id         text NOT NULL REFERENCES folder(id),
  name              text NOT NULL,
  description       text NOT NULL DEFAULT '',
  generated_by      jsonb,                      -- { "rule": "...", "focusObjectId": "..." }
  version           integer NOT NULL DEFAULT 1,
  deleted           boolean NOT NULL DEFAULT false,
  PRIMARY KEY (repository_id, scenario_id, id)
);
CREATE UNIQUE INDEX diagram_generated_once ON diagram (repository_id, scenario_id, (generated_by->>'rule'), (generated_by->>'focusObjectId'))
  WHERE generated_by IS NOT NULL AND NOT deleted;

CREATE TABLE object_occurrence (
  workspace_id          text NOT NULL,
  repository_id         text NOT NULL,
  scenario_id           text NOT NULL,
  id                    text NOT NULL,
  diagram_id            text NOT NULL,
  object_id             text NOT NULL,
  parent_occurrence_id  text,                   -- nested inside; x/y relative to it
  x integer NOT NULL, y integer NOT NULL, w integer NOT NULL, h integer NOT NULL,
  z                     integer NOT NULL DEFAULT 0,
  style                 jsonb NOT NULL DEFAULT '{}',
  drill_down_diagram_id text,
  pinned                boolean NOT NULL DEFAULT false,   -- generated diagrams: keep on regeneration
  suppressed            boolean NOT NULL DEFAULT false,   -- generated diagrams: user removed it, keep removed
  deleted               boolean NOT NULL DEFAULT false,
  PRIMARY KEY (repository_id, scenario_id, id)
);
CREATE INDEX object_occurrence_by_diagram ON object_occurrence (repository_id, scenario_id, diagram_id);   -- many occurrences per object allowed
CREATE INDEX object_occurrence_by_object ON object_occurrence (repository_id, object_id);

CREATE TABLE relationship_occurrence (
  workspace_id     text NOT NULL,
  repository_id    text NOT NULL,
  scenario_id      text NOT NULL,
  id               text NOT NULL,
  diagram_id       text NOT NULL,
  relationship_id  text NOT NULL,
  source_occurrence_id  text NOT NULL,          -- object occurrence showing the relationship's source
  target_occurrence_id  text NOT NULL,
  shown_as         text NOT NULL DEFAULT 'line' CHECK (shown_as IN ('line','nesting')),
  route            jsonb NOT NULL DEFAULT '{"mode":"auto"}',
  label_position   real NOT NULL DEFAULT 0.5,
  style            jsonb NOT NULL DEFAULT '{}',
  deleted          boolean NOT NULL DEFAULT false,
  PRIMARY KEY (repository_id, scenario_id, id)
);
CREATE INDEX relationship_occurrence_by_relationship ON relationship_occurrence (repository_id, relationship_id);

CREATE TABLE annotation (
  workspace_id          text NOT NULL,
  repository_id         text NOT NULL,
  scenario_id           text NOT NULL,
  id                    text NOT NULL,
  diagram_id            text NOT NULL,
  parent_occurrence_id  text,
  x integer NOT NULL, y integer NOT NULL, w integer NOT NULL, h integer NOT NULL,
  z                     integer NOT NULL DEFAULT 0,
  content               jsonb NOT NULL,          -- { "shape":"text"|"frame"|"note"|"rect"|"ellipse"|"image", "text":..., "attachmentId":... }
  style                 jsonb NOT NULL DEFAULT '{}',
  deleted               boolean NOT NULL DEFAULT false,
  PRIMARY KEY (repository_id, scenario_id, id)
);

CREATE TABLE catalogue (
  id             text PRIMARY KEY,
  workspace_id   text NOT NULL,
  repository_id  text NOT NULL REFERENCES repository(id) ON DELETE CASCADE,
  folder_id      text NOT NULL REFERENCES folder(id),
  name           text NOT NULL,
  definition     jsonb NOT NULL,                -- { query, columns[], sort[], groupBy, asOf }
  version        integer NOT NULL DEFAULT 1
);

CREATE TABLE saved_query (
  id             text PRIMARY KEY,
  workspace_id   text NOT NULL,
  repository_id  text NOT NULL REFERENCES repository(id) ON DELETE CASCADE,
  folder_id      text NOT NULL REFERENCES folder(id),
  name           text NOT NULL,
  text           text NOT NULL,
  parameters     jsonb NOT NULL DEFAULT '[]'
);

CREATE TABLE dashboard (
  id             text PRIMARY KEY,
  workspace_id   text NOT NULL,
  repository_id  text NOT NULL REFERENCES repository(id) ON DELETE CASCADE,
  folder_id      text NOT NULL REFERENCES folder(id),
  name           text NOT NULL,
  kind           text NOT NULL DEFAULT 'dashboard' CHECK (kind IN ('dashboard','matrix','roadmap','chart')),
  definition     jsonb NOT NULL
);

-- ============================================================ changes
CREATE TABLE change_request (
  id             text PRIMARY KEY,
  workspace_id   text NOT NULL,
  repository_id  text NOT NULL REFERENCES repository(id) ON DELETE CASCADE,
  scenario_id    text REFERENCES scenario(id),
  title          text NOT NULL,
  description    text NOT NULL DEFAULT '',
  state          text NOT NULL DEFAULT 'open' CHECK (state IN ('open','inReview','approved','rejected','applied','withdrawn')),
  author_id      text REFERENCES app_user(id),
  reviewers      jsonb NOT NULL DEFAULT '[]',
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE change (
  id                 text PRIMARY KEY,           -- client-generated ULID (safe retries)
  workspace_id       text NOT NULL,
  repository_id      text NOT NULL REFERENCES repository(id) ON DELETE CASCADE,
  seq                bigint NOT NULL,
  scenario_id        text NOT NULL REFERENCES scenario(id),
  actor_id           text,                       -- user id, automation id or 'system'
  source             text NOT NULL CHECK (source IN ('ui','api','automation','system','import','merge','undo')),
  label              text NOT NULL DEFAULT '',   -- "Move Claims Manager"
  change_request_id  text REFERENCES change_request(id),
  undoes_change_id   text,
  committed_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (repository_id, seq)
);

CREATE TABLE change_log (
  workspace_id   text NOT NULL,
  repository_id  text NOT NULL,
  seq            bigint NOT NULL,
  edit_index     smallint NOT NULL,
  change_id      text NOT NULL REFERENCES change(id),
  scenario_id    text NOT NULL,
  item_id        text,                           -- object / relationship / diagram / occurrence id
  edit           jsonb NOT NULL,                 -- see 05-structures/changes.ts
  inverse        jsonb NOT NULL,
  PRIMARY KEY (repository_id, seq, edit_index)
) PARTITION BY HASH (repository_id);
CREATE TABLE change_log_p0 PARTITION OF change_log FOR VALUES WITH (MODULUS 4, REMAINDER 0);
CREATE TABLE change_log_p1 PARTITION OF change_log FOR VALUES WITH (MODULUS 4, REMAINDER 1);
CREATE TABLE change_log_p2 PARTITION OF change_log FOR VALUES WITH (MODULUS 4, REMAINDER 2);
CREATE TABLE change_log_p3 PARTITION OF change_log FOR VALUES WITH (MODULUS 4, REMAINDER 3);
CREATE INDEX change_log_by_item ON change_log (repository_id, item_id, seq);

-- ============================================================ collaboration
CREATE TABLE comment (
  id             text PRIMARY KEY,
  workspace_id   text NOT NULL,
  repository_id  text NOT NULL REFERENCES repository(id) ON DELETE CASCADE,
  thread_id      text NOT NULL,
  anchor         jsonb NOT NULL,                 -- {"objectId"} | {"relationshipId"} | {"diagramId","occurrenceId"?} | {"changeRequestId"}
  author_id      text REFERENCES app_user(id),
  body           text NOT NULL,
  resolved       boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX comment_by_anchor ON comment USING gin (anchor jsonb_path_ops);

CREATE TABLE attachment (
  id             text PRIMARY KEY,
  workspace_id   text NOT NULL,
  repository_id  text NOT NULL REFERENCES repository(id) ON DELETE CASCADE,
  object_id      text NOT NULL,
  file_name      text NOT NULL,
  mime_type      text NOT NULL,
  size_bytes     bigint NOT NULL,
  storage_key    text NOT NULL
);

CREATE TABLE rule_finding (
  workspace_id   text NOT NULL,
  repository_id  text NOT NULL,
  scenario_id    text NOT NULL,
  rule_key       text NOT NULL,
  item_id        text NOT NULL,
  severity       text NOT NULL CHECK (severity IN ('info','warning','error')),
  message        text NOT NULL,
  PRIMARY KEY (repository_id, scenario_id, rule_key, item_id)
);

-- ============================================================ security
CREATE TABLE access_grant (
  id             text PRIMARY KEY,
  workspace_id   text NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  subject_kind   text NOT NULL CHECK (subject_kind IN ('user','group')),
  subject_id     text NOT NULL,
  scope_kind     text NOT NULL CHECK (scope_kind IN ('repository','scenario','folder','objectType')),
  scope_id       text NOT NULL,
  permission     text NOT NULL CHECK (permission IN ('none','read','comment','edit','approve','admin'))
);

CREATE TABLE secret (
  workspace_id   text NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  name           text NOT NULL,
  ciphertext     bytea NOT NULL,
  PRIMARY KEY (workspace_id, name)
);

-- ============================================================ automation
CREATE TABLE automation (
  id             text PRIMARY KEY,
  workspace_id   text NOT NULL,
  repository_id  text NOT NULL REFERENCES repository(id) ON DELETE CASCADE,
  folder_id      text NOT NULL REFERENCES folder(id),
  name           text NOT NULL,
  code           text NOT NULL,
  triggers       jsonb NOT NULL DEFAULT '[{"kind":"manual"}]',
  permissions    jsonb NOT NULL DEFAULT '{"write": false, "hosts": []}',
  enabled        boolean NOT NULL DEFAULT true,
  version        integer NOT NULL DEFAULT 1
);

CREATE TABLE automation_run (
  id                  text PRIMARY KEY,
  workspace_id        text NOT NULL,
  automation_id       text NOT NULL REFERENCES automation(id) ON DELETE CASCADE,
  automation_version  integer NOT NULL,
  scenario_id         text,
  started_by          text,
  trigger             jsonb NOT NULL,
  parameters          jsonb NOT NULL DEFAULT '{}',
  preview             boolean NOT NULL DEFAULT false,
  status              text NOT NULL CHECK (status IN ('queued','running','succeeded','failed','cancelled','timedOut')),
  report              jsonb,
  change_ids          text[] NOT NULL DEFAULT '{}',
  started_at          timestamptz,
  finished_at         timestamptz
);

-- ============================================================ row-level security (pattern; apply to every tenant table)
ALTER TABLE object ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON object USING (workspace_id = current_setting('app.workspace_id', true));
