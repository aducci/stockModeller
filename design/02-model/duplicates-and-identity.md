# Duplicates, similarity and merge

Our stance on duplicate objects and relationships: how the tool prevents them, finds similar elements, lets people investigate and merge them, and how uniqueness varies by type. Section 1 is the position; the rest is what it means for the model, the UI and the build. Slice D-1 (§10) is built; the rest is proposed.

## 1. The position, in seven lines

1. **Identity is the id, never the name.** An object is the same thing because it has the same ULID, not because the label matches. The connection framework already says names must not determine meaning (*Payment* can exist at every level).
2. **Uniqueness is a per-type policy, not a global rule.** Some types are naturally unique (Capability, Application), some are not (Process step, Note, Requirement). The type says how strict it is and over what scope.
3. **Prevention beats cleanup.** The cheapest duplicate is the one never created. Every place a user names a new thing becomes *find or create*: matches are shown first, reuse is one key away, *create new* is a deliberate choice.
4. **A suspected duplicate is a finding, not an error.** Only a type's explicit hard rule refuses a save. Everything else is a ranked, explained suggestion that a person confirms or dismisses, and a dismissal is remembered.
5. **Merge is one undoable change, and the loser leaves a forwarding address.** Relationships, occurrences, payloads and properties move to the survivor; the old id redirects to it, so links, history and external systems keep working.
6. **"Similar" has three outcomes, not two.** *Same thing* (merge), *different things* (dismiss), or *related things* (the same concept at another level or a variant: link them with `represents`, `realises` or `specialises`). This is what makes it fit our semantic model rather than a CRM dedupe screen.
7. **Never auto-merge.** Imports and automations may auto-*match* on key or external id (that is identity, not similarity). Fuzzy matches always go to a person.

## 2. What existed before slice D-1

| Area | Today | Where |
|---|---|---|
| Name uniqueness | `uniqueName: repository \| folder \| none` per object type, inherited, case-insensitive, exact type only (decision B8). Essentials sets it on 3 types (`capability`, `application`, `saasApplication`) | `packages/engine/src/apply.ts` `checkUniqueName`; `metamodel.ts:247` |
| Key | Unique per object type, auto-numbered from `keyPattern`, tombstones count so keys are never reused | `apply.ts` `checkUniqueKey`, `nextKey` |
| External ids | Stored as a map, not checked for uniqueness (D-1 now checks them) | `model.ts` |
| Name matching | Trim + lower-case only. No normalisation of punctuation, accents or spacing | `apply.ts:112` `sameName` |
| Create on a canvas | Type a name, a new object is always created (D-1: find or create) | `DiagramEditor.tsx` |
| Create in the explorer | Same: always new (D-1: find or create) | `Explorer.tsx` `CreateForm` |
| Connect on a canvas | Already good: the connect menu offers existing relationships between the two objects (`existingId`) before new ones, and hides ones already drawn | `DiagramEditor.tsx` `openConnectMenu`, `connectChoices` |
| Many relationships between two objects | Allowed by design (three flows with three payloads are three relationships); only a rule's `cardinality` limits it | `semantics.md §5` |
| Patterns | `bind: pick \| pickOrNew` already designed so patterns don't create duplicates | `notation-and-metamodel-admin.md §9.3` |
| Search | Designed: Ctrl+K over name, key, description, external id, tag, fuzzy on names. `pg_trgm` is already installed in migration 001. Built: only `type:`, `folder:`, `category:`, `level:` queries | `queries.md §1`, `apps/server/src/queries.ts` |
| Merge | Nothing. No merge edit, no redirects, no duplicate report | |
| Re-import | Designed to update by hidden id / key / external id instead of duplicating | `import-export.md`, `automation.md` |

So the foundations are right (stable ids, keys, external ids, per-type scope, reuse in the connect menu). The gaps are at the point of entry, in detection, and in merge.

## 3. How the leading and novel tools do it

