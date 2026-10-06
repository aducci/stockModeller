# Objects, relationships, properties and folders

## 1. Objects

| Field | Type | Notes |
|---|---|---|
| `id` | ULID | Global, never changes |
| `type` | object type key | e.g. `application` |
| `name` | text (1–200) | Uniqueness configurable per object type: `repository`, `folder` or `none` |
| `key` | text, optional | Human key (e.g. `APP-0042`), unique per object type; can be auto-numbered |
| `folderId` | folder | Exactly one |
| `description` | rich text | |
| `properties` | map of property key → value | Only property types assigned to the object type |
| `tags` | text list | Free labels |
| `externalIds` | map of system → id | For integrations |
| `version` | integer | Increases on every change |
| `created…`, `updated…` | time, user | |

## 2. Relationships

| Field | Notes |
|---|---|
| `id`, `type` | As for objects |
| `sourceId`, `targetId` | Both required; directed. The type gives the reading: *source* **serves** *target*; *target* **is served by** *source* |
| `name` | Optional (the type's verb is shown when empty) |
| `properties`, `tags`, `externalIds`, `version` | As for objects (e.g. an interface's frequency and protocol) |
| `payload` | *Proposed.* Ordered object ids the relationship carries (flows, triggers): *Payment Information* ([semantics §5](semantics.md#5-relationships-carry-meaning-payloads)) |
| `parentId` | *Proposed.* The interaction a message belongs to ([semantics §6](semantics.md#6-interactions-and-their-messages)) |

Any number of relationships, of the same or different types and in either direction, may connect the same two objects: three flows with three payloads are three relationships.

Relationships are full model items. They have IDs, properties, history and comments, appear in catalogues, and are not stored in folders: they belong to their two objects.

## 3. Hierarchies: nesting relationships

Hierarchies are ordinary relationships whose type is marked `nesting: true`. Examples: *Capability **contains** Capability*, *Process **contains** Process step*, *Location **contains** Server*.

| Setting on the relationship type | Effect |
|---|---|
| `nesting: true` | Can be shown by placing an occurrence inside another; used for hierarchy trees and roll-up calculations |
| `singleParent: true` | An object can have at most one parent through this type (a tree, not a network) |
| Rules | Which object types may nest in which (see [metamodel](metamodel.md)) |

Because hierarchy is just a relationship, there is one concept to learn, one way to query it, and as many hierarchies as the metamodel defines: a capability tree and an organisation tree can exist side by side.

*Proposed* ([semantics §3](semantics.md#3-containment-is-the-repositorys-structure)): every nesting type has a semantic kind. **Containment** is the one structural hierarchy: an object has at most one container (across all containment types), it lives in its container's folder, and the explorer shows it inside its container. **Composition** and **aggregation** are hierarchies that move nothing.

## 4. Properties

A property is a value of a **property type** on an object or relationship.

| Data type | Value | Example |
|---|---|---|
| `text` | string | Version = "12.4" |
| `richText` | Markdown subset | Notes |
| `number` | number + unit from the property type | Users = 350 |
| `money` | `{amount, currency}` | Run cost = €120,000 |
| `date` | ISO date | Active from = 2015-04-01 |
| `boolean` | true/false | Internet facing = true |
| `list` | one value from a value list (values have keys, labels and colours) | Status = Active |
| `multiList` | several values from a value list | Regions = EU, US |
| `objectRef` | another object | Primary location = Sydney DC |
| `person` | a user | Owner = Dana Lee |
| `url` | link | Documentation |
| `calculated` | read-only, from a formula | Total cost |

**Property or relationship?** Use a **relationship** when the link matters on diagrams or in impact analysis, or when it needs its own properties. Use an **object-reference property** for simple attributes such as "primary location".

Properties are grouped into **property groups** (Lifecycle, Ownership, Cost…), which only organise the properties panel and catalogue column pickers.

Writing a property the type doesn't have is an **error**, never silently ignored.

## 5. Folders

- A repository has a folder tree. Every **object, diagram, catalogue, query and automation** sits in exactly one folder.
- Typical layout: `Business/Capabilities`, `Applications/Finance`, `Diagrams/Landscapes`, `Catalogues`.
- Folders carry **permissions** (inherited by subfolders) and are the main way to organise ownership.
- Moving an object between folders changes nothing else: its relationships and occurrences stay.
- The explorer also offers **virtual views** that are not folders: *by object type*, *by hierarchy* (nesting relationships) and *saved queries*.
- *Proposed:* a **contained** object moves with its container and cannot be moved to another folder on its own; moving it out of the folder takes it out of its container ([semantics §3](semantics.md#3-containment-is-the-repositorys-structure)).

## 6. Deleting

| Action | Effect |
|---|---|
| Delete an object | Deletes its relationships and removes all its occurrences. A dialog first shows counts and the affected diagrams |
| Delete a container *(proposed)* | Asks whether to keep its contents (they move up a level) or delete them too |
| Delete a whole whose composition type cascades *(proposed)* | Deletes its parts too, listed first |
| Delete a relationship | Removes its occurrences (and, for an interaction, its messages) |
| Delete a folder | Only allowed when empty, or with "delete contents" (shows the impact) |
| Restore | Anything deleted can be restored from history |
