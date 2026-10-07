-- Slice V-1 (design/02-model/views-and-design-artifacts.md §9; storage.md §7, edit `setViewDefinition`): what a
-- matrix or other view shows. '{}' for canvas diagrams; the web app and packages/views read it, the engine patches it.
ALTER TABLE diagram ADD COLUMN definition jsonb NOT NULL DEFAULT '{}';
