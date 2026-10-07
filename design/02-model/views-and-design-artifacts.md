# Views and design artifacts

How Connectome shows one model in many shapes: free diagrams (today), matrices, lists, specifications, hybrid sequence diagrams, and **design artifacts**: templated documents (an HLD, a solution design, an integration spec) whose sections are live views of the model. Builds on [diagrams and catalogues](diagrams-and-catalogues.md), the [semantic layer](semantics.md) and [notation](notation-and-metamodel-admin.md).

Status: **proposed** (2026-10-07). Open questions V1–V12 are in the [decision log](../decision-log.md#views-decisions). Mockups: [Views framework](https://claude.ai/artifact/35pBoCFz6S1bahi9ri7v4P).

## 1. The idea in one table

Every view answers three questions. A view kind is just a fixed answer to the second one.

| Question | Options | Stored |
|---|---|---|
| **Scope**: which objects and relationships are in it? | **Members** (placed by hand, as occurrences) or a **query** (a structured path from a context object, §3) | Occurrences, or the query in the view's `definition` |
| **Layout**: where does each thing go? | **Free** (x, y per occurrence), **ordered** (a sequence: lifelines left to right, steps top to bottom) or **derived** (rows, columns and headings computed from the scope) | Free: occurrence geometry. Ordered: lane order and step ranks. Derived: nothing but a few overrides |
| **Composition**: is it part of something larger? | Stand-alone, or a **section** of a design artifact bound to that artifact's subject | The artifact's `definition` |

Three principles carry the design:

1. **Views never own facts** (unchanged). A row in a list, a cell in a matrix, a message in a sequence and a line in a RACI table are relationships and objects of the model. Editing a view is an ordinary change with exact inverses, and the same fact edited in any other view changes here too.
2. **One table, one explorer.** Every view kind is a **diagram** whose diagram type has a `kind`. It lives in a folder, has a history, appears in *Occurs on*, can be a drill-down target and is scenario-aware, with no second storage path (V1).
3. **Templates are configuration.** A design-artifact template is a diagram type of kind `document` in a metamodel package, versioned like any other type (V2). An HLD template is to an HLD what *Application landscape* is to a landscape diagram.

## 2. View kinds

| Kind | Scope | Layout | Edits it makes | Sparx EA analogue |
|---|---|---|---|---|
| `canvas` | Members | Free | Today's diagram editor | Diagram |
| `sequence` | Members (lifelines and messages) | Ordered | Create interactions and messages; reorder steps | Sequence diagram |
| `matrix` | Two queries (rows, columns) | Derived | A cell creates or deletes a relationship, or sets its property | Relationship Matrix |
| `list` | Query, or a diagram's members | Derived | Properties in place, related-object chips (a catalogue) | Diagram List view |
| `specification` | Query, or a diagram's members, as a tree | Derived | Names, descriptions and properties in place, as a document | Specification Manager / Specification view |
| `tree` | A root and a path, e.g. containment | Derived | Re-parent by drag (one relationship reconnected) | Package Browser |
| `document` | A subject object and its template's sections | Composed | Whatever each section's kind makes | Document Artifact + document templates |
| `roadmap`, `chart`, `dashboard` | As in [diagrams §6](diagrams-and-catalogues.md#6-other-views) | Derived | As specified there | Gantt, charts |

**Show as** (Sparx calls these alternate diagram views). A `canvas` or `sequence` diagram can be shown as a list, specification or matrix of its own members without copying anything: the view's `definition.showAs` changes, the occurrences stay. The landscape a reviewer sees as boxes, the data steward reads as a table with an editable *Owner* column. This is the same idea as an occurrence's rendition (notation §4), one level up.

The [Semantic Model View prototype](https://claude.ai/artifact/JebpGqrwNUbrdnG2PTy6kM) (hybrid, table, hierarchy, matrix, detail over one definition) is this table seen from a single screen: its modes are the `list`, `tree`, `matrix` and `specification` kinds sharing one scope.

## 3. Scope: structured paths

Derived views and artifact sections need queries now, before the M1 query parser exists. They use a **structured path**, the AST the parser will produce later (V11):

```json
{ "from": "$subject",
  "steps": [
    { "kind": "interaction", "dir": "either" },
    { "to": { "category": ["component"] } } ] }
```

| Field | Meaning |
|---|---|
| `from` | `$subject` (the artifact's subject), `$row` (the current row of an enclosing list), `$diagram` (a diagram's members), or a filter (`{ "type": ["application"] }`, `{ "category": [...] }`, `{ "level": [...] }`, `{ "folder": id }`) |
| `steps[]` | Each step follows relationships by `type` (a key) or `kind` (a semantic kind, so it survives renamed types), in `dir` `out`, `in` or `either`, optionally `transitive` up to a depth, then filters the objects reached with `to` |
| `where` | Property filters on the result: `{ "lifecycle.status": { "in": ["active"] } }` |
| `order` | `rank` (the explorer's order), `name` or a property |

Text form, once the parser lands: `$subject -@interaction- category:component`. Both compile to the same AST, so a template written today keeps working. Evaluation is pure graph logic over the engine's rows, in a new pure package `packages/views` (it may import `model` and `semantics`), so the browser, the server's export and tests run the same code.

## 4. Matrix view

```
                     │ Claims    │ Policy   │ Billing  │ Payments │
                     │ Manager   │ Admin    │ Engine   │ Hub      │
─────────────────────┼───────────┼──────────┼──────────┼──────────┤
▾ Customer Mgmt      │           │          │          │          │
    Handle Claim     │  ● serves │          │          │  ○ via   │
    Issue Policy     │           │ ● serves │ ●        │          │
▾ Finance            │           │          │          │          │
    Collect Premium  │           │          │ ● ●2     │ ● serves │
```

| Part | Definition | Notes |
|---|---|---|
| Rows, columns | Two scopes (§3) | Headers show glyph, name and optionally key; **group headers** follow a containment or composition path, collapsible |
| Cells | `relationships`: types and/or kinds, and `dir` (`rowToColumn`, `columnToRow`, `either`) | A cell shows a dot per relationship in the kind's colour (notation §3), a count when several, or a **cell property** (e.g. `raci.code` as R, A, C, I; `access.mode` as C R U D) |
| Create | `create`: the relationship type a click makes (or a picker of the allowed types when several fit) | Refused pairs show the reason on hover, from the same rule check as the diagram editor |
| Delete | Click a filled cell: a small menu shows each relationship with *Delete relationship* | One change each, with Undo in the toast |
| Derived cells | `derived: "trace"` adds read-only, hatched cells for indirect relationships (a trace from semantics §9.3) | "Handle Claim is served by Payments Hub via Claims Manager", shown on hover (V10) |
| Pivot, filters | Swap rows and columns; hide empty rows and columns; filter by property; heat by count | View state; *Save view* writes it to the definition |
| Totals | Row and column counts | Read-only |

The metamodel editor's **connection matrix** (notation §10.2, being built in slice A-1) is the same grid over *types* and *rules* rather than objects and relationships. Both use one grid component (sticky headers, group headers, virtualised cells, keyboard navigation); whichever slice lands first provides it.

A matrix is also a **diagram type**, so a package can ship "Application × Capability" or "Interface × Data object (CRUD)" ready to open, and a design artifact can embed one as a section (§7).

## 5. List and specification views

A **list** is the catalogue of [diagrams §5](diagrams-and-catalogues.md#5-catalogues) as a view kind: columns of fields, properties, related objects (chips that create and delete relationships) and aggregates, grouped and sorted, edited in place (V12 retires the separate `catalogue` table, which nothing uses yet).

A **specification** reads like a document and edits like a form. Each object in scope is a heading (glyph, name, type) followed by its description and a compact property block; nesting follows a path, so a capability's contents are sub-headings. Typing in the heading renames the object; typing below it sets its description; `Enter` at the end of an entry creates a sibling of the same type (and the relationship that puts it in scope, e.g. *contains*). It is the fastest way to write down twenty requirements or capabilities and the closest thing to Sparx's Specification Manager.

## 6. Sequence view: UML on top of real flows

The semantic layer already stores what a sequence diagram draws: an **interaction** is a relationship from initiator to responder, and its **messages** are child flow relationships whose direction says request or response (semantics §6). The sequence view draws those facts in the UML style people expect, so every arrow is a real flow with payload, properties and history, and tracing, impact and matrices see them.

```
  Order Consumer        Order API          Order Store
       ┌─┐                 ┌─┐                 ┌─┐
        │  1 GET /orders/{id}                  │
        │ ───────────────► █                   │       request (sync: filled head)
        │                  █  2 read order     │
        │                  █ ────────────────► █       request of another interaction
        │                  █ ◄- - - - - - - -  █       response (dashed)
        │  3 200 [Order]   █                   │
        │ ◄- - - - - - - - █                   │
   ┌ alt [not found] ─────────────────────────────┐
   │    │  4 404           │                   │   │   fragment: an annotation
   │    │ ◄- - - - - - - - │                   │   │
   └──────────────────────────────────────────────┘
```

| Element | Is | Stored |
|---|---|---|
| **Lifeline** | An object occurrence. The head uses the object's rendition (box, glyph, or an actor figure), so the elements look like the rest of the model: the *hybrid* | Occurrence; left-to-right order is its `x`, which the view snaps to lanes |
| **Message** | A relationship occurrence of a flow (usually an interaction's message; a plain flow is allowed too) | Occurrence with a new `step` (fractional rank): the same message can appear in two sequences in different orders (V5) |
| **Message style** | From semantics, not drawn by hand: request with `interaction.pattern = synchronous` has a filled head, asynchronous an open head, a response is dashed. The label is the message's name, then its payload in brackets | Nothing new |
| **Activation bar** | Computed: from a request to its matching response (same interaction, opposite direction), nested when calls nest | Nothing |
| **Fragment** (`alt`, `opt`, `loop`, `par`, `ref`) | An annotation spanning a range of steps and lifelines, with a guard. A `ref` fragment links to another sequence diagram (drill-down) | Annotation `content: { shape: "fragment", operator, guard, fromStep, toStep, refDiagramId? }` (V8) |
| **Self-call** | A note on the activation bar until the rules allow a relationship from an object to itself (V6) | Annotation |

Gestures:
- **Drag from one lifeline to another** at a height: the picker offers the existing interactions' messages between the two objects not yet on this diagram, then *New message in «interaction»*, then *New interaction* (creates the interaction and its request in one change, as on canvases today).
- **Add response** on a request (or `R` with it selected) creates the reverse message under the same interaction at the next step.
- **Drag a message up or down** changes only its `step` on this diagram.
- **Drop an information object on a message** adds it to the payload (as canvases do since Sem-3).
- **Show as canvas** draws the same members as boxes and lines; **Show as list** gives a step table (step, from, to, message, payload, protocol): the integration spec table many teams keep in Word by hand.
- **Generate from interactions**: pick two or more objects; the view adds lifelines and every message of their interactions in each interaction's own message order, as a starting point.

Two things this gives that a drawing tool cannot: the data matrix (§4) and the payload trace find the message *200 [Order]* without anyone re-entering it, and renaming *Order API* in the explorer renames the lifeline in every sequence.

## 7. Design artifacts: the model as a templated canvas

A **design artifact** is a `document` view about one **subject** (a solution, an application, a project, a capability) built from a **template** whose sections are live, editable views scoped to that subject. An HLD stops being a Word file that copies the model and goes stale; it *is* a page of the model.

### 7.1 Template

A template is a diagram type of kind `document`:

```json
{ "key": "hld", "name": "High-level design", "kind": "document",
  "subject": { "type": ["application", "service"] },
  "sections": [
    { "key": "summary", "title": "Summary", "kind": "prose", "guidance": "What changes and why, in five lines.", "required": true },
    { "key": "facts", "title": "Key facts", "kind": "fields", "properties": ["lifecycle.status", "ownership.businessOwner", "semantic.level"] },
    { "key": "context", "title": "Context", "kind": "view", "view": { "kind": "canvas", "generate": { "include": [ { "path": { "from": "$subject", "steps": [ { "kind": "interaction", "dir": "either" } ] } } ], "layout": "radial" } } },
    { "key": "integrations", "title": "Integrations", "kind": "relationList",
      "rows": { "from": "$subject", "steps": [ { "kind": "interaction", "dir": "either" } ] },
      "columns": ["direction", "interaction.pattern", "interaction.protocol", "payload"],
      "add": { "relationshipType": "calls", "pick": { "category": ["component", "interface"] } },
      "perRow": { "title": "Sequence", "view": { "kind": "sequence", "seed": "interactionsWithRow", "name": "{subject.name} ↔ {row.name}" } },
      "min": 1 },
    { "key": "data", "title": "Data handled", "kind": "view", "view": { "kind": "matrix",
      "rows": { "from": "$subject", "steps": [ { "kind": "composition", "dir": "out", "transitive": 2 } ] },
      "columns": { "from": "$subject", "steps": [ { "kind": "access", "dir": "out" } ] },
      "relationships": { "kinds": ["access"] }, "cell": { "show": "property", "property": "access.mode" } } },
    { "key": "raci", "title": "Responsibilities (RACI)", "kind": "view", "view": { "kind": "matrix",
      "rows": { "from": "$subject", "steps": [ { "type": "composedOf", "dir": "out", "to": { "type": ["processStep"] } } ] },
      "columns": { "from": { "category": ["actor"] } , "pick": true },
      "relationships": { "types": ["raci"], "dir": "columnToRow" },
      "cell": { "show": "property", "property": "raci.code", "cycle": ["R", "A", "C", "I", null] },
      "check": "exactlyOne(raci.code = A) per row" } },
    { "key": "decisions", "title": "Decisions and risks", "kind": "relationList", "rows": { "from": "$subject", "steps": [ { "kind": "influence", "dir": "in" } ] }, "columns": ["type", "lifecycle.status"] }
  ] }
```

### 7.2 Section kinds

| Kind | Shows | Edits | Stored in the artifact |
|---|---|---|---|
| `prose` | Rich text with guidance as placeholder; `@` mentions objects as live chips (renamed when they are) | Text | The text (V3): it is the author's words, not a model fact |
| `fields` | The subject's chosen properties, with the properties panel's editors | Property values (model) | Nothing |
| `relationList` | "X linked to Y" as a list: one row per related object (the path's result), columns of the row object's or the relationship's properties and payload | **+ Add** picks or creates the row object and creates the relationship in one change; removing a row deletes the relationship (offers the object) | Row order override, hidden columns |
| `perRow` on a list | For each row Y a **child view** (a sequence, a canvas, a matrix) about the subject and Y: a link chip in the row, *Create* when it does not exist | Creating it runs the seed (e.g. the interactions between subject and Y) | The child is an ordinary diagram with `generatedBy: { rule: "<artifact id>/<section>", focusObjectId: Y }`, so the existing unique index guarantees one per row and it is findable from Y (V4) |
| `view` | An embedded view of any kind, scoped by the subject; open full-size in its own tab | As that view kind | Either an embedded definition or a link to an existing diagram (`diagramId`) |
| `matrix` (RACI and friends) | A `view` section whose view is a matrix with a cell property | Clicking a cell cycles its value (creates, updates or deletes the relationship) | Nothing |
| `checklist` | Template checks: required sections filled, `min` rows, matrix checks such as one *A* per row | Nothing | Nothing (computed) |

### 7.3 Behaviour

| Topic | Rule |
|---|---|
| **Live** | Every section reads the current model (or the open scenario). Two HLDs that list the same interface show the same protocol |
| **Completeness** | The artifact header shows *7 of 9 sections complete* and lists what is missing ("Integrations: no sequence for Billing Engine"; "RACI: Settle claim has no A"). The explorer can show it as a decoration (notation §8) |
| **Subject** | Chosen when the artifact is created (or the artifact is created from the subject's right-click menu: *New ▸ High-level design*). The subject's page lists its artifacts |
| **Scenarios** | Opened in a scenario, every section shows the scenario's model; a *Compare with baseline* toggle marks rows and cells that differ (M3, with scenario compare) |
| **Issue** | *Issue v1.0* records `{ label, seq, at, by }` in the artifact; opening an issue renders the model **as of** that sequence (needs "restore a version and as of", M2). Until then an issue exports a frozen copy |
| **Export** | Markdown, DOCX and PDF render the same section model (the sequence and canvas sections as SVG). Export is the server running `packages/views` plus the web renderers headless (M2 export path) |
| **Template changes** | A new template version adds sections to existing artifacts and keeps prose of removed sections in an *Unplaced text* section, never discarding words |

### 7.4 Why this is not just a wiki page

The test is the user's own example. In a wiki, "Payments Hub calls Billing Engine, see sequence" is text and a pasted picture. Here the row *is* the `calls` interaction, its protocol column is `interaction.protocol`, its sequence link is a diagram of that interaction's messages, the data matrix finds the payloads those messages carry, and the RACI cells are `raci` relationships the people's own pages list. Changing the protocol in the matrix, the sequence or the explorer changes it in the HLD.

## 8. Storage and engine

| Item | Where | Edit |
|---|---|---|
| View kind | `kind` on the diagram type (`canvas` when absent, so every existing type keeps working) | Metamodel edit |
| A view's definition (scope, columns, matrix settings, `showAs`, artifact subject, prose, per-section overrides, issues) | New `definition jsonb` on `diagram` (migration 008), `{}` for canvases | New edit `setViewDefinition { diagramId, set, unset }`: patches top-level keys; the inverse sets back the previous values. Conflicts per key, like properties |
| Message order in a sequence | New `step text` (fractional rank) on `relationship_occurrence` (migration 008) | `routeRelationshipOccurrence` gains optional `step`, with its inverse |
| Lifeline order | The occurrence's `x` | `moveObjectOccurrence` (unchanged) |
| Fragments, self-call notes | Annotations, `content.shape: "fragment" \| "note"` | Annotation edits (unchanged) |
| Per-row child views | Ordinary diagrams with `generatedBy` | `createDiagram` gains optional `generatedBy` |
| RACI | Essentials 1.5.0: object type `role` (category `actor`), relationship type `raci` (kind `assignment`, actor → behaviour/deliverable), list property `raci.code` (R, A, C, I) on it | Needs `setProperties` on **relationships** (today objects only, semantics Sem-3 note) |
| Templates | Diagram types of kind `document` in the package (Essentials ships an `hld` example) | Metamodel edits; the A-1 metamodel editor lists them with the other diagram types |

The engine stays pure and knows nothing about layouts: it validates `definition` only for size (≤ 256 kB) and that ids in it exist when they are objects or diagrams it must keep consistent (the subject: deleting it asks whether to keep the artifact, which then shows *Subject deleted* with Restore). Projections, checks and layouts run in `packages/views` and the web app.

## 9. How others do it

From public documentation, not hands-on testing.

| Need | Sparx EA | Ardoq | SAP LeanIX | Confluence + draw.io | Connectome (this design) |
|---|---|---|---|---|---|
| One diagram, several views | Alternate views of a diagram: list, specification, Gantt, Kanban | Many visualisations of one dataset | Reports per fact sheet | — | `showAs` on any canvas or sequence; renditions per occurrence |
| Relationship matrix | Relationship Matrix between packages, by connector type, editable | Matrix and dependency views | Matrix report | — | Matrix kind over paths, kinds or types; cell properties; derived cells; embeddable |
| Sequence diagrams | UML lifelines and messages; messages are UML connectors, not integration flows | — | — | Pictures | Lifelines are any objects; messages are the interaction's flows with payloads |
| Documents | Document templates and fragments (RTF/DOCX) generated from packages; Document Artifacts hold linked documents | Presentations of live views | Fact sheet pages | Live pages, static pictures | Design artifacts: live, editable sections bound to a subject, issued versions, export |
| RACI | Custom matrix profiles | Via references | Subscriptions (responsible, accountable, observer) | Tables by hand | A matrix section over `raci` relationships with checks |

What the comparison shows: Sparx has every view kind but generates documents one way, out of the model; nobody lets the document be the editing surface. That is the opening: the design artifact is where architects already work, so making it the model's front door is what makes the tool "helpful for design work".

## 10. Slices

| Slice | Delivers | Needs |
|---|---|---|
| **V-1** | View framework + matrix: diagram-type `kind`, diagram `definition` and `setViewDefinition` (migration 008), `packages/views` with structured paths, the centre tab choosing a renderer by kind, *New ▸ Matrix*; the matrix view (rows and columns by type or path, cells by types or kinds, create and delete, group headers by containment, pivot, hide empty, counts); Essentials 1.5.0 *Application × Capability* matrix type | The shared grid component (from A-1 if it lands first) |
| **V-2** | List and specification views; *Show as* list / specification / matrix on any canvas | V-1 |
| **V-3** | Sequence view: lifelines with renditions, messages from interactions, `step`, computed activations, response pairing, add message / response gestures, reorder, fragments; *Generate from interactions*; Show as canvas / list | V-1, Sem-3 |
| **V-4** | Design artifacts: `document` diagram types, subject, sections `prose`, `fields`, `relationList` with `perRow` child views, embedded `view`, completeness; the Essentials `hld` template; *New ▸ High-level design* from an object | V-1–V-3 |
| **V-5** | Cell properties and RACI: `setProperties` on relationships, Essentials `role` + `raci` + `raci.code`, matrix cells that cycle a property, matrix checks | V-1 |
| **V-6** | Issue and export: issued versions, Markdown / DOCX / PDF export of artifacts and views | V-4; "as of" from M2 for live issues |
| **V-7** | Template designer in the metamodel editor (sections as a form with a live preview on a chosen subject) | V-4, A-1 |

V-1 first: the framework pieces are small and the matrix is the view asked for by name; every later slice is then one renderer plus its gestures.
