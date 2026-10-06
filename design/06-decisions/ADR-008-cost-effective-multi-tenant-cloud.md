# ADR-008 — Cost-effective cloud: pooled multi-tenancy, isolated on demand

**Context.** Connectome must be cloud-based and cheap to run. Multi-tenancy is wanted only if it never degrades performance.

**Options.** (1) A database or stack per customer: isolated, but costly at small scale. (2) **Pooled: one database with row-level security, plus guards, plus optional dedicated placement.** (3) Schema per tenant: migration overhead without real isolation gains.

**Decision.** Option 2:
- `workspace_id` + row-level security;
- writes serialised per repository (never globally);
- per-workspace rate limits and fair job queues;
- statement timeouts;
- a connection pooler.

A routing table maps each workspace to a database. Any workspace can move to a dedicated database or region without code changes, triggered by per-workspace metrics.

**Consequences.**
- ✅ Indicative launch cost ≈ €350–500 per month for about 50 workspaces (see architecture §3).
- ✅ Large or regulated customers get isolation as a placement option, not a fork.
- ⚠️ Tenant-isolation tests are mandatory on every endpoint; per-workspace metrics are a launch requirement.
