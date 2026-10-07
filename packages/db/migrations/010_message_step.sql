-- Slice V-3 (design/02-model/views-and-design-artifacts.md §6, decision V5; storage.md §7, edit `setMessageStep`): a
-- message's place in a sequence view, per diagram, as a fractional-index key. NULL on canvases.
ALTER TABLE relationship_occurrence ADD COLUMN step text;
