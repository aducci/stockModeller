# ADR-010 — Semantic base types under a free metamodel

**Status.** Accepted (2026-10-06), from the [connection framework](../01-product/connection_framework.md). Amends [ADR-005](ADR-005-folders-and-nesting-relationships.md).

**Context.** The metamodel is fully configurable ([ADR-009](ADR-009-frameworks-as-packages.md)), so the engine knows nothing about what *serves*, *calls* or *implements* mean. Only the `nesting` flag carries behaviour. Explorer structure, moves, deletes, tracing, impact analysis and validation all need more meaning than that, without a fixed framework such as ArchiMate.

**Options.**
1. Hard-code a framework's types. Rejected: it contradicts ADR-009.
2. Let packages describe behaviour with more flags (`nesting`, `cascade`, `tracing`…). Every package would reinvent the same meanings, and queries and rules could not be shared.
3. **A small fixed vocabulary of semantic kinds (relationships), categories and levels (objects), which custom types map onto.**

**Decision.** Option 3, specified in [semantics.md](../02-model/semantics.md):
- every relationship type maps to one of 14 kinds (default `association`), optionally read in reverse;
- object types map to a category and a default level; the level is a property of each object;
- relationships carry an optional payload, and interactions hold their request/response messages as child flows;
- **containment** is the repository's structure: one container per object, and a contained object lives in its container's folder. Composition and aggregation are hierarchies that do not move anything.

**Consequences.**
- ✅ Custom terminology stays free; the engine, explorer, traces and validation work for any package.
- ✅ Queries and rules can be written against kinds (`-@flow->`) and survive renamed types.
- ✅ Re-parenting keeps the relationship's identity; deletes and moves are predictable.
- ⚠️ ADR-005's "moving an object between folders never changes its meaning" now has one exception: a contained object moves with its container, and leaving the folder means leaving the container.
- ⚠️ Fourteen kinds is a commitment: adding one later is cheap, removing one is a migration.
