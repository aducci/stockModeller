# ADR-002 — Modular monolith on PostgreSQL

**Context.** A small team, a strongly consistent core (the change engine is the only writer), and a requirement to keep cloud costs low.

**Options.** Microservices; **a modular monolith**; serverless functions. For infrastructure: PostgreSQL + Redis + a queue service, or **PostgreSQL alone**.

**Decision.**
- One container image with two roles:
  - **web**: API, live updates, change engine, queries;
  - **worker**: rules, layout, imports, webhooks; scales to zero.
- PostgreSQL is also the job queue (`SKIP LOCKED`) and the fan-out channel (`LISTEN/NOTIFY`).
- Redis or OpenSearch are added only when measurements require them.

**Consequences.**
- ✅ Three moving parts (image, database, object storage): cheap, simple to operate, portable to any cloud or on premise.
- ✅ In-process transactions; easy local development.
- ⚠️ Module boundaries must be enforced by lint rules, so parts can be extracted later.
- ⚠️ `LISTEN/NOTIFY` fan-out is fine to roughly 5,000 concurrent connections. Beyond that, add Redis behind the same interface.
