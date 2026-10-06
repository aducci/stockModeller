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

## Semantics: proposed defaults awaiting the product owner

From the [connection framework](01-product/connection_framework.md), designed in [semantics.md](02-model/semantics.md) and [ADR-010](06-decisions/ADR-010-semantic-base-types.md). The design already uses each default; answering differently changes the named section.

| # | Question | Proposed default | Alternative |
|---|---|---|---|
| S1 | Does a contained object have to live in its container's folder? | **Yes** ("folder follows container", semantics §3): the explorer tree is unambiguous and folder permissions cover whole subtrees | Each object keeps its own folder and shows under its container anyway; permissions then come from a folder the object is not shown in |
| S2 | Is the semantic level set per object type or per object? | Per object (`semantic.level` property), with the type's default; a type can fix it | Per type only (simpler, but *Payment* at four levels needs four types) |
| S3 | Which object categories? | The 11 in semantics §4.1 | A shorter list (component, information, behaviour, actor, other) |
| S4 | Deleting a container: what happens to its contents by default? | **Kept**, moved up a level; "Delete contents too" is a choice in the dialog | Deleted with it, like a folder's contents |
| S5 | Can a part be composed into more than one whole? | No by default (`singleParent`); a type may allow it | Yes by default |
| S6 | May a custom type read against its kind's direction (*Realised by* from concept to concrete)? | Yes, with `semanticDirection: reverse` | No: every type must follow the kind's direction |
| S7 | How are interaction requests and responses stored? | As child flow relationships of the interaction (`parentId`), so tracing treats them as flows | As request/response fields on the interaction (simpler, but only one of each and invisible to flow tracing) |
| S8 | What can a payload be? | Any objects (a list); non-information payloads are flagged, not refused | Information objects only |
| S9 | Does specialisation inherit anything (properties, relationships)? | No values are inherited; navigation shows the general object's relationships as "via specialisation", read-only (slice Sem-4) | Inherit property values unless overridden |
| S10 | Essentials 1.1.0: add `service`, `interface`, `composedOf`, `represents`, `calls`, `triggers`, `specialises` (semantics §10)? | Yes, so the framework's examples can be modelled out of the box | Keep Essentials as is and ship them in a separate package |
| S11 | Does the explorer show semantic groups (Serves, Flows…) under objects by default? | Yes, collapsed after the contents, with a toggle to hide them | Only in a separate Navigator tab |
| S12 | Does drawing a containment line nest the content automatically on the diagram? | Yes (with "Show as line" in the toast) | Always a line until the user nests it |
| S13 | Can diagrams be contained by objects (e.g. a platform's diagrams under it in the explorer)? | No: diagrams stay in folders; drill-down links connect them to objects | Yes, as structure only |
| S14 | Which "component viewer" is meant by "show the elements hierarchically"? | The diagram editor (nest on connect, §8 there) and a new **Structure** tab on the object page | A dedicated viewer pane |
| S15 | Explorer groups (decision B22 in the explorer slice): which kind is `groups`? | **Aggregation**: members stay where they are and may be in several groups | Containment (members would move into the group's folder) |
| S16 | Relationship types without a kind | Treated as `association` | Refused when the metamodel is published |

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
| B13 | How does a sender learn its change was confirmed on the live connection? | Through the same `committed` message every viewer gets (it carries the change id, seq and versions). Only rejections go to the sender alone. So there is one ordered stream to apply, for everyone |
| B14 | How does a browser authenticate a WebSocket, which cannot carry headers? | `POST /live/tickets` returns a signed ticket valid for 60 s, passed as `?ticket=`. Instances share `CONNECTOME_SECRET` (required in production) |
| B15 | The `interest` message (item-level subscriptions) | Accepted and ignored for now: every viewer of a repository gets all its changes for its scenario. Narrowing matters only for very large repositories |
| B16 | How does the browser get the state it runs the change engine on? | `GET …/snapshot?scenario=` returns the whole scenario as engine rows (tombstones, versions and field versions included) with the metamodel and the sequence it reflects; the live connection then opens with `?since=` that sequence. Whole-repository loading is an M0 simplification: the design limit (1M objects) cannot be loaded whole, so lazy loading through `interest` (B15) comes with the performance pass (M2) |
| B17 | How does the browser apply a baseline change while it shows a scenario? | It doesn't: which rows a scenario overrides is resolved on the server, so a change from an ancestor scenario (or one whose versions come out differently in the browser) makes the browser reload a snapshot. Before reloading, it resends its pending changes over HTTP (idempotent), so a change the snapshot already holds is never applied twice. Changes in the browser's own scenario are replayed with the same engine, actor and commit time as on the server and give identical rows |
| B18 | Every edit gets a toast with **Undo**, but undo is built from the stored inverse on the server: what if the user clicks it before the change is committed? | Undo is offered once the server has confirmed the change; until then the button is disabled. Undoing a pending change locally (before it is sent) waits for redo/undo stacks in M2 |
| B19 | A type's `defaultFolder` is a folder path. What if no folder has that path? | The new object goes into the diagram's folder. Folders are never created implicitly |
| B20 | What does the diagram editor's palette offer? | The object types the diagram type admits (a listed type admits its subtypes), abstract ones left out, in the package's order |
