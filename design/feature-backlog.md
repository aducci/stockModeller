# Feature backlog

Ideas asked for but deliberately not built yet, kept here for discussion. Each says what was asked, why it waits, and what to settle first. When one is picked up it becomes a slice in the [build plan](build-plan.md) and its decisions go in the [decision log](decision-log.md).

## Default folder for new objects, by type (asked October 2026)

**Asked:** the metamodel administers a default path per object type: when someone adds a new object, it is stored in that folder, or in the contextual location (for example the folder of the diagram it was drawn on).

**Why it waits:** the better shape may be rules that place objects conditionally ("applications owned by Claims go under Claims / Applications"), not one fixed path per type. Building a fixed path first could leave a second mechanism to migrate.

**To settle first:**
- Placement rules: what a condition may test (type, level, a property, the diagram or folder it was created from, the person), and which rule wins when several match.
- Context versus default: does drawing on a diagram in folder X beat the type's default, and can a rule say so?
- What happens to existing objects when a rule changes: nothing (like publishing today) or an offered move.
- Where it lives: the metamodel package (published with the rest) or repository settings.

Today: an object type can already name a `defaultFolder` (a path of folder names) in the package (B19), but only the diagram editor uses it (else the diagram's folder) and the metamodel tab cannot edit it. The explorer and the object viewer put a new object in the chosen folder; *New ▸* views and child diagrams go in the object's folder.

## Manage reviews (asked October 2026)

**Asked:** a *Manage reviews* menu item. A review is started over a set of elements (an object list or list view, such as the object viewer's), by someone with permission to start reviews; each reviewer who signs in sees the reviews waiting for them, gives feedback per element, and the initiator sees the results.

**Why it waits:** it needs sets of elements that can be saved and shared (list views, V-6), permissions to start a review, and a notion of reviewers who may not otherwise edit the model. The properties panel's Review mode was removed meanwhile (B61); the engine's confirmations (`confirmProperties`, `setConfirmations`, migration 007) stay as the record of what was confirmed.

**To settle first:**
- What a review is stored as (its own table, or a diagram of kind `list` with a review definition), and whether feedback is per property, per element or both.
- Who may start one and who may answer; due dates and reminders.
- What finishing a review does: confirms the values (today's confirmations), records comments, or both.
