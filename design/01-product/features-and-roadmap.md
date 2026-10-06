# Features and roadmap

**Phase key:**
- **Launch**: the first customers can run their practice on it.
- **Next**: within 6 months of launch.
- **Later**: a planned investment, not yet scheduled.

## Features

| Area | Feature | Phase |
|---|---|---|
| **Model** | Folders; objects; relationships; properties | Launch |
| | Nesting relationships (hierarchies) | Launch |
| | Tags, attachments, external IDs | Launch |
| **Metamodel** | Object, relationship and property types; diagram types; metamodel editor | Launch |
| | Type inheritance | Launch |
| | Packages (the way all frameworks are delivered): Essentials at launch. ArchiMate, BPMN and TOGAF are **content**, not code, so they ship whenever they are ready | Launch |
| **Rules** | Relationship rules (allowed pairs, block or warn) | Launch |
| | Validation rules; calculated properties | Next |
| | Derived relationships | Later |
| **Diagrams** | Diagrams with object and relationship occurrences (many occurrences per object); annotations | Launch |
| | Diagram types (symbols, colour rules, labels, legend) | Launch |
| | Auto-layout (grid, nested) | Launch |
| | Auto-layout (layered, radial) | Next |
| | Generated diagrams | Next |
| | Drill-down links | Next |
| | PNG/SVG export | Launch |
| | PDF/PowerPoint export | Next |
| **Catalogues and views** | Catalogues (live editable tables) | Launch |
| | Matrices, roadmaps | Next |
| | Charts, dashboards | Later |
| **Scenarios** | Lifecycle dates and "as of" filtering | Launch |
| | Scenarios with compare and merge | Next |
| **Collaboration** | Live co-editing, presence, comments, history, undo | Launch |
| | Notifications | Next |
| | Change requests and governance policies (fully designed; the change log supports them from day one) | Later |
| **Interoperability** (strategic) | XLSX/CSV and JSON import/export; ArchiMate exchange format; bulk API | Launch |
| | BPMN XML | Next |
| | Markup formats (Mermaid, PlantUML, Graphviz DOT); model-as-code YAML; Visio | Later |
| **Automation** | REST API, webhooks, API tokens, TypeScript and Python SDKs: automation in any language, hosted by the customer | Launch |
| | Hosted script runtime (schedules, triggers, run reports) | Later |
| | Panels, connectors | Later |
| **Security** | SSO (OIDC); roles: admin, modeller, viewer | Launch |
| | Folder permissions | Launch |
| | Contributor role, SAML, SCIM, audit export | Next |
| **Commercial** | Plans, seat licensing, billing (the roles model already separates editors from viewers) | Later |

## Roadmap

| Milestone | Scope | Exit criterion |
|---|---|---|
| **M0 Skeleton** (6 wk) | Repository, folders, objects, relationships, change log, workbench shell, one live diagram; PostgreSQL-only deployment | Two browsers edit one diagram; history shows both changes |
| **M1 Modeller** (12 wk) | Metamodel editor, Essentials package, relationship rules, diagram types, catalogues, XLSX and ArchiMate import/export, comments, search, SSO, roles, folder permissions | A pilot customer maps a 300-application landscape |
| **M2 Launch** (8 wk) | Undo, history and restore, annotations, exports, API + webhooks + SDKs, multi-tenant guards, performance (50k objects) | 10 users, 4 weeks, no data incidents; cost per workspace within budget |
| **M3 Next** (16 wk) | Scenarios, matrices, roadmaps, generated diagrams, validation, calculated properties, BPMN, notifications | CRM-replacement and data-quality scenarios pass |
| **M4 Later** | Change requests, dashboards, derived relationships, markup formats, hosted automation, panels, connectors, billing | — |

## Build order

1. **The change log first.** Live sync, undo, history, audit, later approvals and the API all depend on it.
2. **The metamodel before UI polish.** Palettes, properties panels and catalogues are all driven by it.
3. **Diagrams done properly before other views.** The same object-reference contract serves catalogues, matrices and roadmaps.
4. **Scenario-aware reads and tenant guards from day one.** Both are expensive to retrofit.
