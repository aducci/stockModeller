# ADR-004 — Scenarios are branches

**Context.** Future and alternative states must not disturb the baseline. Copying objects per state splits identity, breaks comparison and needs manual syncing.

**Options.** (1) Copy the model per state. (2) **Branches that store only their own changes and share ids.** (3) Git-like commits of the whole repository.

**Decision.** Option 2, at most 3 levels deep, with per-property merge and conflict review.

**Consequences.**
- ✅ One identity per object in every scenario; exact comparison; small storage; baseline edits flow into scenarios.
- ⚠️ Every read must be scenario-aware from day one.
