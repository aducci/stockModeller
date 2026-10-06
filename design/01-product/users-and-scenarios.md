# Users and scenarios

## Users

| User | Uses Connectome to… | Frequency |
|---|---|---|
| **Architect** (primary) | Model landscapes, design future states, produce diagrams for decisions | Daily |
| **Contributor** (application or process owner) | Keep their own objects up to date | Monthly |
| **Reviewer** (CIO, design authority) | Read diagrams and dashboards, comment, approve change requests | Weekly |
| **Model owner** (practice lead, admin) | Own the metamodel, diagram types, rules and permissions | Weekly |
| **Developer** | Write automations, panels and integrations | As needed |

## Jobs

| # | Job | Features |
|---|---|---|
| J1 | Understand the current landscape of a domain | Folders, search, diagrams, catalogues |
| J2 | Update a fact once and see it everywhere | Objects and occurrences |
| J3 | Design a future state without disturbing today's model | Scenarios, compare, merge |
| J4 | See the impact of retiring something | Queries, impact analysis |
| J5 | Review and approve what changed | Change requests |
| J6 | Get owners to keep their data current | Ownership, data-quality dashboards |
| J7 | Produce consistent diagrams without hand drawing | Diagram types, auto-layout, generated diagrams |
| J8 | Keep the model consistent without scripting | Rules, calculated properties |
| J9 | Sync with other systems | Import/export, connectors, external IDs |
| J10 | Extend the tool safely | Automations, panels, API |

## Validation scenarios

These six stories test the whole design end to end.

1. **Map an application landscape.**
   - Import 300 applications from XLSX into a folder.
   - Link them to capabilities in a matrix.
   - Generate one landscape diagram per capability.
2. **Design the CRM replacement.**
   - Create the scenario "Target 2027".
   - Retire Legacy CRM, add Cloud CRM, move 12 interfaces.
   - Compare with the baseline and raise a change request.
3. **Data-quality campaign.** Find applications without an owner, assign them, and track progress on a dashboard.
4. **Two architects, one diagram.** One renames an object while the other moves its occurrence. Both changes survive.
5. **Nightly CMDB sync.** Update servers and hosting relationships without overwriting architect-owned properties.
6. **Board pack.** Build a dashboard (roadmap, cost by capability, risk heatmap) and share a read-only link.
