-- Slice Sem-3 (design/02-model/semantics.md §5–§6; storage.md §7).

-- What a relationship carries: an ordered list of object ids. "Which flows carry this?" is one GIN lookup.
ALTER TABLE relationship ADD COLUMN payload text[] NOT NULL DEFAULT '{}';
CREATE INDEX relationship_by_payload ON relationship USING gin (payload) WHERE NOT deleted;

-- A message: the interaction it belongs to, and its place among the interaction's messages.
ALTER TABLE relationship ADD COLUMN parent_id text;
ALTER TABLE relationship ADD COLUMN rank integer NOT NULL DEFAULT 0;
CREATE INDEX relationship_by_parent ON relationship (repository_id, scenario_id, parent_id)
  WHERE parent_id IS NOT NULL AND NOT deleted;
