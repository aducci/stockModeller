-- Slice D-3 (design/02-model/duplicates-and-identity.md §6; storage.md §7, edits `setAliases`, `setNotDuplicates`):
-- other names an object goes by, as ["CRM", "Claims Mgmt"], and the objects it was judged not to be a duplicate of,
-- as [{"of": "01H…", "name": "…", "otherName": "…"}]. NULL means none.
ALTER TABLE object ADD COLUMN aliases jsonb;
ALTER TABLE object ADD COLUMN not_duplicates jsonb;
