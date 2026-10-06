# ADR-005 — Folders for organising, nesting relationships for hierarchy

**Context.** Users need two different things: a place to **organise and secure** content (by team, domain or project), and **structural hierarchies** (capability trees, process decomposition, locations). Mixing them, for example by using the hierarchy as the storage location, forces one tree to serve both purposes.

**Decision.**
- Every object, diagram, catalogue, query and automation sits in exactly **one folder**. Folders carry permissions.
- Hierarchies are **nesting relationships**: relationship types marked `nesting` (e.g. *contains*), optionally `singleParent`. Placing a symbol inside another on a diagram creates one.

**Consequences.**
- ✅ One concept for all links (relationships). Any number of hierarchies. Folder permissions are easy to explain.
- ✅ Moving an object between folders never changes its meaning.
- ⚠️ Roll-ups and trees must name the nesting type they follow (e.g. `-contains->`); the Essentials package uses *contains* everywhere to keep this simple.
