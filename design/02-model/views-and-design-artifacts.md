# Views and design artifacts

How Connectome shows one model in many shapes: free diagrams (today), matrices, lists, specifications, hybrid sequence diagrams, and **design artifacts**: templated documents (an HLD, a solution design, an integration spec) whose sections are live views of the model. Builds on [diagrams and catalogues](diagrams-and-catalogues.md), the [semantic layer](semantics.md) and [notation](notation-and-metamodel-admin.md).

Status: **proposed** (2026-10-07; revised the same day after review: components, patterns, linked context). Open questions V1–V16 are in the [decision log](../decision-log.md#views-decisions). Mockups: [Views framework](https://claude.ai/artifact/35pBoCFz6S1bahi9ri7v4P).

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
| `from` | `$subject` (the artifact's subject), `$row` (the current row of an enclosing list), `$diagram` (a diagram's members), or a filter (`{ "type": ["application"] }`, `{ "category": [...] }`, `{ "abstraction": [...] }`, `{ "folder": id }`) |
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

The metamodel editor's **connection matrix** (notation §10.2, being built in slice A-1) is the same grid over *types* and *rules* rather than objects and relationships. Both should use one grid component (sticky headers, group headers, virtualised cells, keyboard navigation). A-1 drew its matrix as a plain table; V-1 extracted the grid from it (`MatrixGrid`) and moved the connection matrix onto it.

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

A **design artifact** is a `document` view about one **subject** (a solution, an application, a project, a capability) built from a **template**. The template arranges **components** (prose, key facts, a linked diagram, a flow table, a matrix…) whose content is the model itself, scoped to the subject. An HLD stops being a Word file that copies the model and goes stale; it *is* a page of the model, and you can model in it.

*Revised 2026-10-07 after the product owner's review:* the context is a **linked child diagram** (drawn by the author, not generated), the integrations table is **bound to that diagram's connectors**, and templates are **composed from components and patterns** that power users configure (§8).

### 7.1 A template, as a power user writes it

A template is a diagram type of kind `document`. Its body is a list of **sections**, each one component with its configuration, or a **pattern** (a reusable group of sections, §8.4) with parameters:

```json
{ "key": "hld", "name": "High-level design", "kind": "document", "version": "1.2.0",
  "subject": { "type": ["application", "service"] },
  "sections": [
    { "key": "summary", "title": "Summary", "component": "prose",
      "config": { "guidance": "What changes and why, in five lines.", "mentions": { "create": true } },
      "required": true, "lock": "fixed" },
    { "key": "facts", "title": "Key facts", "component": "facts",
      "config": { "properties": ["lifecycle.status", "ownership.businessOwner", "semantic.abstraction", "cost.runCost"] },
      "allow": { "addProperties": true } },
    { "use": "integrationPattern",
      "with": { "diagramType": "context", "flowKinds": ["interaction", "flow"],
                "columns": ["direction", "interaction.pattern", "interaction.protocol", "payload", "description"],
                "requiredColumns": ["interaction.protocol", "payload"], "perRow": "sequence" } },
    { "key": "data", "title": "Data handled", "component": "matrix",
      "config": { "rows": { "from": "$subject", "steps": [ { "kind": "composition", "dir": "out", "transitive": 2 } ] },
                  "columns": { "from": "$subject", "steps": [ { "kind": "access", "dir": "out" } ] },
                  "relationships": { "kinds": ["access"] }, "cell": { "show": "property", "property": "access.mode" } } },
    { "key": "raci", "title": "Responsibilities", "component": "matrix",
      "config": { "rows": { "from": "$subject", "steps": [ { "type": "composedOf", "dir": "out", "to": { "type": ["processStep"] } } ] },
                  "columns": { "from": { "category": ["actor"] }, "pick": true },
                  "relationships": { "types": ["raci"], "dir": "columnToRow" },
                  "cell": { "show": "property", "property": "raci.code", "cycle": ["R", "A", "C", "I", null] } },
      "checks": [ { "rule": "exactlyOne", "cell": "A", "per": "row", "message": "{row.name} needs one A" } ] },
    { "region": "additional", "title": "Additional sections",
      "palette": ["prose", "diagramLink", "relationTable", "matrix", "list", "decisionLog"], "max": 6 }
  ] }
```

### 7.2 Context and integrations stay aligned

The context is a **child diagram** the author draws (a `diagramLink` section): the artifact keeps a link to an ordinary diagram of the template's diagram type, shown as a live preview with *Open* (or, later, edited in place). Nothing is generated; the subject is placed in the middle when the diagram is created, and the rest is the architect's picture.

The integrations table is a `relationTable` whose **source is that diagram**, not a model query: *one row per connector on the context diagram whose relationship kind is a flow or an interaction*. So the two cannot drift apart:

| Event | Effect |
|---|---|
| Draw a connector on the context diagram | A row appears in the table at once, marked *to describe* until its required columns (protocol, payload) are filled |
| Delete the connector from the diagram (`Delete`) | The row disappears; the relationship stays in the model |
| **+ Add integration** in the table | Picks or creates the counterpart and the interaction (one change), and places it on the context diagram next to the subject in the same change, so the row has its connector |
| Edit a cell (protocol, payload, description) | Edits the relationship itself (`setProperties` on relationships, `setPayload`); the context diagram's labels change too |
| The model has interactions of the subject that are **not on the context diagram** | A banner under the table: "2 integrations in the model are missing from the context: Fraud Screening, Bank Gateway API · *Add to context* · *Ignore*". Ignored ones are remembered in the section state |
| Per row **Sequence** | A child sequence diagram of that interaction's messages, created on demand (§6, V4) |

The general rule behind this: any component's rows can come from a **path** (the model) or from a **linked diagram's members** (`source: { section: "context", relationships: { kinds: [...] } }`). Binding a table to a diagram makes "every connector must be described" a completeness check the tool enforces, which is the HLD review question architects ask by hand today.

### 7.3 Modelling in the document

| Where | What the author can do | Model change |
|---|---|---|
| **Prose** | Type `@` to mention an object (live chip, renamed when the object is); `@+` creates a new object of an allowed type from the text ("@+ Fraud Screening" as an application). *Link to subject* on a chip offers the relationship types the rules allow | Mention: none (stored in the prose). `@+`: `createObject`. Link: `createRelationship` |
| **Key facts** | Edit values with the properties panel's editors; add another property if the template allows | `setProperties` |
| **Tables** | Add rows (object + relationship), edit cells, remove rows | Relationship and property edits |
| **Matrices** | Click cells | Create, delete or set the property of relationships |
| **Linked diagrams** | Open and draw | Diagram edits |

Every one of these is an ordinary change with an exact inverse: one undo step, visible in history and in every other view.

### 7.4 Behaviour

| Topic | Rule |
|---|---|
| **Live** | Every section reads the current model (or the open scenario). Two HLDs that list the same interface show the same protocol |
| **Completeness** | The artifact header shows *7 of 9 sections complete* and lists what is missing ("Integrations: Billing Engine has no protocol"; "RACI: Settle claim has no A"). Components contribute their own checks (§8.1). The explorer can show completeness as a decoration (notation §8) |
| **Subject** | Chosen when the artifact is created (or from the subject's right-click menu: *New ▸ High-level design*). The subject's page lists its artifacts |
| **Scenarios** | Opened in a scenario, every section shows the scenario's model; a *Compare with baseline* toggle marks rows and cells that differ (M3, with scenario compare) |
| **Issue** | *Issue v1.0* records `{ label, seq, at, by }` in the artifact; opening an issue renders the model **as of** that sequence (needs "restore a version and as of", M2). Until then an issue exports a frozen copy |
| **Export** | Markdown, DOCX and PDF render the same section model (diagram sections as SVG). Each component supplies its own export fragment (§8.1) |
| **Template changes** | A new template version adds sections to existing artifacts and keeps prose of removed sections in an *Unplaced text* section, never discarding words |

### 7.5 Why this is not just a wiki page

In a wiki, "Payments Hub calls Billing Engine, see sequence" is text and a pasted picture. Here the connector on the context diagram *is* the `calls` interaction, its row in the integrations table edits `interaction.protocol`, its sequence link is a diagram of that interaction's messages, the data matrix finds the payloads those messages carry, and the RACI cells are `raci` relationships the people's own pages list. Changing the protocol in the table, the sequence or the explorer changes it everywhere.

## 8. The component framework

How documents (and, later, dashboards) are assembled, and what a power user configures versus what a developer builds.

### 8.1 A component

A component is one registered block type. The same definition serves the document, the template designer, completeness and export:

| Part | What it is | Lives in |
|---|---|---|
| `key`, `name`, `icon` | Identity in the designer palette | `packages/views` |
| `config` | A JSON Schema for its settings (paths, columns, cell property, guidance). The designer's settings form is generated from it, so a new component needs no designer code | `packages/views` |
| `state` | What one artifact stores for this section instance: prose text, the linked diagram id, row order, hidden columns, ignored rows | The artifact's `definition` |
| `bind` | Its data sources: `$subject`, a path (§3), another section (`{ section: "context" }`), or `$row` inside a repeater | Resolved by `packages/views` |
| `project` | A **pure** function `(model rows, config, state, bindings) → view model` (rows, cells, chips, findings) | `packages/views` (runs in the browser, the server's export and tests) |
| `checks` | Completeness findings from the view model (required section empty, a row missing a required column, a matrix rule) | `packages/views` |
| `render` | The React component that draws the view model and turns gestures into **edits** submitted through the store | `apps/web` (renderer registry) |
| `export` | Markdown and DOCX fragments from the same view model | `packages/views` (SVG for diagrams from the web renderer, headless) |

Built-in components:

| Component | Shows | Binds to |
|---|---|---|
| `prose` | Rich text with `@` mentions and `@+` creation | Subject (for *Link to subject*) |
| `facts` | Chosen properties of the subject or of `$row` | Subject or row |
| `diagramLink` | A live preview of a linked diagram, *Open*, *Create* | A diagram type; stores the diagram id |
| `relationTable` | One row per relationship: counterpart, direction, properties, payload, per-row child link | A path, or a linked diagram's connectors (§7.2) |
| `list` | One row per object, with columns | A path, or a diagram's members |
| `matrix` | Rows × columns of relationships or a cell property | Two sources |
| `sequenceLink` | Per-row child sequence (used inside tables and repeaters) | `$row` |
| `repeater` | For each row of a source, a block of child sections (e.g. per integration: its facts, its sequence and a prose note) | A source; children see `$row` |
| `decisionLog` | Decisions and risks related to the subject, as a register | A path (`<-@influence-`) |
| `heading`, `callout` | Structure and fixed guidance text | Nothing |

### 8.2 Three levels of configuration

"Customisable within the patterns" means each level can change only what the level above allows:

| Level | Who | Configures | Where |
|---|---|---|---|
| **Component** | Developer (product, later extensions) | New block types: config schema, projection, renderer, export | Code, in the registry |
| **Template and pattern** | Power user / model owner | Which components, in which order, with which config; what is required; what authors may change (`lock`, `allow`, `region`) | Template designer (§8.5); stored in the metamodel package |
| **Artifact** | Author | Content (prose, values, rows, diagrams) and only the freedoms the template grants: add a property to facts, show or hide optional columns, reorder optional sections, add sections from a region's palette | The document itself |

Locks on a template section:

| `lock` | Author may |
|---|---|
| `fixed` | Fill it in; nothing else (title, position and config fixed) |
| `configurable` (default) | Change what `allow` lists (`addProperties`, `columns`, `showAs`, `hide` when not required) |
| `free` | Change its config entirely, or remove it when not required |

A **region** (`{ "region": "additional", "palette": [...] }`) is a place in the template where authors may insert components from a palette, up to `max`.

### 8.3 Variables and bindings

| Variable | Is |
|---|---|
| `$subject` | The artifact's subject object |
| `$row` | The current row object inside a `relationTable`'s per-row content or a `repeater` (and `$rel` for the row's relationship) |
| `{ section: "key" }` | Another section's output: a linked diagram's members or connectors, a table's rows |
| `$template.param` | A pattern parameter (§8.4) |

Name templates use the same variables: `"{subject.name} ↔ {row.name}"`.

### 8.4 Patterns: reusable groups of sections

A **pattern** is a parameterised group of sections, defined once in a package and used by many templates. The integration pattern of §7.2:

```json
{ "key": "integrationPattern", "name": "Context and integrations",
  "params": { "diagramType": { "type": "string" }, "flowKinds": { "type": "array" },
              "columns": { "type": "array" }, "requiredColumns": { "type": "array" },
              "perRow": { "enum": ["sequence", "none"] } },
  "sections": [
    { "key": "context", "title": "Context", "component": "diagramLink",
      "config": { "diagramType": "$template.diagramType", "placeSubject": "centre" }, "required": true },
    { "key": "integrations", "title": "Integrations", "component": "relationTable",
      "config": { "source": { "section": "context", "relationships": { "kinds": "$template.flowKinds" } },
                  "columns": "$template.columns", "required": "$template.requiredColumns",
                  "add": { "kinds": "$template.flowKinds", "placeOn": "context" },
                  "missing": { "from": "$subject", "steps": [ { "kind": "interaction", "dir": "either" } ] },
                  "perRow": { "component": "sequenceLink", "when": "$template.perRow = sequence" } },
      "allow": { "columns": true } } ] }
```

| Rule | Effect |
|---|---|
| `use` + `with` | A template includes a pattern and sets its parameters; section keys are prefixed when a pattern is used twice |
| Overrides | A template may override a pattern section's `title`, `lock` and `allow`, never its bindings (so the pattern's guarantees hold) |
| `extends` | A template may extend another (`"extends": "hld"`) and insert, after a named section, more sections; the company HLD is the base HLD plus its own |
| Versions | Patterns and templates are versioned with their package; existing artifacts move to a new version with the rule in §7.4 |
| Validation | When the package loads, every path, type, property and kind a template or pattern names is checked against the metamodel, and every `add` against the rules, so a template cannot offer an edit the engine would refuse |

Essentials ships the components' default patterns: *Context and integrations*, *Data handled (CRUD matrix)*, *Responsibilities (RACI)*, *Decisions and risks*, and two templates built from them: *High-level design* and *Integration specification*.

### 8.5 The template designer

In the metamodel editor (with A-1's draft and publish): a palette of components and patterns on the left; the template's outline in the middle, rendered live against a **sample subject** the power user picks (the real Payments Hub, so they see what authors will see, including the completeness findings); on the right, the selected section's settings, generated from the component's config schema, with its lock, `allow` and required switches. Saving writes the draft package; publishing migrates existing artifacts as in §7.4.

### 8.6 How it ties into the rest

```
 metamodel package ─ templates, patterns ─┐
                                          ▼
 artifact (diagram, kind document) ─ definition: subject, template version, section states
                                          │
            packages/views  ── resolve template (extends, patterns, params) ──► sections
                            ── bind (subject, paths, linked diagrams, $row) ──► rows
                            ── project + checks (pure) ─────────────────────► view models, findings
                                          │
            apps/web        ── renderer registry ──► document page, designer preview
                            ── gestures ──► edits ──► ModelStore ──► engine (same as every other view)
            server          ── export: the same projections + renderers headless ──► DOCX / PDF / Markdown
```

Nothing in this chain writes except the gestures, and they go through the change engine like every other edit.

## 9. Storage and engine

| Item | Where | Edit |
|---|---|---|
| View kind | `kind` on the diagram type (`canvas` when absent, so every existing type keeps working) | Metamodel edit |
| A view's definition (scope, columns, matrix settings, `showAs`, artifact subject, prose, per-section overrides, issues) | New `definition jsonb` on `diagram` (migration 009), `{}` for canvases | `setViewDefinition { diagramId, baseVersion, set }`: patches top-level keys, `null` removing one; the inverse sets back the previous values. Conflicts per key, like properties (built in V-1) |
| Message order in a sequence | New `step text` (fractional rank) on `relationship_occurrence` (migration 010) | `setMessageStep { diagramId, occurrenceId, step }`, last writer wins, with its inverse (built in V-3, B37) |
| Lifeline order | The occurrence's `x` | `moveObjectOccurrence` (unchanged) |
| Fragments, self-call notes | Annotations, `content.shape: "fragment" \| "note"` | Annotation edits (unchanged) |
| Per-row child views | Ordinary diagrams with `generatedBy` | `createDiagram` gains optional `generatedBy` |
| Linked diagrams (`diagramLink`, e.g. the context) | Ordinary diagrams; the section state holds the id. Deleting the diagram leaves the section showing *Diagram deleted* with Restore and Create new | `setViewDefinition` on the artifact, `createDiagram` in the same change when created from the section |
| Prose | Section state: a small rich-text tree (paragraphs, lists, emphasis, links) where a mention is `{ mention: objectId }`, so renames need no rewrite | `setViewDefinition` |
| Ignored rows (§7.2 missing banner), hidden columns, row order | Section state | `setViewDefinition` |
| RACI | Essentials 1.5.0: object type `role` (category `actor`), relationship type `raci` (kind `assignment`, actor → behaviour/deliverable), list property `raci.code` (R, A, C, I) on it | Needs `setProperties` on **relationships** (today objects only, semantics Sem-3 note) |
| Templates and patterns | Diagram types of kind `document` (with `sections`, `extends`) and a new package section `patterns`; Essentials ships the patterns of §8.4 and the *High-level design* and *Integration specification* templates | Metamodel edits through A-1's draft and publish |
| Relationship properties edited in tables (protocol, description) | The relationship's properties | `setProperties` extended to relationships (today objects only, semantics Sem-3 note), with its inverse |

The engine stays pure and knows nothing about layouts: it validates `definition` only for size (≤ 256 kB) and that ids in it exist when they are objects or diagrams it must keep consistent (the subject: deleting it asks whether to keep the artifact, which then shows *Subject deleted* with Restore). Projections, checks and layouts run in `packages/views` and the web app.

## 10. How others do it

From public documentation, not hands-on testing.

| Need | Sparx EA | Ardoq | SAP LeanIX | Confluence + draw.io | Connectome (this design) |
|---|---|---|---|---|---|
| One diagram, several views | Alternate views of a diagram: list, specification, Gantt, Kanban | Many visualisations of one dataset | Reports per fact sheet | — | `showAs` on any canvas or sequence; renditions per occurrence |
| Relationship matrix | Relationship Matrix between packages, by connector type, editable | Matrix and dependency views | Matrix report | — | Matrix kind over paths, kinds or types; cell properties; derived cells; embeddable |
| Sequence diagrams | UML lifelines and messages; messages are UML connectors, not integration flows | — | — | Pictures | Lifelines are any objects; messages are the interaction's flows with payloads |
| Documents | Document templates and fragments (RTF/DOCX) generated from packages; Document Artifacts hold linked documents | Presentations of live views | Fact sheet pages | Live pages, static pictures | Design artifacts: live, editable sections bound to a subject, issued versions, export |
| RACI | Custom matrix profiles | Via references | Subscriptions (responsible, accountable, observer) | Tables by hand | A matrix section over `raci` relationships with checks |

What the comparison shows: Sparx has every view kind but generates documents one way, out of the model; nobody lets the document be the editing surface. That is the opening: the design artifact is where architects already work, so making it the model's front door is what makes the tool "helpful for design work".

## 11. Slices

Reordered 2026-10-07 after the product owner's review, to reach the document view early:

| Slice | Delivers | Needs |
|---|---|---|
| **V-1** | View framework + matrix: diagram-type `kind`, diagram `definition` and `setViewDefinition` (migration 009), `packages/views` (structured paths, component registry, projections), the centre tab choosing a renderer by kind, *New ▸ Matrix*; the matrix view (rows and columns by type or path, cells by types or kinds, create and delete, group headers by containment, pivot, hide empty, counts), on a grid extracted from A-1's connection matrix; Essentials *Application × Capability* matrix type | A-1 merged (for the grid) |
| **V-2** | Document core: `document` kind, subject, the components `prose` (with `@` mentions), `facts`, `diagramLink` and `relationTable` (bound to a path or to a linked diagram's connectors, missing banner, add places on the diagram), completeness; `setProperties` on relationships; the Essentials *High-level design* template written in JSON; *New ▸ High-level design* from an object | V-1 |
| **V-3** | Sequence view (§6) and the per-row `sequenceLink` | V-1, Sem-3 |
| **V-4** | Patterns, locks, `allow`, regions, `extends`, `repeater`, `@+` creation in prose; Essentials patterns and the *Integration specification* template | V-2 |
| **V-5** | Template designer in the metamodel editor (palette, outline with live preview on a sample subject, settings forms from config schemas) | V-4, A-1 |
| **V-6** | List and specification views; *Show as* on any canvas | V-1 |
| **V-7** | Cell properties: RACI (`role`, `raci`, `raci.code`) and the CRUD data matrix; matrix checks | V-1, V-2 |
| **V-8** | Issue and export: issued versions, Markdown / DOCX / PDF | V-2; "as of" from M2 for live issues |

V-1 to V-4 are built ([build plan](../build-plan.md); B29–B45). As built in V-3, message order has its own edit `setMessageStep` and a row's sequence is kept in its table section's state rather than in `generatedBy` (B37, B38). As built in V-4: patterns live in the package's `documentPatterns`; a pattern used twice takes an explicit `prefix`; a template's `overrides` sit at the template level; what authors change is kept in the document's `definition.layout`; and the Integration specification's per-integration blocks are a `repeater` (B40–B44). As built, a template sits under the type's `document` key (`subject`, `sections`) rather than at the top level as in §7.1, and a table column can span several properties (B34). V-1 first: the framework pieces (definition, registry, paths) are what every later slice plugs into, and the matrix proves them on the view asked for by name. V-2 follows straight after, so the document view is usable two slices in.
