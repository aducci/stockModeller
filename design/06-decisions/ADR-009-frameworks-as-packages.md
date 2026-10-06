# ADR-009 — Frameworks are packages, not features

**Context.** Customers use ArchiMate, BPMN, TOGAF, IT4IT or their own methods, often mixed. Building framework-specific screens or code creates a product per framework.

**Decision.** One object model; every framework is a **package**: plain JSON containing types, rules, diagram types and **exchange mappings** for standard file formats. Import and export adapters are format-specific but framework-neutral; the mapping decides the types.

**Consequences.**
- ✅ New frameworks ship as content, without a release. Customers can extend package types or build their own.
- ✅ The same ArchiMate file can be imported into an ArchiMate repository or mapped onto Essentials.
- ⚠️ Framework-specific notation (e.g. exact ArchiMate symbols) must be expressible through symbols and diagram types. The symbol set is designed with the major frameworks in mind.
