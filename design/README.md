# Connectome — design pack

**Connectome** (named after the map of all connections in a brain) is an **online, object-based architecture modelling tool**. People model the organisation as **objects** connected by **relationships**, stored once in a shared **repository**. **Diagrams** and **catalogues** are views of those objects, never separate drawings.

## The story in one table

| Metamodel (the rules) | Model (the facts) | On a diagram (the picture) |
|---|---|---|
| **Object type** (Application, Capability, Process…) | **Object** (Claims Manager) | **Object occurrence**: a symbol showing the object |
| **Relationship type** (serves, flows to, contains…) | **Relationship** (Claims Manager *serves* Handle Claim) | **Relationship occurrence**: a line showing the relationship |
| **Property type** (Owner, Status, Cost…) | **Property** (Owner = Dana) | Shown in labels, colours and the properties panel |
| **Diagram type** (Application landscape, Process flow…) | **Diagram** (Claims landscape) | — |

Everything is stored in **folders**. A **catalogue** is a live, editable table of objects. A **scenario** is a branch of the repository for designing future states.

## Contents

| Folder | Documents |
|---|---|
| [01-product](01-product/) | [Vision](01-product/vision.md) · [Users and scenarios](01-product/users-and-scenarios.md) · [Features and roadmap](01-product/features-and-roadmap.md) · [Connection framework](01-product/connection_framework.md) |
| [02-model](02-model/) | [**Overview (start here)**](02-model/overview.md) · [Objects, relationships, properties](02-model/objects-relationships-properties.md) · [Metamodel](02-model/metamodel.md) · [Diagrams and catalogues](02-model/diagrams-and-catalogues.md) · [Scenarios and time](02-model/scenarios-and-time.md) · [Rules and calculations](02-model/rules-and-calculations.md) · [Semantics](02-model/semantics.md) (proposed) |
| [03-platform](03-platform/) | [Architecture](03-platform/architecture.md) · [Storage](03-platform/storage.md) + [schema.sql](03-platform/schema.sql) · [Collaboration and changes](03-platform/collaboration-and-changes.md) · [Queries](03-platform/queries.md) · [API](03-platform/api.md) + [openapi.yaml](03-platform/openapi.yaml) · [Automation](03-platform/automation.md) · [Import and export](03-platform/import-export.md) · [Security](03-platform/security.md) |
| [04-ux](04-ux/) | [Workbench](04-ux/workbench.md) · [Screens](04-ux/screens.md) · [Diagram editor](04-ux/diagram-editor.md) · [Design system](04-ux/design-system.md) |
| [05-structures](05-structures/) | TypeScript types, JSON Schemas and examples: the machine-checkable version of 02-model |
| [06-decisions](06-decisions/) | Architecture decision records |
| [decision-log.md](decision-log.md) | Product decisions (answered questions) and what is still open |

## Six principles

1. **One fact, one place.** An object exists once. Every diagram, catalogue and scenario refers to it and never copies it.
2. **Diagrams show the model.** Drawing a symbol creates or reuses an object; drawing a line creates a relationship; nesting a symbol creates a nesting relationship.
3. **Online and together.** Live co-editing, comments and full history; no files, no check-out, no "save".
4. **Configuration, not code.** Rules, calculations and generated diagrams are configured. Frameworks (ArchiMate, BPMN, TOGAF…) are packages on the same object model.
5. **Safe changes.** Every change is a transaction that can be undone, audited and reviewed.
6. **Cheap to run, easy to connect.** Pooled cloud on PostgreSQL alone at launch; API-first automation in any language; interoperability as a core investment.
