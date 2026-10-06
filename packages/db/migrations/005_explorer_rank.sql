-- Explorer order (storage.md §7, edit `setRank`): a fractional-index key per folder, object and diagram. NULL means
-- unranked: shown after the ranked items, by name.
ALTER TABLE folder ADD COLUMN rank text;
ALTER TABLE object ADD COLUMN rank text;
ALTER TABLE diagram ADD COLUMN rank text;
