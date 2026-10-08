# Structures

The machine-checkable version of [02-model](../02-model/overview.md). Everything here is validated:
- TypeScript with `tsc --strict`;
- JSON examples against their schemas, plus reference checks (every type, property, folder, object and relationship used exists);
- [schema.sql](../03-platform/schema.sql) loaded into PostgreSQL 16, with scenario reads tested;
- [openapi.yaml](../03-platform/openapi.yaml) with an OpenAPI validator.

| File | Contents |
|---|---|
| [model.ts](model.ts) | Repository, scenario, folder; object, relationship and property types; objects, relationships, properties; diagrams with object and relationship occurrences and annotations; catalogues and other views; comments; change requests |
| [changes.ts](changes.ts) | Every edit, changes, rejections, and the live-connection messages |
| [sdk.d.ts](sdk.d.ts) | SDK: `connect()` for scripts anywhere (launch), `runAutomation()`, the automation module contract, panels (later) |
| [example-automation.ts](example-automation.ts) | "Retire application" automation |
| [metamodel.schema.json](metamodel.schema.json) | Schema for a metamodel or package |
| [core-metamodel.json](core-metamodel.json) | The core package every repository has: the semantic property types (`semantic.level`, `access.mode`, `influence.effect`, `interaction.*`) and their value lists ([semantics §4.3](../02-model/semantics.md#43-the-core-package)) |
| [example-metamodel.json](example-metamodel.json) | "Essentials" package 1.1.0: 12 object types (one abstract), 13 relationship types, each mapped to a semantic kind (*contains* is the containment), property types, value lists, rules, and an ArchiMate exchange mapping |
| [diagram-type.schema.json](diagram-type.schema.json) | Schema for diagram types |
| [example-diagram-type.json](example-diagram-type.json) | "Application landscape", including a generation rule |
| [example-notation.json](example-notation.json) | *Not validated yet:* the `notation` section of a package: 27 glyphs, value-list glyphs and property scales, category and kind defaults, seven renditions of Application (anchors, ports, growth, label zones, compartments, decorations), style rules, markers, lenses, stencils, a pattern and a zone ([notation](../02-model/notation-and-metamodel-admin.md)) |
| [example-repository.json](example-repository.json) | A small repository: folders, objects, relationships, a Target 2027 scenario, a view of every kind (the Claims landscape, where Claims Manager occurs twice; a matrix; Claims Manager's context, high-level design and *Pay a claim* sequence; the Payments API integration specification), one catalogue |

**Naming in code:** an object is `ModelObject`, because `Object` is reserved in TypeScript.
