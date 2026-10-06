-- Added while building the change engine (see design/03-platform/storage.md, "Additions made while building").

-- Per-property conflict checks need to know which version last changed each field, and who changed it:
--   { "name": {"v": 4, "by": "01J…"}, "properties.lifecycle.status": {"v": 2, "by": "…"}, "*": {"v": 1, "by": "…"} }
-- "*" covers every field and is written when an item is created or restored.
ALTER TABLE object       ADD COLUMN field_versions jsonb NOT NULL DEFAULT '{}';
ALTER TABLE relationship ADD COLUMN field_versions jsonb NOT NULL DEFAULT '{}';
ALTER TABLE diagram      ADD COLUMN field_versions jsonb NOT NULL DEFAULT '{}';

-- Deleted objects and diagrams are kept as tombstones (so versions keep rising when they are restored),
-- and they still name their folder. Folders are therefore tombstoned too, and names only need to be
-- unique among live folders.
ALTER TABLE folder ADD COLUMN deleted boolean NOT NULL DEFAULT false;
ALTER TABLE folder DROP CONSTRAINT folder_repository_id_parent_id_name_key;
CREATE UNIQUE INDEX folder_unique_live_name ON folder (repository_id, COALESCE(parent_id, ''), name) WHERE NOT deleted;
