# ADR-006 — Property values in JSONB

**Context.** Customers define their own property types and change them at run time. A typical repository holds 20k–200k objects with 10–40 properties each.

**Options.** (1) Entity-attribute-value table. (2) **JSONB per object, validated against the metamodel.** (3) Generated tables per object type. (4) A graph database.

**Decision.** Option 2, with GIN indexes and optional indexes for frequently filtered properties.

**Consequences.**
- ✅ One row per object; fast reads; no DDL when the metamodel changes.
- ⚠️ Type safety lives in the change engine, which is the only writer.
- ⚠️ Traversal uses recursive SQL, which is fine at modelling depths (≤ 6). Revisit if impact analysis misses its budget at the design limit.
