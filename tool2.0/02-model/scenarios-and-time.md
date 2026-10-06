# Scenarios and time

Two separate questions, two simple mechanisms:

| Question | Mechanism |
|---|---|
| *When* does something exist? | **Lifecycle properties** + **"as of" date** |
| *What if* we did it differently? | **Scenarios**: branches of the repository |

## 1. Lifecycle and "as of"

- Object types can use the Lifecycle group: Status (Planned → Active → Phase out → Retired), Active from, Retired from.
- Any diagram, catalogue or query can be viewed **as of a date**. Objects not active then are hidden or faded (a diagram-type setting).
- Roadmaps draw bars straight from these dates.

This covers most current- and future-state needs inside one plan, without copying anything.

## 2. Scenarios

A scenario is a named branch of the whole repository. The **baseline** is the main scenario.

```
Baseline ──●──────●────────●──────▶
            \               ▲
             Target 2027 ─●─┘  merged after approval
              \
               Option B ─●     kept for reference
```

| Topic | Rule |
|---|---|
| Identity | An object has the **same id in every scenario**. A scenario stores only what it changed: new, edited or deleted objects, relationships and occurrences |
| Reading | A scenario shows its own changes; everything else comes from its parent (and the parent's parent) |
| Writing | Edits go to the scenario you are in. Later baseline edits still show in the scenario, unless the scenario changed the same property (then it is a conflict at merge) |
| Depth | At most 3 levels (baseline → scenario → sub-scenario) |
| Diagrams and catalogues | Belong to the repository and **show whichever scenario you are in**. "Claims landscape" opened in Target 2027 shows the target |
| Permissions | Can be set per scenario (e.g. the programme team edits Target 2027 but not the baseline) |
| States | Draft → Proposed (a change request is opened) → Approved → Merged (read-only), or Archived |

## 3. Compare

Compare any two scenarios to see:
- objects and relationships added, removed and changed, with property-level differences;
- diagrams side by side or overlaid (green added, red removed, amber changed);
- catalogues with difference columns.

## 4. Merge

Merging applies a scenario's changes to its parent as one change (undoable, audited):

| Situation | Result |
|---|---|
| Only the scenario changed the property | Applied |
| Both changed it, to different values | Conflict: the reviewer picks per property (default: the scenario's value) |
| The scenario deleted something the parent has since edited | Conflict: keep or delete |
| The scenario links to something the parent has since deleted | Conflict: drop the relationship or restore the object |
| The result breaks a `block` rule | The merge waits until it is fixed |
