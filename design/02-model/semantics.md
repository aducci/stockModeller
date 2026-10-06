# Semantics: what the engine understands

How Connectome implements the [connection framework](../01-product/connection_framework.md). The framework's principle:

> **The metamodel defines what users can model; semantic base types define what the modelling engine understands about what has been modelled.**

Status: **accepted** (see [ADR-010](../06-decisions/ADR-010-semantic-base-types.md)); the product owner accepted the defaults of questions S1–S16 in the [decision log](../decision-log.md#semantics-decisions). Built so far: slices **Sem-1** and **Sem-2** (§11): kinds, categories, levels, the [core package](../05-structures/core-metamodel.json), Essentials 1.1.0, containment behaviour, `changeRelationshipType`, `deleteObject.contents` and `cascadeDelete` are in [05-structures](../05-structures/) and `packages/`. The other additions (payloads, messages, `setPayload`) reach `model.ts` and `changes.ts` with the slices that build them; until then this document is their reference.

## 1. The idea in one table

| Layer | Owned by | Examples | The engine uses it for |
|---|---|---|---|
| **Terminology** | The repository's metamodel (users, packages) | *Calls*, *Publishes*, *Implements*, *Payment Service* | Names, verbs, symbols, rules, properties |
| **Semantics** | Connectome itself (a fixed, small vocabulary) | *interaction*, *flow*, *realisation*, *service* | Explorer structure, nesting, moves, deletes, tracing, impact, validation |

Every relationship type maps to one **semantic kind**. Every object type may map to one **semantic category** and a default **semantic level**. Custom types keep their own words; behaviour comes from the mapping.

```text
Relationship type "Calls"       → kind: interaction
Relationship type "Publishes"   → kind: flow
Relationship type "Implements"  → kind: realisation
Object type "Payment Service"   → category: service, level: conceptual
```

## 2. Semantic kinds (relationship types)

Fourteen kinds: the framework's thirteen relationships plus *interaction* (§6). Each kind fixes what the **source** and **target** of a relationship mean. The engine always works in these canonical roles (see `semanticDirection`, §2.2).

| Kind | Source | Target | Reads as | Hierarchy | Shown nested on diagrams | Parents per object | Payload |
|---|---|---|---|---|---|---|---|
| `containment` | container | content | A contains B | ✅ structural (§3) | always allowed | **one**, across all containment types | — |
| `composition` | whole | part | B is an intrinsic part of A | ✅ | allowed (set per type) | one, when the type is `singleParent` | — |
| `aggregation` | whole | part | B belongs to A | ✅ | allowed (set per type) | many | — |
| `association` | — | — | A is related to B | | | | — |
| `realisation` | concrete | abstract | B is realised by A | trace | | | — |
| `representation` | representation | information | A represents B | trace | | | — |
| `serving` | provider | consumer | A serves B | | | | — |
| `access` | accessor | information | A reads/writes B | | | | — |
| `flow` | from | to | something moves from A to B | | | | optional |
| `trigger` | cause | effect | A triggers B | | | | optional |
| `assignment` | performer | performed | A is assigned to B | | | | — |
| `influence` | influencer | influenced | A influences B | | | | — |
| `specialisation` | specific | general | A is a kind of B | ✅ (acyclic) | | many | — |
| `interaction` | initiator | responder | A exchanges with B | | | | through its messages |

**Engine rules per kind** (they extend essential rule 5, [overview §3](overview.md#3-the-essential-rules-enforced-by-the-server)):

| Kind | Enforced (block) | Checked (findings, configurable, §8) |
|---|---|---|
| `containment` | One container per object across **all** containment types; no cycles across all containment types together; the content lives in its container's folder (§3) | — |
| `composition` | No cycles per type; one whole per part when the type is `singleParent` (default) | — |
| `aggregation`, `specialisation` | No cycles per type | — |
| `access` | `access.mode` is one of read, write, readWrite | Target is not an information object |
| `representation` | — | Either end is not an information object; representation is less concrete than what it represents |
| `realisation` | — | The realiser is less concrete than what it realises |
| `flow`, `trigger` | Payload items exist and are objects (§5) | A payload is expected (type setting) but missing; a payload is not an information object |
| `interaction` | Messages connect the interaction's own two objects (§6) | No request message |

### 2.1 Unclassified types

A relationship type without a kind behaves as `association`. Existing repositories therefore keep working; the metamodel editor lists unclassified types so model owners can classify them.

### 2.2 Relationship type fields (additions to [metamodel §2](metamodel.md#2-relationship-types))

| Field | Values | Notes |
|---|---|---|
| `semantic` | one of the 14 kinds | Optional; default `association` |
| `semanticDirection` | `forward` (default) or `reverse` | `reverse` lets a type read the other way round. *Realised by* (concept → concrete) is `realisation` with `reverse`: the engine swaps source and target when it applies the kind's meaning. Rules, diagrams and the API keep the type's own direction |
| `nesting` | boolean | Unchanged meaning (can be shown by placement). Always `true` for `containment` (filled in when omitted); otherwise default `false`, and only `containment`, `composition` and `aggregation` (or a type without a kind) may set it. Defaults never depend on other kinds, so a package stored and loaded again compiles to the same thing |
| `singleParent` | boolean | Always `true` for `containment` (enforced across all containment types, not per type); otherwise default `false`. Essentials sets it on its composition type (S5) |
| `payload` | `none`, `optional`, `expected` | `flow` and `trigger` default to `optional`; every other kind to `none`. `expected` adds the "flow without payload" finding |
| `cascadeDelete` | boolean | `composition` only: deleting the whole deletes its parts (§7). Default `false` |

Metamodel loading refuses inconsistent combinations (e.g. `nesting: true` on a `flow` type), as it already refuses `singleParent` without `nesting`.

## 3. Containment is the repository's structure

The framework separates **containment** (where something sits in the model) from **composition** (what something is made of). Connectome already separates **folders** (organisation and permissions, [ADR-005](../06-decisions/ADR-005-folders-and-nesting-relationships.md)) from **nesting relationships** (hierarchies). Containment joins the two:

```text
📁 Platforms                    ← folder: organisation and permissions
  ▭ Payments Platform           ← root object, stored in the folder
    ▭ Payment API               ← contained (containment relationship), same folder
    ▭ Payment Service
      ▭ Fraud Check             ← contained by Payment Service
    ▭ Payment Database
```

| Rule | Effect |
|---|---|
| **One container** | An object has at most one container, whatever containment type links them. So the structure is a tree and the explorer can show it |
| **Folder follows container** | A contained object always lives in its container's folder (default for open question S1). Creating or re-parenting a containment moves the object and everything it contains into the new container's folder, in the same change. Folder permissions therefore cover a whole subtree |
| **Moving** | Moving a root object to another folder moves its whole subtree. A contained object cannot be moved to another folder on its own: the engine refuses `moveToFolder` with a different folder; the UI takes it out of its container first (deletes the containment relationship) in the same change |
| **Re-parenting** | Changing an object's container reconnects the **same** relationship (`reconnectRelationship` on its source), so its id, properties and history survive |
| **Detaching** | Deleting the containment relationship leaves the object at the top of its current folder |
| **Ordering** | Contents are ordered among their siblings by the object's `rank` (the same field folders use, from the explorer slice) |
| **Deleting** | See §7 |
| **Cycles** | Refused across all containment types together. Decision B1 (cycles per type) stays for the other hierarchy kinds |

Composition and aggregation **do not** place anything in the explorer's structure: a part composed into a whole stays where it is stored. They appear in the explorer's semantic groups (§9.1), in the Hierarchies tab and nested on diagrams.

The Essentials `contains` type becomes `containment`. Every Essentials nesting rule (capability in capability, process step in process, server in location…) is therefore structural: a server placed in a location lives in that location's folder.

## 4. Semantic categories and levels (object types and objects)

### 4.1 Categories

A category says what kind of thing an object type is, so the engine can check kinds that care (an access target is information) and offer the right navigation. Proposed set (open question S3), kept small on purpose:

| Category | For | Essentials types |
|---|---|---|
| `actor` | People, roles, organisation units | Organisation unit |
| `capability` | Abilities of the organisation | Capability |
| `behaviour` | Processes, functions, steps, events | Process, Process step |
| `service` | Behaviour offered to others, at any level | Service *(new, §10)* |
| `interface` | Access points: APIs, endpoints, operations, UIs | Interface *(new, §10)* |
| `component` | Systems doing the work: applications, components | Application (any) |
| `information` | Information, data, messages, representations | Data object |
| `technology` | Nodes, servers, devices, platforms | Server |
| `location` | Places | Location |
| `motivation` | Goals, requirements, risks, decisions | — |
| `other` | Default | — |

`category` is a field on the object type and is inherited through `extends`.

### 4.2 Levels

| Level | Meaning | Example |
|---|---|---|
| `conceptual` | What, in business terms | Payment Service, Payment Information |
| `logical` | How, independent of technology | Payment API, Payment Logical Model |
| `physical` | Concrete technical form | `GET /orders/{id}`, Payment JSON |
| `implementation` | Deployed, running thing | Orders Service, Payment DB Record |

- The level is a property of the object: the system property type `semantic.level` (a list property, §4.3). Names do not need to be unique across levels: *Payment* can exist at every level.
- An object type sets a default with `level`, and can fix it with `levelFixed: true` (the property then cannot be changed on its objects). Default for open question S2: types give a default, objects may override.
- Levels order the trace view (§9.3) and feed the level checks (§8). They are metadata, not layers: nothing is refused because of a level.

### 4.3 The core package

Semantic behaviour needs a few standard properties. They come from a **core package** that every repository has, cannot uninstall, and that other packages may not redefine:

| Property type | Data type | On | Values |
|---|---|---|---|
| `semantic.level` | list | objects | conceptual, logical, physical, implementation |
| `access.mode` | list | `access` relationships | read, write, readWrite |
| `influence.effect` | list | `influence` relationships | positive, negative, neutral |
| `interaction.pattern` | list | `interaction` relationships | synchronous, asynchronous, fireAndForget |
| `interaction.protocol` | text | `interaction` relationships | REST, gRPC, SOAP, AMQP… |
| `interaction.operation` | text | `interaction` relationships | `GET /orders/{id}` |

The engine assigns them to the types of the matching kind (and `semantic.level` to every object type), so packages do not have to list them. They are ordinary properties: catalogues, queries, colour rules and the properties panel use them unchanged.

## 5. Relationships carry meaning: payloads

The framework treats a relationship as a first-class object with *type, semantic base type, source, target, direction, properties and payload*. Connectome relationships already have the first six. The payload is new:

| Field | Type | Notes |
|---|---|---|
| `payload` | ordered list of object ids | What the relationship carries: *Payment Information*, *Order*. Allowed when the type's `payload` is not `none` |

```text
Payment Service A ──flow──► Payment Service B
                   payload: [Payment Information]
                   flow.protocol: REST
```

Why a field and not an object-reference property:
- the engine keeps it consistent: deleting an object removes it from every payload (with an exact inverse), so payloads never dangle (unlike B6);
- it is indexed both ways, so "which flows carry this information?" is one lookup;
- tracing (§9.3) follows it like a path step.

A payload is any object; a non-information payload gives a finding, not a refusal (*the payload is not required to be a physical file or message*).

**Many relationships between the same two objects** are normal and are never merged: three flows from A to B with three payloads are three relationships, and two flows in opposite directions are two relationships. Rules already allow this (only a cardinality rule limits it). §9.2 describes how diagrams draw them.

## 6. Interactions and their messages

An **interaction** is the communication exchange; its **messages** are the flows inside it.

```text
Order Consumer ══interaction══► Order API          interaction.pattern: synchronous
   │                                               interaction.protocol: REST
   ├─ request  ──► GET /orders/{id}  payload: [Order Query]
   └─ response ◄── 200               payload: [Order]
```

| Concept | Stored as |
|---|---|
| Interaction | A relationship of a kind-`interaction` type, from initiator to responder |
| Message | A relationship of a kind-`flow` type with `parentId` = the interaction. Its direction gives its role: **request** when it goes the interaction's way, **response** when it goes back. Its `rank` orders the messages |

| Rule | Effect |
|---|---|
| Endpoints | A message must connect the interaction's two objects, in either direction (block) |
| Lifecycle | Deleting an interaction deletes its messages; reconnecting an interaction reconnects its messages (both cascades have exact inverses) |
| Parents | Only interactions have messages, and messages cannot have messages |
| Reading | Messages are full relationships: properties, payloads, history, catalogues |
| Tracing | Messages are flows, so upstream/downstream and payload tracing need no special case: the request flows initiator → responder, the response flows back |

The interaction's own properties say *how* (`interaction.pattern`, `.protocol`, `.operation`); the messages say *what* (their payloads). This is how the framework avoids types such as *REST GET Flow* (§12 of the framework): one interaction type, properties and payloads.

An asynchronous exchange is the same structure with `interaction.pattern = asynchronous`, and may have any number of messages (e.g. a request, an acknowledgement and a callback).

## 7. Deleting with semantics

| Deleting | Effect |
|---|---|
| A **container** | The dialog offers **Keep its contents** (default for S4: they move up to the container's own container, or to the top of its folder) or **Delete its contents too**. New `deleteObject` option `contents: "moveUp" \| "deleteContents"`; omitted means `moveUp` |
| A **whole** whose composition type has `cascadeDelete` | Its parts are deleted too, and listed in the dialog first |
| An object used as a **payload** | It is removed from those payloads; the dialog counts them ("carried by 3 flows") |
| An **interaction** | Its messages are deleted with it |
| Anything | Still undoable as one change: every cascade records its inverse, as deleting relationships and occurrences already does |

## 8. Validation from semantics

Semantic checks are ordinary **validation rules** shipped in the core package, so each can be switched off or have its severity changed per repository (*validation should be configurable rather than making every semantic rule a hard constraint*). They need the validation engine (M3); until then only the block rules in §2 run.

| Rule (core package) | Finds | Default severity |
|---|---|---|
| `semantic.realisationLevel` | A realiser more abstract than what it realises | warning |
| `semantic.representationLevel` | A representation more abstract than what it represents | warning |
| `semantic.accessTarget` | Access to something that is not information | info |
| `semantic.payloadExpected` | A flow without payload where its type expects one | warning |
| `semantic.payloadCategory` | A payload that is not information | info |
| `semantic.orphanedConcept` | A conceptual object nothing realises or represents | info |
| `semantic.missingImplementation` | A logical service or interface with no physical or implementation realisation | info |
| `semantic.interactionRequest` | An interaction without a request message | info |

## 9. Tool intelligence

All of this is pure graph logic over the engine's rows, so it lives in one pure package (`packages/semantics`, §11) used by the browser (explorer, panels, diagrams), the server (trace and impact endpoints) and the rules.

### 9.1 Navigation verbs

Every kind gives two navigation verbs, one per direction, using the types' own verbs for labels:

| Kind | Outgoing (from the source) | Incoming (from the target) |
|---|---|---|
| containment | Contents | Container |
| composition | Parts | Part of |
| aggregation | Members | Member of |
| realisation | What this implements | Implementations |
| representation | What this represents | Representations |
| serving | Consumers | Providers |
| access | Information used | Used by |
| flow | Downstream | Upstream |
| interaction | Interacts with | Interacted with by |
| trigger | Triggers | Triggered by |
| assignment | Performs | Performed by |
| influence | Influences | Influenced by |
| specialisation | Generalisations | Specialisations |

They appear in the properties panel (relationships grouped by kind, then by type), in the explorer ([workbench](../04-ux/workbench.md#explorer-a-semantic-navigator)) and in a **Trace ▸** context menu on every object, symbol and row.

### 9.2 Diagrams

See [diagram editor §8](../04-ux/diagram-editor.md#8-semantic-gestures). In short: drawing a containment line nests the content inside its container; dropping a symbol inside another offers the nesting types the rules allow, containment first; dragging a nested symbol into another container re-parents the same relationship; parallel relationships between two symbols are drawn side by side; an interaction is one line that expands into its messages.

### 9.3 Tracing and impact

| Trace | Follows | Example question |
|---|---|---|
| **Down the levels** | realisation and representation, toward the more concrete | *What physical interfaces implement this logical service?* |
| **Up the levels** | the same, toward the more abstract | *What does this API implement?* |
| **Downstream / upstream** | flow and interaction messages, directed; optionally across containment (a container's flows include its contents') | *What flows into this application?* |
| **Payload** | flows whose payload is X, or a representation or realisation of X | *What systems consume this information?* · *What flows are affected if this information changes?* |
| **Dependency** | serving, access, and flow/interaction toward providers | *What does this depend on?* · *What uses this service?* |

The trace view lays results out in columns by level (conceptual → logical → physical → implementation), and the same chains reverse. Impact analysis ([rules and calculations §5](rules-and-calculations.md#5-impact-analysis)) gets these traces as presets.

### 9.4 Queries

The [query language](../03-platform/queries.md#5-semantic-paths) gains paths by kind (`-@flow->`, `<-@realisation-`), relationship filters in paths (`-@access[access.mode = write]->`, `<-@flow[payload: id:01J…]-`) and the filters `category:` and `level:`. Paths by kind work for any custom type mapped to that kind, so rules and catalogues written against kinds keep working when a repository renames its types.

## 10. Essentials 1.1.0

The kinds Essentials would map, and the types it would add so the framework's examples can be modelled (open question S10):

| Essentials type | Kind | Note |
|---|---|---|
| `contains` | containment | Unchanged rules, now structural (§3) |
| `realizes` | realisation | |
| `serves` | serving | |
| `flowsTo` | flow | `payload: optional`; also used as the message type of `calls` |
| `accesses` | access | |
| `hostedOn` | assignment, `reverse` | The server performs the hosting |
| `owns` | assignment | |
| `supports` (derived) | association | |
| *new* `composedOf` | composition | Application in application, process step in process |
| *new* `represents` | representation | Data object → data object |
| *new* `calls` | interaction | Application or interface → interface |
| *new* `triggers` | trigger | Process → process, step → step |
| *new* `specialises` | specialisation | `*` → same type |
| *new* object type `service` | category service | Default level conceptual |
| *new* object type `interface` | category interface | Default level logical |

Exchange mappings can fall back on kinds: an ArchiMate *Composition*, *Aggregation*, *Triggering*, *Influence* or *Specialization* with no type mapping is imported with the package's type of that kind (the first in package order). ArchiMate has no containment relationship; its nested elements in views import as containment only when a nesting rule allows the pair, otherwise as composition.

## 11. What changes in the build

| Area | Change |
|---|---|
| `05-structures` / `packages/model` | `SemanticKind`, `SemanticCategory`, `SemanticLevel`; relationship-type fields (§2.2); object-type `category`, `level`, `levelFixed`; relationship `payload`, `parentId`, `rank`; the edits below |
| Edits ([changes.ts](../05-structures/changes.ts)) | New `changeRelationshipType { id, baseVersion, type, propertyMap?, set? }` (`set` restores values the change dropped, so its inverse is exact) (like `changeObjectType`; the explorer and diagrams change a connector's type with it). New `setPayload { id, baseVersion, payload }`. `createRelationship` gains `payload?`, `parentId?`, `rank?`. `deleteObject` gains `contents?`. `moveToFolder` gains `rank?` (from the explorer slice) and is refused for a contained object moving folders |
| `packages/engine` | Kind-aware rule 5 (§2, §3); folder-follows-container cascades; interaction cascades; payload clean-up on delete; containment-aware delete; core package always installed. Every cascade records exact inverses (the inverse property test covers the new edits) |
| `packages/semantics` *(new, pure)* | Kind lookup with direction normalised, navigation verbs, containment tree, traces. Depends on `model` only |
| `packages/db` | Migration: `relationship_type.semantic`; `relationship.payload text[]` with a GIN index, `relationship.parent_id` with an index, `relationship.rank`; object-type `category`/`level` in `definition` |
| `apps/server` | Relationship fields in reads and the snapshot; `GET …/objects/{id}/trace?kind=…&direction=…&depth=` ; everything added to `openapi.yaml` |
| `apps/web` | Explorer structure and semantic groups; drag-and-drop containment; properties panel grouped by kind, payload picker, messages; diagram gestures in §9.2 |

Slices, after the explorer slice and before or alongside M1's metamodel stream:

| Slice | Scope | Done when |
|---|---|---|
| **Sem-1 Semantic metamodel** | Kinds, categories, levels, the core package, Essentials 1.1.0, metamodel checks; properties panel groups relationships by kind | Essentials loads with every type classified; the panel shows *Implementations*, *Consumers*… for Claims Manager |
| **Sem-2 Containment** | One container, folder follows container, re-parenting, containment-aware delete, `changeRelationshipType`; explorer shows contents and accepts drops onto objects; drawing a containment line nests on diagrams | Playwright: drag an object onto another in the explorer, it shows inside it in both browsers and on a diagram; delete the container keeping its contents; undo each |
| **Sem-3 Flows and interactions** | Payloads, interactions and messages, parallel lines, the payload picker | An interaction with a request and a response is created on a diagram, both messages carry payloads, and deleting the interaction is undone in one step |
| **Sem-4 Navigation and trace** | `packages/semantics` traces, explorer semantic groups, Trace ▸, trace endpoint, query paths by kind (with M1's parser) | The framework's examples (§6 and §14 there) answer correctly in a test fixture |
