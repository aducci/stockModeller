# Queries

Catalogues, matrices, charts, rules, generated diagrams, automations and the API select objects the same way: with the **query language**. It is a small filter-and-path language, compiled to SQL over the current scenario.

## 1. Search (for everyone)

- One search box (Ctrl+K) covers name, key, description, external ID and tag. Matching is fuzzy on names and full text on descriptions.
- Results are grouped by object type and show the folder path and "occurs on N diagrams".
- Filter chips cover object type, folder, tag, property values, owner, lifecycle and "has problems".

## 2. Query language by example

| Question | Query |
|---|---|
| All applications | `type:application` |
| Applications in a folder (and its subfolders) | `type:application AND folder:"Applications/Finance"` |
| Active applications owned by Dana | `type:application AND lifecycle.status = active AND ownership.businessOwner = @dana` |
| Applications without an owner | `type:application AND NOT exists(ownership.businessOwner)` |
| Processes served by Claims Manager | `type:process AND <-serves- name:"Claims Manager"` |
| Applications serving retired processes | `type:application AND -serves-> (type:process AND lifecycle.status = retired)` |
| Everything inside a capability (any depth) | `<-contains-{1,6} name:"Customer Management"` |
| Top-level capabilities | `type:capability AND NOT exists(<-contains-)` |
| Anything within two steps of an object | `-*-{1,2} id:01J…` |
| Active on 1 January 2027 | `type:application AND activeOn("2027-01-01")` |
| With rule problems | `problems >= warning` |

### Grammar

```
query    := term (("AND" | "OR") term)*
term     := "NOT"? (filter | path | "(" query ")")
filter   := "type:" key | "folder:" path | "tag:" word | "id:" id | "key:" text | "name" op value
          | propertyKey op value | "exists(" (propertyKey | path) ")" | function "(" args ")"
path     := ( "-" relType? "->" | "<-" relType? "-" | "-*-" ) steps? term?
steps    := "{" min "," max "}"
op       := "=" | "!=" | ">" | ">=" | "<" | "<=" | "~" | "in"
```

- `-serves->` follows outgoing relationships and `<-serves-` incoming ones; `-*-` follows any type in either direction.
- Hierarchies are ordinary nesting relationships (`-contains->`).
- Special values: `@me`, `@name`, `today()`, `$parameter`.
- Derived relationships can be followed like normal ones.

## 3. Execution

- Paths become joins on `source_id`/`target_id`. `{min,max}` becomes a recursive query with a depth cap (6).
- Results are filtered by permissions; hidden items are counted ("3 hidden").
- Saved queries live in folders and can take parameters.
- **Live queries:** catalogues and dashboards subscribe to their query. After each change, the server works out which rows entered, left or changed, and pushes only those.

## 4. Aggregation

`count`, `sum`, `avg`, `min`, `max`, `distinct`, with optional grouping (by property, type, folder, parent or lifecycle year):

```json
{ "query": "type:application", "groupBy": "assessment.criticality", "measure": { "sum": "cost.runCost" } }
```

## 5. Semantic paths

From [semantics §9.4](../02-model/semantics.md#94-queries). Additions to the grammar, compiled like other paths:

```
path     := ( "-" relSel? "->" | "<-" relSel? "-" | "-*-" ) steps? term?
relSel   := (relType | "@" kind) ("[" relFilter ("AND" relFilter)* "]")?
relFilter := propertyKey op value | "payload:" term
filter   := … | "category:" category | "abstraction:" abstraction
```

| Question | Query |
|---|---|
| What implements this logical service, at any depth? | `<-@realisation-{1,6} id:01J…` |
| What flows into this application? | `type:applicationBase AND -@flow-> name:"Claims Manager"` |
| What systems consume Payment Information (or a representation of it)? | `exists(<-@flow[payload: (name:"Payment Information" OR -@representation-> name:"Payment Information")]-)` |
| Who writes to customer data? | `-@access[access.mode in (write, readWrite)]-> name:"Customer"` |
| Conceptual services nothing realises | `category:service AND abstraction:conceptual AND NOT exists(<-@realisation-)` |

- `@kind` matches every relationship type of that kind, with `semanticDirection: reverse` types turned round, so `-@realisation->` always goes from the concrete to the abstract.
- Interaction messages are flows, so `-@flow->` follows requests and responses; `-@interaction->` follows the interaction itself.

