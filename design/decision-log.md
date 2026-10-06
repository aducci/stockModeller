# Decision log

## Product decisions (answered by the product owner)

| # | Question | Decision | Applied in |
|---|---|---|---|
| D1 | Deployment and tenancy | **Cloud-based and cost-effective.** Pooled multi-tenant, because it is cheapest, with guards so performance never degrades, and dedicated placement for any customer who needs it | [architecture](03-platform/architecture.md) §2–3, [ADR-008](06-decisions/ADR-008-cost-effective-multi-tenant-cloud.md) |
| D2 | On premise | Not a goal. The design stays portable (container + PostgreSQL + S3-compatible storage) | [architecture](03-platform/architecture.md) §4, [vision](01-product/vision.md) |
| D3 | Frameworks | Frameworks are **instances of the metamodel**: packages of configuration, never product code | [metamodel](02-model/metamodel.md#frameworks-are-configuration), [ADR-009](06-decisions/ADR-009-frameworks-as-packages.md) |
| D4 | Scenarios | Next phase. Reads are scenario-aware from day one | [features](01-product/features-and-roadmap.md) |
| D5 | Occurrences | **Many occurrences per object, also on one diagram.** All point to the one object; relationship occurrences join two specific object occurrences | [overview](02-model/overview.md), [diagrams](02-model/diagrams-and-catalogues.md), [ADR-001](06-decisions/ADR-001-one-model-occurrences-on-diagrams.md) |
| D6 | Folders | One folder per item; folder-based permissions | [objects](02-model/objects-relationships-properties.md#5-folders), [ADR-005](06-decisions/ADR-005-folders-and-nesting-relationships.md) |
| D7 | Automation | Cheapest and easiest: **API-first, any language**; hosted runtime later on the same contract | [automation](03-platform/automation.md), [ADR-007](06-decisions/ADR-007-api-first-automation.md) |
| D8 | Interoperability | A strategic investment. XLSX, JSON and ArchiMate at launch; BPMN next; markup formats (Mermaid, PlantUML, DOT) and model-as-code later; a pluggable adapter pipeline | [import-export](03-platform/import-export.md) |
| D9 | Change requests and governance | Not at launch. The design is kept complete, and the change log supports them from day one | [collaboration-and-changes](03-platform/collaboration-and-changes.md#4-change-requests-after-launch-fully-designed-now-so-the-change-log-supports-them-from-day-one) |
| D10 | Pricing | Paid editors, free viewers. Billing is not built at launch; the roles already separate editors and viewers | [security](03-platform/security.md#2-permissions) |
| D11 | Name | **Connectome**: the map of all connections in a brain | everywhere |
| D12 | Region | EU first | [architecture](03-platform/architecture.md) |

## Still open

| # | Question | Proposal |
|---|---|---|
| O1 | Name clearance | Check trademarks and domains for "Connectome" in software classes (EU, US). Fallbacks: **Neurograph**, **Synaptic Modeler**, **Axonium** |
| O2 | Hosted automation runtime (later) | Pick the cheapest scale-to-zero option when it is scheduled (e.g. container jobs vs. V8 isolates); the contract is fixed already |
| O3 | First markup format | Mermaid (widest adoption), then PlantUML |
| O4 | Second package after Essentials | ArchiMate 3.2 (most requested in EA); BPMN follows with the BPMN adapter |

## Found while building (M0)

Questions the build raised. Each has a provisional answer in the code; change the code if the product owner decides otherwise.

| # | Question | Provisional answer (in the code now) |
|---|---|---|
| B1 | Is a nesting cycle checked per nesting type, or across all nesting types together? | Per type: *contains* can never loop, but a *contains* path and a *composedOf* path may cross |
| B2 | Which end does a rule's `cardinality` limit? | The source: `0..1` means a source has at most one such relationship to a matching target (e.g. at most one location). Lower bounds (`1..1`, `1..*`) cannot be enforced while editing; they become validation findings later |
| B3 | What does a `warn` relationship rule mean? | The pair is allowed but discouraged: the change is applied and a warning finding is returned. A pair matched by no rule is refused |
| B4 | What happens to nested occurrences when their parent occurrence is removed, or the nesting relationship behind them is deleted? | They move to the top level of the diagram and stay where they were on screen |
| B5 | Folders are not scenario-aware (`folder` has no `scenario_id`). Who may delete them? | Only changes in the baseline. Folders created in a scenario exist in every scenario |
| B6 | Deleting an object leaves `objectRef` properties elsewhere pointing at it | Left as they are for now; a validation rule should flag them (M3) |
| B7 | `example-repository.json` scenario edits omit `baseVersion`, which `changes.ts` requires | The tests fill it in from the state; the example should carry it |
| B8 | Must an object's name be unique only among objects of exactly its type, or also among its subtypes? | Exactly its type (`application` and `saasApplication` are checked separately) |
| B9 | When an object changes type, values the new type cannot hold | They are dropped; undo restores them |
| B10 | The query language is M1 work, but `GET …/objects?q=` is in the API now | A subset works now: `type:<key>` (subtypes included) and `folder:"<path>"` (subfolders included), joined with `AND`. Anything else gets 422. It is a strict subset of the grammar, so queries written now keep working |
| B11 | Undo: "if someone has since changed the same property, that part is skipped" | Not yet: an undo whose inverse conflicts is rejected as a whole (409). Skipping parts needs per-edit conflict handling in the engine. Undo is limited to your own changes (403 otherwise) and to once per change |
| B12 | Sign-in before OIDC (M1) | Development tokens `Bearer dev:<workspace>:<user>`, only when `CONNECTOME_DEV_AUTH=1`, and refused when `NODE_ENV=production`. Without it every API request gets 401 |
