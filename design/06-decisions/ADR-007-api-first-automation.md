# ADR-007 — API-first automation

**Context.** Customers will automate. Hosting customer code is expensive to build and run, and risky. The cheapest, easiest path that supports "anything" is to let customers run code wherever they like.

**Options.** (1) Hosted sandbox from day one. (2) **API-first: a REST API, webhooks and thin SDKs; the customer hosts the code.** (3) Low-code builder only.

**Decision.** Option 2 at launch:
- SDKs for TypeScript and Python, generated from OpenAPI plus a small helper layer;
- any other language uses the OpenAPI spec;
- a hosted runtime comes later, on the **same contract**.

The contract:
- read-only snapshots;
- `change()` as the only write path;
- preview mode;
- upsert by key or external ID;
- a run report.

**Consequences.**
- ✅ Near-zero cost to us; works with notebooks, CI, serverless functions and low-code tools today.
- ✅ Scripts written now run unchanged in the hosted runtime later (`runAutomation`).
- ⚠️ No "run" button for scripts at launch. Mitigated by "call webhook" actions on objects and catalogues.
