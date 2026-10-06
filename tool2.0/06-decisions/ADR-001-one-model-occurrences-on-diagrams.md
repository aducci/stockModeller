# ADR-001 — One model; diagrams hold occurrences

**Context.** The core promise is that a symbol on a diagram *is* an object. When diagrams store their own shapes and data, the same thing drawn twice becomes two unrelated things.

**Options.** (1) Diagrams as documents, synced to a model later. (2) **One model; diagrams store only occurrences (references + layout).** (3) A graph database for the model and a document store for diagrams.

**Decision.** Option 2, in one PostgreSQL database. An object may occur any number of times, on any diagram; every occurrence points to the one object. Relationship occurrences connect two specific object occurrences.

**Consequences.**
- ✅ Rename once, updated everywhere. Queries, impact analysis and comparison work on diagrams too. One change can update the model and the layout atomically.
- ✅ Layout freedom: the same object can be drawn wherever it reads best, without becoming a second thing.
- ⚠️ The editor must make repeats visible (sibling highlight, ×N marker) so readers don't mistake them for different objects.