| Tool | Uniqueness | Finding duplicates | Merge | What we take |
|---|---|---|---|---|
| **ARIS** (Software AG) | Object *definitions* vs *occurrences*, as we have. Names not enforced unique | Search "objects with duplicate names" (same type + name) | **Consolidate objects**: pick a master, all occurrences of the others repoint to it, others optionally deleted. No undo | Our model is the same shape, so consolidation is the right merge semantics. Do better: undoable, with a redirect |
| **Ardoq** | Not enforced by default | Manual: select in navigator or graph | **Merge components** (same type only): a wizard picks which field values and style to keep; tags and references are unioned. Works in mainline and in scenarios | Per-field survivor choice; merging inside a scenario |
| **SAP LeanIX** | Fact sheets keyed by type + name (+ release); external ids drive integrations, and two fact sheets with the same external id break a sync | Mostly via reports and integration errors | No native merge that I found; the documented practice is move relations by hand, then archive | Enforce external-id uniqueness; don't make merge a manual chore |
| **Sparx EA** | None. Duplicates are common after imports and copy-paste | Find in project, model search, scripts | No built-in merge; done by script | The cautionary tale: without entry-point reuse, repositories fill with copies |
| **Bizzdesign / Alfabet** | Configurable per class | Alfabet has a merge-duplicates tool for its reference catalogue | Merge with a chosen survivor | (Bizzdesign merge docs not found, so I've not relied on it) |
| **ServiceNow CMDB (IRE)** | **Identification rules per CI class**: a ranked list of identifier sets (e.g. serial number, then name + domain) | Ingest matches against the rules; ambiguity creates a **de-duplication task**, duplicates point `duplicate_of` → main CI | Duplicate CI Remediator: choose the main CI, reconcile attributes, relationships and related items; bulk templates; an AI assistant option | Per-type identity rules; duplicates as a work queue; `duplicate_of` ≈ our redirect |
| **Salesforce** | Configurable | **Matching rules** (fields + exact/fuzzy) separate from **duplicate rules** (alert or block, on create or edit) | Merge up to 3, one master, pick values per field | Separate *how to match* from *what to do about it*; alert by default, block only by choice |
| **Wikidata** (novel) | None; identity is the Q-id | Community tools, constraint reports | Merge turns the loser into a **redirect**; links keep resolving | Redirects so nothing that referred to the old id breaks |
| **Senzing, Splink, Zingg** (entity resolution, novel) | n/a | Probabilistic or principle-based scoring on many attributes, with **blocking** to avoid comparing everything, and an **explanation** of why two records match; Senzing also keeps "possibly related" as a separate outcome | Usually resolve into an entity without destroying the records | Explainable scores; "related" as a third outcome; remember decisions |
| **Embeddings / LLM matching** (novel) | n/a | Semantic similarity catches "CRM" vs "Customer Relationship Mgmt" and "Claims Handler" vs "Claims Manager" that trigram misses; an LLM can draft a merge rationale | Assistive only | A later, optional signal; never a decider |

What none of the EA tools do well, and where we can lead: **prevention at the moment of naming**, **structural similarity** (two objects with the same neighbours are probably the same thing, whatever they're called), and the **related-not-same** outcome that our levels and semantic kinds make meaningful.

## 4. Uniqueness per element type

Extend the object type's `uniqueName` into an **identity policy**. Existing values keep working.

| Field | Values | Default | Notes |
|---|---|---|---|
| `uniqueName` | `none`, `folder`, `container`, `repository` | `none` | **New: `container`**: unique among objects with the same container (process steps within a process, attributes within a class). Fits Sem-2, where containment is the structure |
| `uniqueAcross` | `type`, `family` | `type` | `family` = this type, its parents, its subtypes and its siblings under the same parent. *Salesforce* the `application` and *Salesforce* the `saasApplication` clash. Revisits B8, which stays the default |
| `uniquePerLevel` | boolean | `true` | Names only clash within one semantic level, so *Payment* (conceptual) and *Payment* (logical) are not duplicates (`semantics.md §4`) |
| `onClash` | `block`, `warn` | `block` | `warn` saves and raises a finding. `block` is today's behaviour |
| `matchOn` *(proposed, D-3)* | property keys | `[]` | Extra identifying properties for detection and import matching, e.g. `server: [hostname]`, `application: [vendor, product]`. Like ServiceNow's identification rules, ranked |

Every field is inherited through `extends`. `container` scope only applies inside a container: two top-level objects may share a name. The engine checks the policy on create, rename, a change of type or level, a move to another folder, and when a containment gives the object a new container; a clash is refused (`invalid` on `name`) or, with `warn`, saved with a finding that the workbench shows in the change's toast. Admins set all four in the Metamodel tab: select a type, then *Duplicates* in its panel. The publish review lists the types whose setting changes and how many objects already repeat a name under the new one; publishing never changes them.

**Essentials 1.5.0** (slice D-2) sets: Application and SaaS application `repository` and `family` (on *Application (any)*, so both inherit it); Capability `folder` (as before); Process step `container`; Data object `repository` with `warn`. Every other type keeps `none`. The table below is where the defaults should go over time:

| Kind of type | Policy | Why |
|---|---|---|
| Reference things: Capability, Application, Organisation unit, Data object, Technology, Location | `repository`, `family`, per level, `block` | One thing, many views. A second copy is almost always a mistake |
| Structural parts: Process step, Attribute, Operation, Message | `container` | *Validate* can exist in every process; twice in one process is a mistake |
| Narrative items: Requirement, Risk, Note, Decision, Principle | `none`, detection only | Similar wording is normal; flag, never refuse |
| Groups | `folder` | |

**Keys and external ids.** Key stays unique per type. Add: an external id is unique per `(system, value)` across the repository, `block`. Two objects claiming the same ServiceNow id is the LeanIX sync bug.

**Relationships** get the matching policy on the relationship type:

| Field | Values | Default |
|---|---|---|
| `distinct` | `pair`, `pairAndPayload`, `none` | By semantic kind (below) |

- `pair`: at most one relationship of this type between the same source and target. Default for every kind except the three below: a second *contains* between the same two objects says nothing new.
- `pairAndPayload`: duplicates only when type, ends, payload (in order) and parent interaction all match. Default for **flow, trigger, interaction**: three flows with three payloads stay three relationships (`semantics.md §5` holds).
- `none`: anything goes.

A repeat is always saved, with a finding (rule `<type>:distinct`), checked on create, reconnect, change of type and a new payload; and the canvas never creates one silently: the connect menu already offers *Show existing* instead.

## 5. Search and add: find or create

This is the biggest lever and the first thing to build.

**One component everywhere a name is typed for a new object**: the canvas name box, the explorer *New object*, a pattern's `pickOrNew`, the properties panel's *Add related*, the payload picker.

```
 Name of the new Application
 ┌───────────────────────────────────────────┐
 │ claims man                                │
 ├───────────────────────────────────────────┤
 │ ▣ Claims Manager       Applications/Ins.  │  ← same type: Enter adds an occurrence
 │ ▣ Claims Mgmt Portal   Applications/Ins.  │
 │ ◇ Claims Manager       SaaS application   │  ← family, marked
 │ ○ Claims management    Capability · other │  ← other type, dimmed; "link instead?"
 │ ＋ Create "claims man" as new Application │
 └───────────────────────────────────────────┘
```

- Matches update as you type, from the in-memory model, ranked by the score in §6: an exact match first, then by score, with related types ranked a little lower and unrelated ones lower still (they only show when their name is close: a hint to link instead). Each row shows the folder path, and the type when it differs; hovering gives the reason it matched.
- **Enter takes the highlighted option.** An exact match (same type, same normalised name) is highlighted by default, so retyping an existing name reuses it; otherwise *Create* is highlighted. The arrow keys move between options and Escape cancels.
- On a type with `uniqueName`, *Create* is disabled for a name the engine would refuse and says where the existing one is (the same test as the engine: exact type, case-insensitive, in the type's scope).
- On a canvas, reusing adds an occurrence of the existing object (a repeat is flashed, as for a drop from the explorer), and leaving the box takes the highlighted option, as before. In the explorer, reusing selects the existing object and says so; leaving the box keeps the form open.

**Search (Ctrl+K)** shares the same matcher, so what search finds and what the add box warns about never disagree.

## 6. Detecting similar elements

A pure matcher module (no I/O, so it can live beside the engine and run in the browser and the server alike).

**Normalise** a name: Unicode NFKC, case-fold, strip accents and punctuation, collapse spaces, drop a configurable list of noise words per type (`ltd`, `inc`, `system`, `application`, `app`, `the`).

**Blocking** (what gets compared at all): the same type family and the same level; plus anything sharing a key, external id or `matchOn` value. Keeps it fast at 100k objects.

**Signals**, each giving a score and a sentence for the explanation:

| Signal | Example | Weight |
|---|---|---|
| Same key or external id | both have `servicenow: a1b2` | Decisive (this is identity) |
| Normalised names equal | *Claims-Manager* / *claims manager* | Very high |
| Trigram / token-sort similarity | *Claims Manager* / *Manager, Claims* | High |
| Acronym or alias | *CRM* / *Customer Relationship Management*; an `aliases` list on the object | High |
| Same `matchOn` values | same vendor and product | High |
| **Shared neighbours** (Jaccard over related objects by kind) | both *serve Handle Claim*, both *access Claim* | Medium; finds duplicates with different names |
| Same container or folder | | Low |
| Semantic embedding (later, optional) | *Claims Handler* / *Claims Manager* | Medium |

**Where it runs:**
- **At entry**: names only, in the add box (§5).
- **As a repository finding**: a *Possible duplicates* check alongside the other rule problems, severity `info`, refreshed in the background on the server (where `pg_trgm` can do the name pass). Each finding shows the pair, the score and the reasons.
- **At import**: the preview lists *probable matches* per row: *update existing*, *create new*, or *link*.

**Remembered verdicts.** *Not duplicates* on a pair is stored and never raised again unless one of them is renamed. Without this, every report becomes noise after the first week (the ServiceNow and Salesforce lesson).

## 7. Investigate: the compare view

Opened from a finding, from multi-select *Compare*, or from the add box's "already exists".

- **Side by side**: name, key, type, level, folder, container, every property (differences highlighted), tags, external ids, description.
- **Relationships**: the union, grouped by kind, each row marked *both*, *only A*, *only B*. Overlap is the strongest evidence.
- **Where used**: diagrams and catalogues each appears on, open change requests and scenarios that touch it, last edited by whom.
- **A small graph** of both and their neighbours.
- **Three actions**: **Merge…**, **Not duplicates**, **Link as related…** (offers the relationship types the rules allow between them, e.g. *Payment (logical) represents Payment (conceptual)*).

## 8. Merge

**Shape.** Merge picks a **survivor** (default: the older, more connected one, with the most diagram occurrences) and one or more **merged** objects of the same type family. A wizard, as in Ardoq and ServiceNow, picks per field which value survives: name, description, each conflicting property, folder, container. Tags, aliases, external ids (different systems) and relationships are unioned.

**What moves to the survivor, in one change:**
1. Relationships: each is reconnected (`reconnectRelationship` already exists). Where that produces two relationships equal under the type's `distinct` (§4), they are themselves merged: keep one, union properties, repoint its occurrences.
2. Diagram occurrences: repointed to the survivor, keeping their position, style and line attachments. Two occurrences of the merged pair on the same diagram both stay (an object may occur twice); the user can tidy.
3. Payloads and interaction parents that mention the merged object.
4. Object-reference property values elsewhere that point at it.
5. The merged object's names and keys become **aliases** of the survivor, so search still finds *Claims Mgmt* and *APP-0117*.
6. The merged object is deleted (tombstoned, as today), and a **redirect** `mergedId → survivorId` is recorded. URLs, API reads, history links, imports and automations that use the old id resolve to the survivor (Wikidata, ServiceNow's `duplicate_of`).

**Engine.** Per CLAUDE.md every edit needs an exact inverse, so merge is built from small invertible edits, not one opaque edit:
- existing: `setProperties`, `renameObject`, `setTags`, `moveToFolder`, `reconnectRelationship`, `setPayload`, `deleteRelationship`, `deleteObject`;
- new: `retargetObjectOccurrence { diagramId, occurrenceId, objectId }` (inverse: retarget back), `setAliases`, `setExternalIds`, and `addRedirect { fromId, toId }` (inverse: `removeRedirect`).

A client-side `mergePlan(state, metamodel, survivorId, mergedIds, choices)` builds the edit list, like `addToDiagramPlan` does today, and the server re-validates it as one change. The inverse property test covers the new edits. One undo reverses the whole merge while nothing has built on it; after that, splitting is a manual job, which is fine.

**Rules.** The merged result must pass the rules: a `block` rule failure (e.g. two different containers under single-parent containment, or a cardinality breach) stops the wizard on that row with a choice, before anything is saved.

**Across types.** Merging an `application` into a `saasApplication` first changes the type (`changeObjectType` exists, with its property map). Merging across unrelated types is refused: that's the *link as related* case.

**Scenarios.** Merging inside a scenario is allowed (Ardoq allows it). It writes to the overlay like any change: the merged object is deleted in the scenario only, and the redirect is scoped to that scenario until the scenario is accepted. Because variants share ids with the master (the variants design note), a baseline edit to the merged object after the scenario's merge is a conflict at accept time, shown in the normal per-property review.

**Permissions.** Merge needs edit rights on every object involved and on the folders of everything that moves. Until roles exist (B27), anyone who can edit can merge, and the change log records it as one attributed change.

## 9. Imports, API and automation

- **Match order** on import and upsert: id or redirect → key → external id → `matchOn` properties → (preview only) fuzzy name. The first three are identity and may update automatically; the fuzzy tier is always a user choice in the preview, never automatic.
- API: `GET …/objects/{id}/similar` (scores and reasons), `POST …/objects/merge` (survivor, merged ids, choices; returns the change), redirects honoured on every `GET …/objects/{id}` with the survivor's id in the response. Both go into `openapi.yaml`.
- Automations get `findSimilar()` and `merge()` with the same semantics; a script may *propose* merges as findings but merging from a schedule needs an explicit option and is off by default.

## 10. Build slices

| Slice | What | Size |
|---|---|---|
| **D-1 Find or create** | ✅ Built: name normaliser and matcher (`packages/engine/src/similar.ts`); the find-or-create box on the canvas and in the explorer, exact-match reuse; external-id uniqueness in the engine. Still to do: the payload picker and document mentions | S–M |
| **D-2 Type policy** | ✅ Built: `container` scope, `uniqueAcross: family`, `uniquePerLevel`, `onClash`; relationship `distinct` with kind-based defaults; *Duplicates* in the metamodel type panel; findings shown in toasts; Essentials 1.5.0. Not yet: `matchOn` | M |
| **D-3 Possible duplicates** | Background finding with scores and reasons, shared-neighbour signal, *not duplicates* verdicts stored, `aliases` field | M |
| **D-4 Compare and merge** | Compare view; `mergePlan`; new edits (`retargetObjectOccurrence`, `setAliases`, `setExternalIds`, `addRedirect`); redirects table; inverse tests; API endpoints | L |
| **D-5 Import matching** | Match order and probable-match preview in import | M |
| Later | Embedding signal; LLM-drafted merge rationale; bulk merge templates | |

 D-4 is the only one that touches storage (redirects table, aliases column), which would go into `storage.md §7` when built.

## 11. Open questions

| # | Question | Recommendation |
|---|---|---|
| 1 | Should name clashes across a type family (`application` vs `saasApplication`) count? This revisits B8 | Yes for detection always; for blocking, opt-in per type (`uniqueAcross: family`), on for Applications in Essentials |
| 2 | Should a name be allowed to repeat across levels? | Yes (already implied by `semantics.md §4`); `uniquePerLevel` defaults on |
| 3 | Default for an exact clash on a "reference" type: refuse or warn? | Refuse (today's behaviour), with the add box offering the existing one, so refusing is never a dead end |
| 4 | Keep merged objects as redirects forever? | Yes. They are tiny and every old link keeps working |
| 5 | Auto-merge on import when key or external id matches? | That's an update, not a merge, so yes. Fuzzy matches: never automatic |
| 6 | Allow merge inside a scenario? | Yes, scoped to the scenario until accepted |

## Sources for the tool comparison

- ARIS consolidation: [ARIS Community, consolidate objects](https://ariscommunity.com/users/felix101/2019-10-09-consolidate-objects), [duplicate names search](https://ariscommunity.com/users/aminaniras/2024-02-21-duplication-names-object) (community posts, not official docs)
- Ardoq: [Merge components and references](https://help.ardoq.com/en/articles/43986-merge-components-and-references)
- LeanIX: [SAP KB on duplicate external ids](https://userapps.support.sap.com/sap/support/knowledge/en/3743966); no merge documentation found
- Alfabet: [Merge duplicate components](https://documentation.alfabet.com/en/TechMan_CapCom_ITPedia_Merge.html)
- ServiceNow: [Detecting duplicate CIs](https://www.servicenow.com/docs/r/8K~WUyyBmjUR0pLPxM8yeA/mHpV4r7JA3P3H4ZqscV_TQ), [Duplicate CIs remediation](https://www.servicenow.com/docs/r/Ir~NPf1dr8MGFXQE6QlBoQ/3l0Y6ZLPqsAJss1h7oCRug)
- Salesforce: [Salesforce Ben, duplicate rules](https://salesforceben.com/salesforce-duplicate-rules/)
- Sparx EA, Wikidata redirects, Senzing, Splink and Zingg: from my own knowledge, not checked today
