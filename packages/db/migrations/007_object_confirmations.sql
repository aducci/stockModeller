-- Slice P-3 (design/04-ux/workbench.md "Confirmations"; storage.md §7, edit `confirmProperties`): who last confirmed
-- each property's value and when, as {"lifecycle.status": {"by": "U-…", "at": "…"}}. NULL means none.
ALTER TABLE object ADD COLUMN confirmations jsonb;
