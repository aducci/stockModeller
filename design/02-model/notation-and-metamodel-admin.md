# Notation and metamodel administration

How an object looks, and how a model owner sets the rules behind the tool. Builds on the [metamodel](metamodel.md), [diagrams](diagrams-and-catalogues.md) and the [semantic layer](semantics.md) ([ADR-010](../06-decisions/ADR-010-semantic-base-types.md)).

Status: **accepted** (decisions N1–N20 in the [decision log](../decision-log.md#notation-decisions), 2026-10-06). Built so far: slices N-1 (the default glyph set and lines from kinds) and N-2 (renditions and semantic zoom). Example package section: [example-notation.json](../05-structures/example-notation.json). Rendered icon set and admin mockups: [Notation Studio](https://claude.ai/artifact/VGwsxvR79zbkJbuDGsKcfS).

## 1. The idea in one table

| Layer | Question it answers | Set by | Changes the model? |
|---|---|---|---|
| **Glyph** | What is the tiny picture for this kind of thing? | Type, or its semantic category by default | No |
| **Rendition** | What form does an occurrence take: box, card, icon, chip, container, compartments? | Type (several per type), chosen per occurrence | No |
| **Anchors, ports** | Where do lines attach, and may a point stand for an interface? | Rendition; a user may add one to an occurrence | No (a port is an existing object) |
| **Compartment** | What is listed inside the symbol: properties, related objects, a payload? | Rendition | No (rows are facts that already exist) |
| **Style rule** | How does the look change with the object's data? | Type, diagram type, lens | No |
| **Marker** | What should the reader be warned about, at a glance? | Type, diagram type, lens | No |
| **Decoration** | What is this property's value, as a colour, icon, gauge or ring? | Type, diagram type, lens | No |
| **Lens** | Which way of looking at this diagram right now? | Repository or user; switched at view time | No |
| **Stencil, pattern, zone** | What can be put on a diagram, and what does placing it mean? | Diagram type | Yes, through normal changes |
| **Rules** | Which connections are allowed across which types? | Metamodel (§10) | Validated by the engine |

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

**Where the default set lives.** The glyph paths, the category defaults and the kind line defaults ship with the product (`packages/model/src/notation.ts`), because they are part of what the semantic layer means, not of any one package. A package overrides them in its own `notation` section from slice N-3; Essentials carries none, so it draws entirely from its kinds and categories (**1.3.0**: the hand-set `line` on every relationship type and the hex `fill` on every object type are gone, since both fought the semantics and neither followed the theme).

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
- **Built in slice N-2:** the five built-in renditions `box`, `card` (3 property rows: the values that are set, in the type's order, list values by label with their colour), `glyph`, `chip` and `container`, in `RENDITIONS` in `packages/model/src/notation.ts`. The occurrence's `style.rendition` holds the key (absent = `box`); switching runs one change of `styleOccurrence` plus `moveObjectOccurrence` to the rendition's size, so one undo restores both. A diagram type's `renditions` sets `default` and `semanticZoom`; with none, below 40 % every occurrence is a glyph whose name keeps its on-screen size. An occurrence with others nested inside it keeps its form at any zoom. The editor zooms from 25 % to 200 % (buttons, `+`/`-`/`0`, Ctrl/⌘ + wheel). Per-type renditions with their own `fields`, shapes and sizes come with the package `notation` section in N-3.
- **Shapes** stay parametric: the built-in shapes (`rect`, `roundRect`, `ellipse`, `hexagon`, `cylinder`, `person`, plus `tab`, `chevron`, `pill`, `document`, `note`, `parallelogram`) are functions of width and height, so they resize without distortion. A package can add a custom outline as a path on a 100×100 box with a `corner` inset that does not stretch.

## 5. Geometry: anchors, stretching and label zones

Three things decide whether a diagram looks drawn or generated: where lines attach, what happens when a symbol is resized, and where the label sits. All three are set per rendition, so a model owner tunes them once.

### 5.1 Anchors (connection points)

A rendition declares an **anchor set**: the positions a line may attach to. Routing, auto-layout and manual connecting all snap to them, so lines meet symbols squarely instead of aiming at a centre point.

| Anchor set | Positions | For |
|---|---|---|
| `sides` (default) | The midpoint of each side, 4 anchors | Boxes and cards |
| `sides:n` | `n` evenly spaced anchors per side (`sides:3` gives 12) | Dense diagrams; integration pictures |
| `corners` | 4 sides + 4 corners | Containers, zones |
| `ring:n` | `n` anchors evenly around the outline (ellipses, hexagons, custom paths) | Round and irregular shapes |
| `named` | Anchors the package places itself, each with a key, a position in shape space (0–1 in each axis), a side and an optional label | Framework notations, ports (§5.2) |
| `free` | Anywhere on the outline | Freehand diagrams; set per diagram type |

```json
"renditions": { "application": [ { "key": "box", "anchors": "sides:3", "anchorPolicy": "nearest" } ] }
```

- `anchorPolicy` says what a line does when it has a choice: `nearest` (default: the anchor closest to the other end), `fixed` (the anchor the user chose stays put when either symbol moves) or `distribute` (several lines on one side spread across that side's anchors, in the order their other ends appear, so parallel lines never overlap).
- A relationship occurrence stores `sourceAnchor` and `targetAnchor` only when the user pinned one; otherwise routing picks per redraw. Pinning is an occurrence edit with an inverse, so it undoes like anything else.
- A user may add an anchor to **one occurrence** (`Add connection point`, or Alt-click on the outline): it is stored on that occurrence, named by the user, and is offered to lines like any other. It changes nothing in the model and nothing on the type.
- A model owner may **promote** an occurrence's anchor to the rendition ("Add to the Application box"), which is a metamodel edit.
- Fixed anchor counts are what makes orthogonal routing cheap: the router works on a small graph of anchor points and lane corridors rather than searching the whole canvas, and a 2,000-occurrence diagram re-routes in one frame.

### 5.2 Ports: anchors that mean something

An anchor can be **bound to an object**: an interface, an endpoint or a queue drawn as a small square on the parent's edge. Binding is by a path from the parent (`-composedOf-> type:interface`), so ports are model facts shown as geometry, not a separate concept to maintain.

```json
{ "key": "portsOnTheEdge", "anchors": "named", "ports": { "path": "-composedOf-> type:interface", "side": "auto", "size": 10, "label": "{name}", "labelAt": "outside" } }
```

- Drawing a line to a port connects to the **port's object**, not the parent, so a call to *Claims API* is a call to the interface, exactly as the semantic layer wants.
- `side: "auto"` places each port on the side nearest the thing it connects to, which keeps crossings down; `side` can also be fixed per port (`in` on the left, `out` on the right) by a property or a flow's direction.
- With no port rendition, the same interfaces draw as ordinary nested or separate symbols. Ports are a view choice.

### 5.3 Stretching: shapes that survive resizing

Every shape is a **function of width and height**, never a bitmap or a scaled path:

| Shape family | Resizes by |
|---|---|
| `rect`, `roundRect`, `pill`, `ellipse` | Parameters: the corner radius stays constant, so a 400 × 48 box has the same corners as a 130 × 48 one |
| `hexagon`, `chevron`, `parallelogram`, `tab`, `document`, `note` | A fixed inset (the slant, the tab, the fold) in pixels, with the straight part stretching |
| `cylinder` | Fixed ellipse height, stretching body |
| Custom path | **Nine-slice**: the package marks a corner inset, and only the middle bands stretch |

Each rendition declares `minSize`, `maxSize` and a `grow` rule:

| `grow` | Behaviour |
|---|---|
| `free` | The user resizes in both axes (default for boxes and containers) |
| `width` | Height is fixed by the content (cards, chips, compartment shapes), width is free |
| `fit` | Both axes follow the content: the symbol grows when a compartment gains a row, never clips |
| `locked` | Fixed size, the glyph rendition's default |

`aspect` may lock a ratio (icons, framework figures). Dragging a corner with Shift locks the current ratio whatever the setting, and auto-layout respects `minSize` so generated diagrams never produce unreadable symbols. The glyph never stretches: it is drawn at a fixed size in its slot, however wide the symbol.

### 5.4 Label zones

A rendition says **where** a label sits, not only what it says:

| Zone | Draws | Default for |
|---|---|---|
| `centre` | Centred, wrapped to the shape's inner box | Box |
| `header` | A bar at the top, left-aligned beside the glyph | Card, container, compartment shapes |
| `below` | Outside, under the symbol, centred | Glyph rendition, ports |
| `inlineGlyph` | On one line beside the glyph | Chip |
| `edge` | Along a side (useful on zones and lanes) | Zones |

Each zone carries `align`, `wrap` (`wrap`, `ellipsis`, `shrink`: shrink drops one step of the type scale before wrapping), `maxLines` and `padding`. Text never silently clips: when it cannot fit, the symbol shows the ellipsis and the full name on hover, and `grow: fit` resizes instead. Relationship labels keep their own placement (`atSource`, `middle`, `atTarget`, with an offset), so verbs sit where they read.

## 6. Compartments: attributes, operations and related objects

> *"shapes support UML in that like a class has attributes — is this just related elements displayed in a consumable and dynamic way?"*

Both, and that is the point. A **compartment** is a strip inside a symbol whose rows come from one of three sources. Nothing new is stored: a compartment is a view over facts that already exist.

| `source` | Rows are | UML analogue |
|---|---|---|
| `properties` | The object's own properties, by group or by an explicit list | Attributes that are values (`status: Active`) |
| `related` | Objects reached by a path query, e.g. `-composedOf-> type:attribute` | Attributes and operations that are model elements in their own right |
| `payload` | The payload of a flow or an interaction's messages | Message contents |

```json
{ "key": "class", "form": "compartments", "grow": "fit", "label": { "zone": "header" },
  "compartments": [
    { "name": "Attributes", "source": "related", "path": "-composedOf-> type:attribute",
      "row": "{name}: {dataType}", "sort": "rank", "max": 12, "empty": "hide", "editable": true },
    { "name": "Operations", "source": "related", "path": "-composedOf-> type:operation", "row": "{name}({signature})" },
    { "name": "Lifecycle", "source": "properties", "group": "lifecycle", "row": "{label}: {value}" }
  ] }
```

| Behaviour | Rule |
|---|---|
| **Live** | Rows follow the model. Adding an attribute object anywhere (explorer, catalogue, another diagram) adds the row on every diagram that shows the class |
| **Editable** | With `editable: true`, typing a row creates the related object and its relationship in one change; deleting a row deletes the relationship (and offers the object). The rules decide what may be typed, so a compartment cannot create something the metamodel refuses |
| **Overflow** | `max` rows, then "+7 more", which expands in place. `sort` by rank (the explorer's order), name or a property |
| **Empty** | `hide` (the strip disappears), `show` or `placeholder` ("No attributes") |
| **Not a second model** | A row is the related object. Selecting it selects that object; its properties panel is the object's. There is no duplicate to keep in step |
| **Collapse** | Each compartment collapses per occurrence (stored on the occurrence), so one diagram can show signatures and another only names |

This is how a UML-ish class, an ArchiMate element with nested behaviour, a data object with its fields and an API with its operations are all the same rendition with different paths. The semantic layer already distinguishes the cases: `composition` for intrinsic parts, `containment` for structure, `access` for what is read or written.

## 7. Style rules: occurrences change with properties

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

## 8. Markers and property decorations

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

### 8.1 Decorations: rendering any property onto a shape

A marker says *something is true*. A **decoration** shows *what a property's value is*, in a form the eye reads faster than text. Any property can be drawn on or over a symbol, in a configurable slot, with one of a small set of forms:

| `as` | Draws | Suits |
|---|---|---|
| `swatch` | A filled square or a tinted band along one edge | List properties (status, criticality) |
| `dot` | A filled circle in the value's colour; `dot.outline` when the value is "none" | Any list property; the compact form for dense diagrams |
| `pips` | n of m filled pips | Short ordered scales: level, fit 1–5 |
| `gauge` | A horizontal bar, filled to the value, over a track | Percentages, scores, budget used |
| `ring` | A circular gauge, filled clockwise; the value in the middle when there is room | Percentages where a bar does not fit (glyph and chip renditions) |
| `icon` | A glyph chosen by the value, from the **value list's icon map** | States with established symbols (cloud, lock, warning) |
| `text` | The formatted value, in the type scale's small size | Costs, dates, keys |
| `bars` | A micro bar chart over several properties or a history | Trends, cost over scenarios |
| `fill`, `stroke` | The symbol's own fill or outline (this is what a style rule does, listed here so the whole set is in one place) | The headline property of the diagram |

```json
"decorations": [
  { "property": "assessment.technicalFit", "as": "pips", "of": 5, "slot": "bottomLeft" },
  { "property": "data.completeness", "as": "ring", "slot": "topRight", "scale": { "min": 0, "max": 100 },
    "colour": [ { "below": 50, "tone": "error" }, { "below": 80, "tone": "warning" }, { "tone": "ok" } ] },
  { "property": "lifecycle.status", "as": "swatch", "slot": "leftEdge" },
  { "property": "technical.hosting", "as": "icon", "slot": "topRight" },
  { "property": "cost.runCost", "as": "gauge", "slot": "bottom", "scale": { "min": 0, "max": 500000 }, "label": "{value:€0k}" }
]
```

| Rule | Why |
|---|---|
| **Value lists carry their own icons and colours.** A list value already has a key, a label and a colour ([metamodel §3](metamodel.md#3-property-types)); it gains an optional `glyph` from the glyph set. One definition then drives chips, catalogue cells, legends, markers and decorations | A state looks the same everywhere, and adding a value never means editing six places |
| **Scales come from the property type.** A number property type may declare `scale` (min, max, unit, and bands with tones). Gauges, rings and heat gradients use it, so "what is a high run cost?" is answered once | No per-diagram magic numbers |
| **Slots are shared with markers**, plus `leftEdge`, `rightEdge`, `topEdge` and `bottomEdge` for bands, and `inline:<compartment>` to put a decoration on a compartment row (a dot beside each attribute, for instance) | One placement model to learn |
| **Budget per rendition.** A box takes 3 decorations, a card 6, a chip 1, a glyph 1 (plus markers); more are dropped in order with a note in the editor | A symbol that carries ten dials is unreadable, and the limit says so before the diagram does |
| **Never colour alone.** A decoration that encodes a state uses shape or position as well as hue, and every decoration has a tooltip with the property's name and value, so the diagram meets the accessibility rule in the [design system](../04-ux/design-system.md#5-accessibility) | Colour-blind readers and printed diagrams |
| **Zoom aware.** Below the band where a rendition switches to `glyph`, only the first decoration is drawn | Dense landscapes stay readable |

Decorations are evaluated like style rules, with the same cascade and the same memoisation, and can be bundled into a lens: "Data quality" is a lens that adds a completeness ring and an owner marker to every symbol without touching any diagram.

## 9. Lenses, stencils, patterns and zones

### 9.1 Lenses: switch how you look, not what you drew

A **lens** is a named bundle of style rules, markers and a legend that a viewer switches on at view time, from a picker on the diagram toolbar. It changes nothing in the diagram. "Lifecycle", "Run cost heat", "Ownership gaps", "Semantic level", "Changes in scenario Target 2027" are lenses. Lenses live in the repository (shared, versioned with the metamodel) or are a user's own. A diagram may save a default lens; links can carry one (`?lens=lifecycle`). The same lenses apply to catalogues (cell colour, markers in the name column) and the explorer (glyph colour).

### 9.2 Stencils: what the palette offers

A diagram type's palette is organised in **stencils**: named sections listing object types (each with the rendition it drops as, and optional preset properties: "Application · SaaS · Active") and patterns. Without stencils, the palette lists the allowed types grouped by category, as today.

### 9.3 Patterns: stencils that contain occurrences

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

### 9.4 Zones: placing something means something

A **zone** is a diagram region (lanes, a grid or a single frame) whose areas say what they accept and what placing an occurrence there **sets**. Drop an application in the "Phase out" lane and its `lifecycle.status` becomes `phaseOut`, as one change with its inverse. Lanes can be generated from a list property's values, so a roadmap board or a fit/criticality quadrant is a zone, not a special view. Zones are annotations in the model sense (they own no facts), but their effect is a model edit, which the toast states: "Status set to Phase out · Undo".

## 10. Administering the metamodel

The [metamodel editor](../04-ux/screens.md#6-metamodel-editor-admins) gets four ways into the same rules. They are views of one draft; every edit lands in the pending metamodel version and publishes with a migration preview ([metamodel §7](metamodel.md#7-versions-and-packages)).

### 10.1 The metamodel map

A diagram of the metamodel itself: object types as nodes (their glyph and hue), grouped by category or layer; each **relationship rule** an edge labelled with the relationship type's verb, styled by its kind (§3). Drawing a line between two types adds a rule: a picker offers the relationship types, kinds first that make sense for the pair (an `access` toward an information type, a `realisation` from a more concrete level). Selecting an edge opens block/warn and cardinality. Edge thickness shows how many relationships use the rule; a red dashed edge is a combination **in use but not allowed** (found in data), with **Allow** and **Show the 12 relationships**. The map is the onboarding picture: a new modeller sees the language on one page.

### 10.2 The connection matrix

Rows are source types, columns target types. A cell holds one coloured dot per allowed relationship type (the kind's colour; hollow for `warn`). Clicking a cell opens checkboxes for every relationship type, so "what may connect Application to Data object?" is answered and changed in one place. The pivot **by relationship type** gives the per-type source × target grid already in the screens spec. Filters: by kind, by category, "only cells with violations", "only unused rules". Category and wildcard rules (§10.5) show as inherited, lighter dots that can be overridden per cell.

### 10.3 Sentences

The same rules as a list of sentences, the way the model reads: *Application · serves · Process*, *any component · accesses · any information*. A sentence bar with autocomplete adds rules by typing; pasting a column of sentences (or a CSV) previews and adds them in bulk. Each sentence shows usage and violation counts, and the rule's enforcement as a chip.

### 10.4 Try it

A sandbox panel: pick (or drag in) two types and see exactly what a modeller will get: the connect menu in order, what dropping one inside the other offers, the line each choice draws, and the reason for anything refused ("*Server* can't be placed inside *Application*. Allowed: Location"). It answers "why can't I connect these?" before a modeller asks.

### 10.5 Rules that scale

| Addition | Example | Why |
|---|---|---|
| **Category endpoints** | `category:component` *accesses* `category:information` | One rule covers every current and future type in the category; packages combine without listing each other's types |
| **Level conditions** | *realises* only from a more concrete level to a less concrete one (`level: "towardAbstract"`) | Turns the semantic finding into a rule a model owner can tighten to `block` |
| **Learn from data** | "142 relationships use 9 combinations not in the rules" → accept all, accept some, or flag | Brings a messy imported repository under rules without a week of setup (Ardoq surfaces undefined combinations similarly) |
| **Rule presets per kind** | Choosing kind `access` for a new type offers "toward `category:information`" | Good defaults at the moment of creation |

Rule endpoints therefore become: a type key, `*`, an abstract type (inherited through `extends`) or `category:<name>`. The most specific matching rule decides enforcement; the matrix shows which rule a cell inherits from.

### 10.6 Built in slice A-1

- **Where:** a **Metamodel** menu in the top bar (Types, Connection matrix, Rule sentences, Try a connection) opens one *Metamodel* tab with those four views on a strip.
- **Draft:** every edit changes a draft of the relationship rules kept in the browser; a bar says "n changes not published" with *Discard* and *Review and publish…*. The review lists the rules added, removed and changed, and the combinations in use that the new rules would refuse (they stay and are flagged; nothing is deleted).
- **Matrix:** rows and columns are every object type in tree order (an abstract parent such as *Application (any)* above its subtypes). A rule on a parent or on `*` shows as a lighter, inherited dot that can only be changed where it is written. Dots are coloured by kind family: structure (containment, composition, aggregation, specialisation), dependency (realisation, representation, serving, assignment, access, association), behaviour and flow (flow, trigger, interaction), influence; hollow means warn only.
- **Publishing:** `PUT /repositories/{repo}/metamodel/relationship-rules` with the version the draft was edited from (409 if someone published meanwhile; `?preview=true` reports without publishing). It replaces the `relationship` rows of the `rule` table, sets the next patch version and notifies `connectome_metamodel`; every server instance drops its compiled metamodel and asks its open sessions to reload (`resync`).
- **Not yet:** the map, learning from data, category and level endpoints (A-2); editing properties (A-1b, built: §10.6b) and types (A-1c); cardinality is kept but not shown.

### 10.6b Built in slice A-1b: properties

- **Where:** the Metamodel tab gains a **Properties** view, and the **Types** view becomes editable: select an object, relationship or diagram type to see its own properties, the ones it inherits or has built in, and to add or remove them.
- **Properties view:** every property type by group (built-in ones read-only), with how many types carry it and how many items hold a value. A form edits its name, group, data type (fixed while items hold values), unit, how the panel shows it, *required* and help; list properties edit their values (label, colour, order; a value in use cannot be removed); **Used by** ticks the object types (inherited ones shown, ticked and fixed), relationship types and diagram types that carry it. A new property's key follows its group and name until it is published, then it is permanent.
- **One draft:** the whole metamodel (package and diagram types) is the draft; the rule views of A-1 edit the same draft. The review lists properties added, changed and removed, list changes, properties given to and taken from types, rule changes, and the effect on the model.
- **Publishing:** `PUT /repositories/{repo}/metamodel` with the draft and its base version (`?preview=true` to check only; 409 if someone published meanwhile). The server checks the package against its schema, compiles it, and refuses (422) a draft that would break stored data: a type removed while items use it, a data type changed while values exist, a list value removed while in use. It then rewrites the metamodel tables, sets the next patch version and notifies `connectome_metamodel`, as A-1 does.
- **Values are never touched by a publish.** Taking a property from a type keeps the stored values; the review counts them, and the properties panel lists them under *Not on this type* with *Clear*.
- **Panel:** relationships and diagrams now have editable properties too (edits `setRelationshipProperties`, `setDiagramProperties`), so objects, relationships and diagrams all show exactly the properties their type carries.
- **Not yet:** creating, renaming or removing object, relationship and diagram types (A-1c); calculated properties and formulas; moving values from one property to another.

### 10.6c Built in slice U-3: diagram types

- **Where:** *Metamodel › Diagram types*, a view beside Types. The list groups the draft's diagram types by kind (Diagrams, Matrices, Documents, Sequences) with how many diagrams use each, and marks the new and changed ones.
- **New types are copies** (B48): *Duplicate* copies a type with everything it has (template, matrix, symbols) under "… copy" and a key made from the name, so a new type works at once. *Delete* is offered only for a type no diagram uses.
- **Editor tabs:** *General* for every kind (name, description, kind, the element types it can show with their subtypes, every relationship type or a list, and the properties its diagrams carry). Then one tab for the kind: *Notation* for canvases (nesting, drawing existing relationships, the rendition shapes start as, and per element type its shape, fill, width and height); *Matrix* (rows, columns, the relationship and its direction, nesting rows, hiding empty ones, with a count of rows, columns and filled cells on this repository); *Sequence* (what can be a lifeline, which relationships are messages); *Template* (the resolved sections with their locks, read-only until the designer, V-5).
- **Publishing:** the review lists diagram types added, changed and removed, and what existing diagrams still show that their type no longer allows (it stays drawn; no more can be added). A type in use keeps its kind, and the server refuses a publish that changes it. `colourRules`, `labels`, `legend` and `generate` are kept as they are: nothing reads them yet.

### 10.7 Notation studio

The notation lives on the type editor, not in a separate tool:
- **Glyph editor**: a 16×16 grid with snap, line, arc and dot tools, live byte count against the 256-byte budget, preview at 12, 16, 24 and 48 px in both themes; paste or drop an SVG to convert it.
- **Renditions**: a strip of the type's renditions rendered with a real object of the type (or sample data), side by side in light and dark.
- **Rules and markers**: a list with the `when` filter, the effect, and a live count ("matches 37 of 412 applications"), previewed on a sample diagram.

## 11. How leading tools compare

From public documentation, not hands-on testing.

| Need | Sparx EA | Ardoq | SAP LeanIX | Archi | MEGA HOPEX | Bizzdesign | Visual Paradigm | Connectome (this design) |
|---|---|---|---|---|---|---|---|---|
| Custom icons and shapes | Shape scripts per stereotype (a small drawing language) | Icon, colour and shape per component type | Colour per fact sheet type | Specialisation images on any element | Shapes editor | Per-profile shapes | Stereotype icons and fills | 256-byte path glyphs, parametric shapes, theme hues |
| Many representations per object | Alternate images, rectangle vs icon notation | Many visualisations of the same data | Fixed fact-sheet look | Two alternate figures per element type | Shapes per diagram type | Per viewpoint | Per diagram via stereotype display | Any number of renditions per type, chosen per occurrence, plus semantic zoom |
| Style by properties | Shape script conditions on tagged values (`HasTag`); diagram legends that colour by property | Conditional formatting in perspectives | Report views colour by field | Label expressions; scripting | Display by attribute (configured) | Colour and label views | Limited | Style rules with cascade, on objects and relationships |
| Conditional annotations | Shape script decorations | Labels from fields | — | Label expressions | — | Label views | — | Markers with slots, tones, text, legend counts |
| Stencils and patterns | Toolbox profiles; UML patterns | — | — | Palette per viewpoint | Diagram type palettes | Viewpoint palettes | Palettes | Stencils, patterns with bind-to-existing, zones that set properties |
| Connection points | Fixed per shape script | Automatic | Automatic | Fixed per figure | Fixed per shape | Per notation | Fixed per shape | Anchor sets per rendition, per-occurrence anchors, ports bound to objects |
| Compartments | UML compartments, built in | Fields in a table view | Fact-sheet sections | Nested elements | Compartments per metaclass | Nested behaviour | UML compartments, built in | Compartments over properties, related objects or a payload, editable in place |
| Property dials on symbols | Shape script drawing | Conditional formatting | Report colours | Label expressions | Configured display | Colour and label views | Stereotype icons | Decorations: swatch, dot, pips, gauge, ring, icon, text, from value-list glyphs and property scales |
| Rule administration | Quick Linker definitions inside an MDG technology (files) | Metamodel editor; constraints listing every source → reference → target combination as defined in use, unused or undefined | Relations with cardinality per fact sheet type | Fixed by the ArchiMate spec | Metamodel diagram in Studio | Metamodel designer | Profiles | Map, matrix, sentences and try-it over one draft; category rules; learn from data |
| Behaviour from meaning | Per technology code | — | — | ArchiMate rules | Per MetaAssociation | ArchiMate derivation | — | 14 semantic kinds drive defaults for look, gestures, tracing and validation |

What the comparison shows:
- **Sparx** is the most expressive (shape scripts) and the hardest to administer: notation and rules live in a technology file authored outside the model.
- **Ardoq** has the most approachable rule administration (constraints found from data), but its diagrams are generated visualisations with less control over individual occurrences.
- **Archi** proves that a small fixed notation plus images and label expressions covers most needs.
- **Bizzdesign's** colour and label views are the clearest precedent for lenses.
- Nobody derives notation from relationship **meaning**. Connectome can, because the semantic kinds exist ([ADR-010](../06-decisions/ADR-010-semantic-base-types.md)).

## 12. Storage and engine

| Item | Where | Edit |
|---|---|---|
| Glyphs, renditions (with their anchors, growth, label zones and compartments), style rules, markers, decorations, lenses, stencils, patterns, zones | New `notation` section of the metamodel package; per-type `renditions`, `glyph`, `hue` on object types | Metamodel edits, versioned and migrated (renaming a rendition key maps occurrences) |
| Value-list `glyph`, property-type `scale` | The value list and the property type | Metamodel edits |
| A user's own lenses | User preferences, outside the change log | Not a model change |
| `rendition`, size, collapsed compartments and user-added anchors on an occurrence | `rendition` in the occurrence's `style` (absent = the default; built in N-2); the rest in the occurrence row | `styleOccurrence` (and `moveObjectOccurrence` for the size) with their inverses |
| `sourceAnchor`, `targetAnchor` on a relationship occurrence | Occurrence row, set only when the user pinned one | `updateOccurrence` with its inverse |
| A compartment row the user typed | The related object and its relationship | Ordinary `createObject` + `createRelationship` in one change |
| Zone placement | The zone is an annotation; the effect is `setProperties` in the same change | One change, one undo step |
| Category and level rule endpoints | Relationship `rules` | Metamodel edits |

The engine stays pure: style rules, markers, decorations, compartment queries and routing are evaluated in the web app (and by export), never by the server. Validation and rule checks stay in the engine.

## 13. Slices

| Slice | Delivers | Needs |
|---|---|---|
| **N-1** ✅ | Glyph sprite and the default set by category; line notation from kinds; glyphs in the explorer, the palette and on symbols; Essentials 1.3.0 draws from its semantics | Nothing new |
| **N-2** ✅ | Renditions (box, card, glyph, chip, container); per-occurrence switch; semantic zoom | N-1 |
| **N-2a** | Anchors (`sides`, `sides:n`, `ring`), anchor-aware orthogonal routing, pinned and user-added anchors; stretch rules (`grow`, `minSize`, nine-slice) and label zones | N-2 |
| **N-2b** | Compartments: `properties` and `related` sources, overflow, collapse; editing rows in place | N-2a, query paths (M1) |
| **N-3** | Style rules, markers and decorations (swatch, dot, pips, gauge, ring, icon, text) on types and diagram types; value-list glyphs and property-type scales; legend with counts | Query filter parser (M1) |
| **N-4** | Lenses (repository and personal) on diagrams, catalogues, explorer | N-3 |
| **N-5** | Stencils and patterns; save selection as pattern | N-2 |
| **N-6** | Zones | N-5 |
| **N-7** | Ports: anchors bound to objects by a path, `side: auto`, connecting straight to a port | N-2a, N-2b |
| **A-1** ✅ | Metamodel menu and tab: types (read-only), connection matrix, rule sentences, try a connection, over one draft of the relationship rules; review with the effect on existing relationships; publish as the next version, picked up by every open session | Nothing new: the rules are rows of the `rule` table |
| **A-1b** ✅ | Properties: property types and value lists, which object, relationship and diagram types carry them, editable relationship and diagram properties, publishing the whole metamodel with an impact check (§10.6b) | A-1 |
| **A-1c** | Editing types: new object and relationship types, rename, parent, category, level; breaking edits with a migration preview ([metamodel §7](metamodel.md#7-versions-and-packages)) | A-1 |
| **A-2** | Metamodel map; learn from data; category and level rule endpoints | A-1 |
| **A-3** | Notation studio (glyph editor, rendition and rule previews) | N-3, A-1 |

N-2a is the one to build early despite its place in the list: anchors decide how every line on every diagram looks, and retrofitting routing later means redrawing customers' diagrams. N-1 and A-1 are otherwise the highest value per effort: every diagram and the explorer get a recognisable language at once, and model owners can see and change the rules without editing JSON.

## Sources

- Sparx EA shape script examples (conditional `HasTag`): <https://sparxsystems.com/enterprise_architect_user_guide/17.2/example_scripts.html>
- Ardoq metamodel constraints: <https://help.ardoq.com/en/articles/425853-how-to-define-enforce-and-manage-metamodel-constraints>; metamodel editor: <https://help.ardoq.com/en/articles/44143-how-to-edit-a-metamodel>
- SAP LeanIX meta model configuration: <https://docs-eam.leanix.net/docs/configuration>; relation types: <https://updates.leanix.net/announcements/manage-relation-types-in-meta-model-configuration>
- Archi 4.9 specialisations and images: <https://www.archimatetool.com/?p=2538>; label expressions (Archi 4.7): <https://www.archimatetool.com/blog/2020/07/01/archi-4-7/>
- MEGA HOPEX Studio, diagram configuration: <https://doc.mega.com/hopex-v4-en/MTS2/Customizing_Diagrams/MetaStudio_DiagramConfig.Configuring_Diagrams.html>
- Visual Paradigm stereotypes: <https://s.visual-paradigm.com/guide/mastering-uml-stereotypes-the-ultimate-guide-to-customizing-and-extending-class-diagrams/>
