# Decisions

Each record states the context, the options, the decision and its consequences. A decision is changed by adding a new record that supersedes it.

| # | Decision |
|---|---|
| [ADR-001](ADR-001-one-model-occurrences-on-diagrams.md) | One model; diagrams hold occurrences (many per object), never copies |
| [ADR-002](ADR-002-modular-monolith.md) | Modular monolith on PostgreSQL alone (web + worker roles) |
| [ADR-003](ADR-003-server-ordered-changes.md) | Server-ordered changes with per-property conflict checks |
| [ADR-004](ADR-004-scenarios-as-branches.md) | Scenarios are branches that share object identity |
| [ADR-005](ADR-005-folders-and-nesting-relationships.md) | Everything lives in folders; hierarchies are nesting relationships |
| [ADR-006](ADR-006-property-values-jsonb.md) | Property values in JSONB, validated against the metamodel |
| [ADR-007](ADR-007-api-first-automation.md) | API-first automation in any language; hosted runtime later |
| [ADR-008](ADR-008-cost-effective-multi-tenant-cloud.md) | Pooled multi-tenant cloud, dedicated placement on demand |
| [ADR-009](ADR-009-frameworks-as-packages.md) | Frameworks are packages, not features |
