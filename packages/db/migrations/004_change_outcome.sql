-- Resending a change returns its original outcome (api.md §1, "Safe retries"), so the outcome is stored:
--   { "versions": { "01J…": 13 }, "findings": [ { "rule": "…", "itemId": "…", "severity": "warning", "message": "…" } ] }
ALTER TABLE change ADD COLUMN outcome jsonb NOT NULL DEFAULT '{}';
