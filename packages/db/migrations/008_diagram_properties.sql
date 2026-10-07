-- Slice A-1b (design/02-model/metamodel.md §4; storage.md §7, edit `setDiagramProperties`): property values of a
-- diagram, from its diagram type's `properties`, as {"documentation.link": "…"}.
ALTER TABLE diagram ADD COLUMN properties jsonb NOT NULL DEFAULT '{}';
