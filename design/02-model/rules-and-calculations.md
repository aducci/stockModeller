# Rules and calculations

Rules keep the model consistent. Calculations derive values. Both are **configured** in the metamodel and run automatically after every change. Only the objects affected by a change are re-evaluated.

## 1. Relationship and nesting rules

See [metamodel §5](metamodel.md#5-rules). In practice, the diagram editor only offers relationship types that are allowed between the two objects. Catalogues and imports apply the same check.

## 2. Validation rules

```yaml
key: retiredAppsNotServing
when: type:application AND lifecycle.status = retired
check: count(-serves->) = 0
message: "Retired application {name} still serves {count(-serves->)} process(es)."
severity: error            # info | warning | error
```

| Severity | Effect |
|---|---|
| info, warning | Shown in the Problems list and as badges on symbols and rows |
| error | Same, and it blocks approval of change requests. It never blocks editing, so people can fix things step by step |

`when` and `check` use the [query language](../03-platform/queries.md) plus these functions:
- `count`, `sum`, `min`, `max`, `avg`;
- `exists`, `coalesce`, `if`;
- `today()`, `daysBetween`.

## 3. Calculated properties

A property type with a `formula` is read-only and recalculated whenever its inputs change.

| Pattern | Formula |
|---|---|
| Roll-up through a hierarchy | `coalesce(cost.runCost, 0) + sum(-contains->.cost.totalCost)` |
| Count | `count(<-realizes- type:application)` |
| Score | `round((assessment.businessFit + assessment.technicalFit) / 2, 1)` |
| Lookup | `first(<-contains-).ownership.businessOwner` |
| Date check | `if(lifecycle.retiredFrom < today() + 365, "Due", "OK")` |

Limits that keep calculations predictable:
- no circular formulas (checked when the metamodel is saved);
- a traversal depth of at most 5;
- results stored like normal values, so they show in catalogues, exports and queries.

## 4. Derived relationships

A derived relationship is inferred from a path. For example, *Application supports Capability* when the application serves a process that realises the capability:

```yaml
key: appSupportsCapability
derive: application -supports-> capability
from: application -serves-> process <-realizes- capability
store: false        # false: calculated when needed; true: stored and kept up to date
```

- Derived relationships show as dashed lines and in matrices and impact analysis. They cannot be edited.
- A user can **promote** one to a normal relationship.

## 5. Impact analysis

*"What depends on X?"* follows relationships of chosen types in or out, up to N steps, optionally as of a date and in a scenario. Results can be shown as:
- a ranked list (distance and path);
- a generated impact diagram;
- an exportable catalogue.
