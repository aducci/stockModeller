# ADR-003 — Server-ordered changes

**Context.** Live co-editing is required. The model has rules that must hold after every change: types, allowed relationships, no nesting cycles, permissions. CRDTs guarantee that copies converge, not that the result is valid. For example, two concurrent nestings can create a cycle.

**Options.** (1) CRDT documents with validation after merge. (2) **The server orders changes; it checks versions per property; browsers apply edits optimistically and rebase.** (3) Locking and check-out.

**Decision.** Option 2. CRDTs only for long rich-text fields (v2).

**Consequences.**
- ✅ Every committed state is valid. Rejections are explained to the user.
- ✅ The same log drives history, undo, audit, change requests and webhooks.
- ⚠️ Requires a connection: no long offline editing (an accepted non-goal).
