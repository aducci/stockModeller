# Notation and metamodel administration

How an object looks, and how a model owner sets the rules behind the tool. Builds on the [metamodel](metamodel.md), [diagrams](diagrams-and-catalogues.md) and the [semantic layer](semantics.md) ([ADR-010](../06-decisions/ADR-010-semantic-base-types.md)).

Status: **proposed**. Open questions N1–N12 are in the [decision log](../decision-log.md#notation-decisions-proposed). Example package section: [example-notation.json](../05-structures/example-notation.json). Rendered icon set and admin mockups: [Notation Studio](https://claude.ai/artifact/VGwsxvR79zbkJbuDGsKcfS).

## 1. The idea in one table

| Layer | Question it answers | Set by | Changes the model? |
|---|---|---|---|
| **Glyph** | What is the tiny picture for this kind of thing? | Type, or its semantic category by default | No |
| **Rendition** | What form does an occurrence take: box, card, icon, chip, container? | Type (several per type), chosen per occurrence | No |
| **Style rule** | How does the look change with the object's data? | Type, diagram type, lens | No |
| **Marker** | What should the reader be warned about, at a glance? | Type, diagram type, lens | No |
| **Lens** | Which way of looking at this diagram right now? | Repository or user; switched at view time | No |
| **Stencil, pattern, zone** | What can be put on a diagram, and what does placing it mean? | Diagram type | Yes, through normal changes |
| **Rules** | Which connections are allowed across which types? | Metamodel (§8) | Validated by the engine |

Two principles carry the whole design:

1. **Notation inherits from semantics.** A custom type with a category and a relationship type with a kind look right with zero configuration: the category gives a glyph and a hue, the kind gives a line style and arrowheads (§3). Model owners override only where they want something different.
2. **Notation is data, and small.** Glyphs are a single SVG path on a 16-unit grid. Everything else is JSON in the metamodel package, versioned and migrated like any other metamodel edit. No uploaded SVG documents, no scripts in shapes.

## 2. Glyphs: tiny, safe, themable icons

A glyph is **one SVG path string** drawn on a 16×16 grid:

```json
"glyphs": {
  "component": "M5.5 2.5h8v11h-8zM3 5h4.5v2H3zM3 9h4.5v2H3z",
  "service":   "M5 4h6a4 4 0 0 1 0 8H5a4 4 0 0 1 0-8",
  "cloud":     "M4.5 12.5h7a3 3 0 0 0 .3-6A4 4 0 0 0 4.3 7.2a2.7 2.7 0 0 0 .2 5.3z"
}
```

| Rule | Why |
|---|---|
| Stroke only: rendered with `fill="none" stroke="currentColor" stroke-width="1.5"`, round caps and joins | One look across all glyphs; the colour comes from the theme or a style rule, so dark mode and highlights are free |
| Path data only, characters `MmLlHhVvCcSsQqTtAaZz`, digits, `.`, `-`, `,`, space; at most **256 bytes** | Nothing to sanitise beyond a regular expression; no `<script>`, `<foreignObject>` or external references can ever reach the page |
| A dot is `Mx yh.01` (round caps draw it) | Dots without fills |
| Uploaded SVG is **converted**, not stored: shapes are flattened to one path, scaled to the grid, rounded to 0.1 and rejected if over budget | Keeps the format closed while letting people bring icons from elsewhere |

**Rendering.** The page holds one hidden `<svg>` sprite with a `<symbol id="g-component" viewBox="0 0 16 16">` per glyph in use; an occurrence draws `<use href="#g-component">`. One DOM node per icon, whatever the number of occurrences. The same sprite serves the explorer, tabs, catalogues, chips and the palette, so the glyph is the object type's identity everywhere, not only on diagrams.

**Budget.** The 27 glyphs in the example (11 categories, 7 common variants, 9 markers) total **1,263 bytes** of path data, 47 bytes on average. A whole framework package of 60 types stays under 4 KB.

**The default set** maps the semantic categories ([semantics §4.1](semantics.md#41-categories)):

| Category | Glyph | Default hue |
|---|---|---|
| `actor` | person | amber |
| `capability` | steps | sand |
| `behaviour` | chevron | amber |
| `service` | pill | sky |
| `interface` | lollipop | sky |
| `component` | component block | sky |
| `information` | header box | teal |
| `technology` | node | green |
| `location` | pin | rose |
| `motivation` | target | violet |
| `other` | square | slate |

**Hues, not hex.** Fills come from a named 12-hue notation palette (`sky`, `teal`, `green`, `amber`, `sand`, `rose`, `violet`, `slate`…), each with a light and a dark value tuned for label contrast. A diagram therefore renders correctly in both themes and in print. Hex values remain allowed for corporate colours; they are flagged in the editor when contrast fails.

## 3. Lines follow the semantic kind

A relationship type with no `line` gets its look from its kind. The defaults borrow the visual grammar most architects already read (ArchiMate, UML), so a custom *Calls* (interaction) or *Publishes* (flow) is recognisable at once:

| Kind | Line | Start | End | Label |
|---|---|---|---|---|
| `containment` | shown as nesting; as a line: solid | dot | — | |
| `composition` | solid | filled diamond | — | |
| `aggregation` | solid | open diamond | — | |
| `association` | solid | — | — | |
| `realisation` | dashed | — | open triangle | |
| `representation` | dotted | — | open triangle | |
| `serving` | solid | — | open arrow | |
| `access` | dotted | — | small arrow (toward what is written) | |
| `flow` | dashed | — | filled arrow | `{name} · {payload}` |
| `trigger` | solid | — | filled arrow | |
| `assignment` | solid | dot | filled arrow | |
| `influence` | dashed | — | open arrow | `{influence.effect}` |
| `specialisation` | solid | — | open triangle | |
| `interaction` | 3 px | — | — | ⇄ mid-marker, `{interaction.operation}` |

The `line` field ([metamodel §2](metamodel.md#2-relationship-types)) grows: arrowheads `arrowOpen`, `arrowSmall`, `triangle`, `triangleOpen`, `diamondOpen`, `dot`; `width`; `mid` (a glyph drawn at the midpoint); `label` (a template). With `semanticDirection: reverse`, arrowheads follow the type's own direction, as the rules and API do.

## 4. Renditions: any number of representations per object

An object exists once; how it is drawn is a property of each **occurrence**. A type declares as many **renditions** as it needs, each a named combination of a form, a shape, a size and what it shows:

| Form | Draws | Good for |
|---|---|---|
| `box` | Shape with the glyph top-right and the label | Most diagrams (today's symbol) |
| `card` | Box plus up to 6 property rows (`fields`) | Landscapes people read, reviews |
| `glyph` | The glyph at 24–48 px with the label below | Context and integration diagrams, dense maps |
| `chip` | A pill with glyph and short label (`{key}`) | Matrices, heat maps, swimlanes |
| `container` | Header bar with glyph and label, body for nested occurrences | Containment and composition (nested layout) |
| `notation` | A package-supplied figure (e.g. the ArchiMate rectangle with its corner icon, or the ArchiMate "figure" alternative) | Framework-faithful diagrams |

```json
"renditions": {
  "application": [
    { "key": "box",  "form": "box",  "shape": "roundRect", "size": [130, 48], "label": "{name}" },
    { "key": "card", "form": "card", "size": [180, 96], "fields": ["lifecycle.status", "ownership.businessOwner", "cost.runCost"] },
    { "key": "icon", "form": "glyph", "size": [32, 32] }
  ]
}
```

- The existing `symbol` becomes the type's **first rendition** (`box`), so current packages keep working unchanged.
- An occurrence stores `rendition` (a key) only when it differs from the default; the default comes from the diagram type, else the type's first rendition. Changing it is an ordinary occurrence edit with an exact inverse.
- Two occurrences of one object on the same diagram may use different renditions (a card in the centre, chips at the edges).
- **Switch rendition** on the context menu and `R` cycles through them; a multi-selection switches together.
- **Semantic zoom.** A diagram type may set renditions per zoom band: `{ "below": 0.4, "rendition": "icon" }`. At 30 % a landscape becomes a field of coloured glyphs instead of unreadable boxes. This replaces the generic "simplified symbols" in [diagram editor §7](../04-ux/diagram-editor.md#7-rendering) with something the model owner controls.
- **Shapes** stay parametric: the built-in shapes (`rect`, `roundRect`, `ellipse`, `hexagon`, `cylinder`, `person`, plus `tab`, `chevron`, `pill`, `document`, `note`, `parallelogram`) are functions of width and height, so they resize without distortion. A package can add a custom outline as a path on a 100×100 box with a `corner` inset that does not stretch.

## 5. Style rules: occurrences change with properties

`colourRules` on diagram types ([diagrams §3](diagrams-and-catalogues.md#3-diagram-types)) generalise into **style rules** that can live in three places and touch any visual attribute:

```json
"styleRules": [
  { "name": "SaaS looks like a cloud", "when": "type:saasApplication", "apply": { "glyph": "cloud" } },
  { "name": "Retired",          "when": "lifecycle.status = retired",               "apply": { "opacity": 0.45, "strokeStyle": "dashed" } },
  { "name": "Mission critical", "when": "assessment.criticality = missionCritical", "apply": { "strokeWidth": 2.5 } },
  { "name": "Async calls",      "when": "kind:interaction AND interaction.pattern = asynchronous", "apply": { "strokeStyle": "dashed" } }
]
```

| Attribute | Values |
|---|---|
| `fill`, `stroke` | A hue, a hex value, `colourBy` (a list property: its value colours), `gradient` (a number property) |
| `strokeStyle`, `strokeWidth`, `opacity` | As SVG |
| `glyph`, `shape`, `rendition` | Swap the picture: SaaS as a cloud, an external party as a dashed box, a retired thing as a chip |
| `size` | `small`, `normal`, `large` or a scale driven by a number property (bubble-style landscapes) |
| `label` | Another template |

**Cascade**, lowest first: kind or category default → object type → diagram type → active lens → occurrence override. Within one place, later rules win per attribute, so rules compose instead of fighting ("retired" fades a card that "mission critical" made bold). The `when` filter is the query language's filter syntax, extended with `kind:` for relationships; `today` and relative dates (`today + 180d`) make time-based rules possible without automations.

**Performance.** Rules compile once per metamodel version to predicates. Results are memoised per object version, so a change to one object restyles only its occurrences, and live updates do not re-run every rule on the canvas.

## 6. Markers: conditional annotations

What the request called "annotations based on conditions" are **markers**: small glyph badges (optionally with a few characters of text) attached to an occurrence at a fixed slot. The name keeps them apart from diagram **annotations**, which are free text and shapes that are not part of the model ([diagrams §1](diagrams-and-catalogues.md#1-diagrams)).

```json
{ "key": "retiring", "name": "Retiring soon", "when": "lifecycle.retiredFrom < today + 180d",
  "glyph": "clock", "slot": "topRight", "tone": "warning", "text": "{lifecycle.retiredFrom:MMM yy}" }
```

| Field | Notes |
|---|---|
| `slot` | `topLeft`, `top`, `topRight`, `right`, `bottomRight`, `bottom`, `bottomLeft`, `left`. Several markers in one slot stack outward |
| `tone` | `muted`, `accent`, `info`, `warning`, `error`, `ok`: theme colours, never type colours, so a marker never looks like data |
| `text` | Up to 8 characters after formatting (`{count(findings)}`, a date, a score) |
| `pips` | Instead of a glyph: a list property drawn as filled pips. The built-in **level marker** draws `semantic.level` as 1–4 pips, conceptual to implementation, so a reader sees concreteness at a glance without colour |
| `tooltip`, `link` | Hover text; a click target (the property, a finding, a drill-down diagram) |

Built-in markers the engine provides without configuration, each switchable per diagram type: **×N** repeats (already designed), **findings** from validation ([semantics §8](semantics.md#8-validation-from-semantics)), **drill-down** link, **restricted** (folder permissions), and **scenario difference** (added, changed, removed). Markers are listed in the legend with their counts ("3 retiring soon"), and the legend entry selects them.

Markers are what makes a diagram a **live dashboard**: every rule that today needs a report ("which apps have no owner?") can be a marker on the picture people already look at.

## 7. Lenses, stencils, patterns and zones

### 7.1 Lenses: switch how you look, not what you drew

A **lens** is a named bundle of style rules, markers and a legend that a viewer switches on at view time, from a picker on the diagram toolbar. It changes nothing in the diagram. "Lifecycle", "Run cost heat", "Ownership gaps", "Semantic level", "Changes in scenario Target 2027" are lenses. Lenses live in the repository (shared, versioned with the metamodel) or are a user's own. A diagram may save a default lens; links can carry one (`?lens=lifecycle`). The same lenses apply to catalogues (cell colour, markers in the name column) and the explorer (glyph colour).

### 7.2 Stencils: what the palette offers

A diagram type's palette is organised in **stencils**: named sections listing object types (each with the rendition it drops as, and optional preset properties: "Application · SaaS · Active") and patterns. Without stencils, the palette lists the allowed types grouped by category, as today.

### 7.3 Patterns: stencils that contain occurrences

A **pattern** is a reusable fragment: several occurrences with relative positions, nesting and relationships. Dropping it runs one change.

```json
{ "key": "serviceWithApi", "name": "Service with API and store",
  "nodes": [
    { "id": "svc", "objectType": "application", "name": "{prompt}", "rendition": "container", "at": [0, 0] },
    { "id": "api", "objectType": "interface", "name": "{svc.name} API", "parent": "svc", "at": [16, 32] },
    { "id": "db",  "objectType": "dataObject", "name": "{svc.name} data", "parent": "svc", "at": [140, 32], "bind": "pickOrNew" } ],
  "edges": [ { "type": "accesses", "from": "svc", "to": "db" } ] }
```

- Each node **binds** to a new object (default), an existing one picked at drop time (`pick`), or either (`pickOrNew`, with search). The model never gets duplicates because a pattern was used.
- Names are templates; `{prompt}` asks once.
- The pattern is checked against the rules when the package loads, so it cannot produce a refused relationship.
- **Save selection as pattern** turns any group of occurrences into a pattern (objects become new-object nodes by default).

### 7.4 Zones: placing something means something

A **zone** is a diagram region (lanes, a grid or a single frame) whose areas say what they accept and what placing an occurrence there **sets**. Drop an application in the "Phase out" lane and its `lifecycle.status` becomes `phaseOut`, as one change with its inverse. Lanes can be generated from a list property's values, so a roadmap board or a fit/criticality quadrant is a zone, not a special view. Zones are annotations in the model sense (they own no facts), but their effect is a model edit, which the toast states: "Status set to Phase out · Undo".

## 8. Administering the metamodel

The [metamodel editor](../04-ux/screens.md#6-metamodel-editor-admins) gets four ways into the same rules. They are views of one draft; every edit lands in the pending metamodel version and publishes with a migration preview ([metamodel §7](metamodel.md#7-versions-and-packages)).

### 8.1 The metamodel map

A diagram of the metamodel itself: object types as nodes (their glyph and hue), grouped by category or layer; each **relationship rule** an edge labelled with the relationship type's verb, styled by its kind (§3). Drawing a line between two types adds a rule: a picker offers the relationship types, kinds first that make sense for the pair (an `access` toward an information type, a `realisation` from a more concrete level). Selecting an edge opens block/warn and cardinality. Edge thickness shows how many relationships use the rule; a red dashed edge is a combination **in use but not allowed** (found in data), with **Allow** and **Show the 12 relationships**. The map is the onboarding picture: a new modeller sees the language on one page.

### 8.2 The connection matrix

Rows are source types, columns target types. A cell holds one coloured dot per allowed relationship type (the kind's colour; hollow for `warn`). Clicking a cell opens checkboxes for every relationship type, so "what may connect Application to Data object?" is answered and changed in one place. The pivot **by relationship type** gives the per-type source × target grid already in the screens spec. Filters: by kind, by category, "only cells with violations", "only unused rules". Category and wildcard rules (§8.5) show as inherited, lighter dots that can be overridden per cell.

### 8.3 Sentences

The same rules as a list of sentences, the way the model reads: *Application · serves · Process*, *any component · accesses · any information*. A sentence bar with autocomplete adds rules by typing; pasting a column of sentences (or a CSV) previews and adds them in bulk. Each sentence shows usage and violation counts, and the rule's enforcement as a chip.

### 8.4 Try it

A sandbox panel: pick (or drag in) two types and see exactly what a modeller will get: the connect menu in order, what dropping one inside the other offers, the line each choice draws, and the reason for anything refused ("*Server* can't be placed inside *Application*. Allowed: Location"). It answers "why can't I connect these?" before a modeller asks.

### 8.5 Rules that scale

| Addition | Example | Why |
|---|---|---|
| **Category endpoints** | `category:component` *accesses* `category:information` | One rule covers every current and future type in the category; packages combine without listing each other's types |
| **Level conditions** | *realises* only from a more concrete level to a less concrete one (`level: "towardAbstract"`) | Turns the semantic finding into a rule a model owner can tighten to `block` |
| **Learn from data** | "142 relationships use 9 combinations not in the rules" → accept all, accept some, or flag | Brings a messy imported repository under rules without a week of setup (Ardoq surfaces undefined combinations similarly) |
| **Rule presets per kind** | Choosing kind `access` for a new type offers "toward `category:information`" | Good defaults at the moment of creation |

Rule endpoints therefore become: a type key, `*`, an abstract type (inherited through `extends`) or `category:<name>`. The most specific matching rule decides enforcement; the matrix shows which rule a cell inherits from.

### 8.6 Notation studio

The notation lives on the type editor, not in a separate tool:
- **Glyph editor**: a 16×16 grid with snap, line, arc and dot tools, live byte count against the 256-byte budget, preview at 12, 16, 24 and 48 px in both themes; paste or drop an SVG to convert it.
- **Renditions**: a strip of the type's renditions rendered with a real object of the type (or sample data), side by side in light and dark.
- **Rules and markers**: a list with the `when` filter, the effect, and a live count ("matches 37 of 412 applications"), previewed on a sample diagram.

## 9. How leading tools compare

From public documentation, not hands-on testing.

| Need | Sparx EA | Ardoq | SAP LeanIX | Archi | MEGA HOPEX | Bizzdesign | Visual Paradigm | Connectome (this design) |
|---|---|---|---|---|---|---|---|---|
| Custom icons and shapes | Shape scripts per stereotype (a small drawing language) | Icon, colour and shape per component type | Colour per fact sheet type | Specialisation images on any element | Shapes editor | Per-profile shapes | Stereotype icons and fills | 256-byte path glyphs, parametric shapes, theme hues |
| Many representations per object | Alternate images, rectangle vs icon notation | Many visualisations of the same data | Fixed fact-sheet look | Two alternate figures per element type | Shapes per diagram type | Per viewpoint | Per diagram via stereotype display | Any number of renditions per type, chosen per occurrence, plus semantic zoom |
| Style by properties | Shape script conditions on tagged values (`HasTag`); diagram legends that colour by property | Conditional formatting in perspectives | Report views colour by field | Label expressions; scripting | Display by attribute (configured) | Colour and label views | Limited | Style rules with cascade, on objects and relationships |
| Conditional annotations | Shape script decorations | Labels from fields | — | Label expressions | — | Label views | — | Markers with slots, tones, text, legend counts |
| Stencils and patterns | Toolbox profiles; UML patterns | — | — | Palette per viewpoint | Diagram type palettes | Viewpoint palettes | Palettes | Stencils, patterns with bind-to-existing, zones that set properties |
| Rule administration | Quick Linker definitions inside an MDG technology (files) | Metamodel editor; constraints listing every source → reference → target combination as defined in use, unused or undefined | Relations with cardinality per fact sheet type | Fixed by the ArchiMate spec | Metamodel diagram in Studio | Metamodel designer | Profiles | Map, matrix, sentences and try-it over one draft; category rules; learn from data |
| Behaviour from meaning | Per technology code | — | — | ArchiMate rules | Per MetaAssociation | ArchiMate derivation | — | 14 semantic kinds drive defaults for look, gestures, tracing and validation |

What the comparison shows:
- **Sparx** is the most expressive (shape scripts) and the hardest to administer: notation and rules live in a technology file authored outside the model.
- **Ardoq** has the most approachable rule administration (constraints found from data), but its diagrams are generated visualisations with less control over individual occurrences.
- **Archi** proves that a small fixed notation plus images and label expressions covers most needs.
- **Bizzdesign's** colour and label views are the clearest precedent for lenses.
- Nobody derives notation from relationship **meaning**. Connectome can, because the semantic kinds exist ([ADR-010](../06-decisions/ADR-010-semantic-base-types.md)).

## 10. Storage and engine

| Item | Where | Edit |
|---|---|---|
| Glyphs, renditions, style rules, markers, lenses, stencils, patterns, zones | New `notation` section of the metamodel package; per-type `renditions`, `glyph`, `hue` on object types | Metamodel edits, versioned and migrated (renaming a rendition key maps occurrences) |
| A user's own lenses | User preferences, outside the change log | Not a model change |
| `rendition` on an occurrence | Occurrence row (null = default) | `updateOccurrence` with its inverse |
| Zone placement | The zone is an annotation; the effect is `setProperties` in the same change | One change, one undo step |
| Category and level rule endpoints | Relationship `rules` | Metamodel edits |

The engine stays pure: style rules and markers are evaluated in the web app (and by export), never by the server. Validation and rule checks stay in the engine.

## 11. Slices

| Slice | Delivers | Needs |
|---|---|---|
| **N-1** | Glyph sprite and the default set by category; line notation from kinds; glyphs in explorer, tabs and palette | Nothing new |
| **N-2** | Renditions (box, card, glyph, chip, container); per-occurrence switch; semantic zoom | N-1 |
| **N-3** | Style rules and markers on types and diagram types; legend with counts | Query filter parser (M1) |
| **N-4** | Lenses (repository and personal) on diagrams, catalogues, explorer | N-3 |
| **N-5** | Stencils and patterns; save selection as pattern | N-2 |
| **N-6** | Zones | N-5 |
| **A-1** | Metamodel editor: connection matrix, sentences, try-it | M1 metamodel stream |
| **A-2** | Metamodel map; learn from data; category and level rule endpoints | A-1 |
| **A-3** | Notation studio (glyph editor, rendition and rule previews) | N-3, A-1 |

N-1 and A-1 are the highest value per effort: every diagram and the explorer get a recognisable language at once, and model owners can see and change the rules without editing JSON.

## Sources

- Sparx EA shape script examples (conditional `HasTag`): <https://sparxsystems.com/enterprise_architect_user_guide/17.2/example_scripts.html>
- Ardoq metamodel constraints: <https://help.ardoq.com/en/articles/425853-how-to-define-enforce-and-manage-metamodel-constraints>; metamodel editor: <https://help.ardoq.com/en/articles/44143-how-to-edit-a-metamodel>
- SAP LeanIX meta model configuration: <https://docs-eam.leanix.net/docs/configuration>; relation types: <https://updates.leanix.net/announcements/manage-relation-types-in-meta-model-configuration>
- Archi 4.9 specialisations and images: <https://www.archimatetool.com/?p=2538>; label expressions (Archi 4.7): <https://www.archimatetool.com/blog/2020/07/01/archi-4-7/>
- MEGA HOPEX Studio, diagram configuration: <https://doc.mega.com/hopex-v4-en/MTS2/Customizing_Diagrams/MetaStudio_DiagramConfig.Configuring_Diagrams.html>
- Visual Paradigm stereotypes: <https://s.visual-paradigm.com/guide/mastering-uml-stereotypes-the-ultimate-guide-to-customizing-and-extending-class-diagrams/>
