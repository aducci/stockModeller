-- Slice DOC-R2 (design/02-model/views-and-design-artifacts.md §13, decision B70; storage.md §7, edits createLink,
-- updateLink, deleteLink): links are records of their own, from an element to a diagram or document, an element or a
-- web page, of a kind the metamodel defines. They replace the Documentation property (documentation.link), whose
-- values become links here.
CREATE TABLE link (
  workspace_id       text NOT NULL,
  repository_id      text NOT NULL REFERENCES repository(id) ON DELETE CASCADE,
  scenario_id        text NOT NULL,
  id                 text NOT NULL,
  source_id          text NOT NULL,
  kind               text NOT NULL,
  target_object_id   text,
  target_diagram_id  text,
  url                text,
  label              text,
  deleted            boolean NOT NULL DEFAULT false,
  PRIMARY KEY (repository_id, scenario_id, id),
  CHECK (num_nonnulls(target_object_id, target_diagram_id, url) = 1)
);
CREATE INDEX link_by_source ON link (repository_id, source_id);
CREATE INDEX link_by_target_object ON link (repository_id, target_object_id) WHERE target_object_id IS NOT NULL;
CREATE INDEX link_by_target_diagram ON link (repository_id, target_diagram_id) WHERE target_diagram_id IS NOT NULL;

ALTER TABLE link ENABLE ROW LEVEL SECURITY;
ALTER TABLE link FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON link
  USING (workspace_id = current_setting('app.workspace_id', true))
  WITH CHECK (workspace_id = current_setting('app.workspace_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON link TO connectome_app;

-- Every repository gets Essentials' link kinds unless its metamodel already has some.
UPDATE repository SET settings = jsonb_set(
  settings, '{metamodel}',
  coalesce(settings->'metamodel', '{}'::jsonb) || jsonb_build_object('linkKinds', '[
    {"key": "document", "name": "Documented in", "inverseName": "Documents", "targets": ["document"]},
    {"key": "drillDown", "name": "Drills down to", "inverseName": "Drill-down of", "targets": ["diagram"], "drillDown": true},
    {"key": "web", "name": "Web link", "inverseName": "Web link", "targets": ["web"]},
    {"key": "related", "name": "Related to", "inverseName": "Related from", "targets": ["element"]}
  ]'::jsonb))
WHERE NOT coalesce(settings->'metamodel' ? 'linkKinds', false);

-- A diagram type that linked its diagrams from a property links them by kind: documents as documents, other views
-- as drill-downs.
UPDATE diagram_type SET definition = jsonb_set(
  definition #- '{subject,linkProperty}', '{subject,linkKind}',
  to_jsonb(CASE WHEN definition->>'kind' = 'document' THEN 'document' ELSE 'drillDown' END))
WHERE definition->'subject' ? 'linkProperty';

-- The values of documentation.link become links, in their order: diagram:<id> of a document → document, of another
-- view → drillDown, a web address → web.
INSERT INTO link (workspace_id, repository_id, scenario_id, id, source_id, kind, target_diagram_id, url)
SELECT o.workspace_id, o.repository_id, o.scenario_id, 'L-' || o.id || '-' || v.ord, o.id,
  CASE
    WHEN v.value NOT LIKE 'diagram:%' THEN 'web'
    WHEN (SELECT dt.definition->>'kind' FROM diagram d
          JOIN diagram_type dt ON dt.repository_id = d.repository_id AND dt.key = d.diagram_type_key
          WHERE d.repository_id = o.repository_id AND d.id = substr(v.value, 9) LIMIT 1) = 'document' THEN 'document'
    ELSE 'drillDown'
  END,
  CASE WHEN v.value LIKE 'diagram:%' THEN substr(v.value, 9) END,
  CASE WHEN v.value NOT LIKE 'diagram:%' THEN v.value END
FROM object o
CROSS JOIN LATERAL jsonb_array_elements_text(
  CASE jsonb_typeof(o.properties->'documentation.link')
    WHEN 'array' THEN o.properties->'documentation.link'
    ELSE jsonb_build_array(o.properties->'documentation.link')
  END) WITH ORDINALITY v(value, ord)
WHERE o.properties ? 'documentation.link' AND NOT o.deleted AND v.value <> '';

UPDATE object SET properties = properties - 'documentation.link' WHERE properties ? 'documentation.link';
