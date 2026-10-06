# Metamodel

The metamodel is the repository's set of **types**:
- object types;
- relationship types;
- property types;
- diagram types.

It also holds the **rules** between them. Model owners edit it in the UI. It is versioned and can be installed from **packages**. Schema: [metamodel.schema.json](../05-structures/metamodel.schema.json); example: [example-metamodel.json](../05-structures/example-metamodel.json).

## 1. Object types

| Field | Notes |
|---|---|
| `key`, `name`, `plural` | `key` is permanent (`application`); `name` can change |
| `extends` | Optional parent type: inherits properties, symbol and rules. `abstract: true` types cannot be instantiated but can be used in rules and queries |
| `layer` | Optional grouping for palettes and colours (Strategy, Business, Application, Data, Technology) |
| `properties` | Property types assigned to this object type |
| `symbol` | Default look on diagrams: shape, fill, icon, default size, label |
| `uniqueName` | `repository`, `folder` or `none` |
| `keyPattern` | Optional auto-numbering, e.g. `APP-{0000}` |
| `defaultFolder` | Where new objects of this type go when created from a diagram |
| `category`, `level`, `levelFixed` | *Proposed.* Semantic category and default level ([semantics §4](semantics.md#4-semantic-categories-and-levels-object-types-and-objects)) |

## 2. Relationship types

| Field | Notes |
|---|---|
| `key`, `name` | |
| `verb`, `inverseVerb` | "serves" / "is served by": the model reads as sentences |
| `nesting`, `singleParent` | See [hierarchies](objects-relationships-properties.md#3-hierarchies-nesting-relationships) |
| `properties` | Property types for relationships of this type |
| `line` | Default look: line style, arrows, colour |
| `rules` | Allowed source → target object types (below) |
| `semantic`, `semanticDirection`, `payload`, `cascadeDelete` | *Proposed.* The semantic kind the type maps to and its options ([semantics §2.2](semantics.md#22-relationship-type-fields-additions-to-metamodel-2)) |

## 3. Property types

| Field | Notes |
|---|---|
| `key`, `name`, `group` | Key format `group.name`, e.g. `lifecycle.status` |
| `dataType` | See [properties](objects-relationships-properties.md#4-properties) |
| `unit`, `valueList`, `objectTypes` | Unit for numbers; value list for list types; allowed object types for references |
| `required`, `default`, `validation`, `help` | `required` only warns, so drafts can be saved; it feeds data-quality scores |
| `formula` | For calculated properties ([rules and calculations](rules-and-calculations.md)) |
| `role` | Lets features find standard properties, e.g. `lifecycle.activeFrom` for roadmaps, `owner` for campaigns |
| `master` | System that owns this value when synced (e.g. `servicenow`); the UI then shows it read-only |

**Value lists** have stable value keys, labels and colours. Renaming a label never breaks data, and the colours drive diagram colouring.

## 4. Diagram types

A diagram type defines a kind of diagram. Every diagram is based on one. It covers:
- which object and relationship types may appear;
- how they look;
- how they are coloured and labelled;
- layout and legend;
- optionally, how diagrams of this type are generated.

Details in [diagrams-and-catalogues](diagrams-and-catalogues.md#3-diagram-types). Schema: [diagram-type.schema.json](../05-structures/diagram-type.schema.json).

## 5. Rules

| Rule | Example | Enforcement |
|---|---|---|
| **Relationship rule** | Application *serves* Process; `*` *located at* Location | `block` (refuse) or `warn` (allow and flag). Optional cardinality, e.g. at most one location |
| **Nesting rule** | Capability *contains* Capability | Same as relationship rules (nesting types are relationship types) |
| **Validation rule** | "Retired applications must not serve processes" | Severity info / warning / error |
| **Calculation** | Total cost = own cost + children's total cost | Calculated property |

Rules support the `*` wildcard and inherit through `extends`. The metamodel editor shows, per rule, how many relationships use it and how many break it.

## 6. Standard property groups (Essentials package)

| Group | Property types | Used by |
|---|---|---|
| Lifecycle | Status (Planned, Active, Phase out, Retired), Active from, Retired from | Roadmaps, "as of" filtering |
| Ownership | Business owner, Technical owner | Data-quality campaigns, permissions hints |
| Assessment | Business fit, Technical fit, Criticality | Heatmaps |
| Cost | Run cost, Total cost (calculated) | Roll-ups, charts |

## 7. Versions and packages

- The metamodel has a version number. Every edit is recorded like any other change.
- **Breaking edits** need a migration that is previewed before it runs:

| Edit | Migration choice |
|---|---|
| Delete an object type | Change existing objects to another type, or delete them (count shown) |
| Delete a property type | Drop the values, or move them to another property type |
| Change a data type | Conversion rule; values that fail are listed |
| Remove a list value | Map it to another value |
| Tighten a rule to `block` | Existing violations are listed and stay flagged until fixed |

### Frameworks are configuration

Connectome has **no framework-specific code**. ArchiMate, BPMN, TOGAF, IT4IT or a customer's own method are all just **packages**: versioned bundles containing
- object, relationship and property types;
- rules;
- diagram types;
- optionally, **exchange mappings** that tell import and export adapters how a standard file format maps onto the package's types (e.g. ArchiMate exchange XML element `ApplicationComponent` → object type `archimate.applicationComponent`).

| Package behaviour | Rule |
|---|---|
| Install | Adds its types under a prefix (`archimate.…`) next to existing ones; nothing is overwritten |
| Combine | Several packages can live in one repository; relationship rules can connect their types |
| Customise | A repository can extend package types (add properties, symbols, rules) without forking the package |
| Upgrade | A new package version produces a migration preview, as for any metamodel change |
| Author | Anyone can create a package by exporting part of a metamodel; packages are plain JSON ([metamodel.schema.json](../05-structures/metamodel.schema.json)) |

Essentials ships first. Every other framework is content, delivered without a product release.
