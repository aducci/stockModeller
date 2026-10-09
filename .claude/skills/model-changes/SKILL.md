---
name: model-changes
description: Use when adding or changing anything that writes to a Connectome model, such as a new edit type, a rule, a metamodel field, an import or an API endpoint. Covers the change engine, inverses, rules and the design pack.
---

# Changing the model

Connectome has one model, one change engine and many clients. The canvas, the explorer, scripts, imports, the API and AI agents all write the same way, so a feature that writes is built on the engine and never next to it.

## The rules

1. **The model is the fact; views are projections.** An object exists once. A diagram, matrix, document or table refers to it, and an occurrence holds only layout. Never copy model data into a view.
2. **Ids are identity; names are labels.** Refer to things by id. People use `key`, other systems use `externalIds` (`system: id`). Match names only through find-or-create (`packages/engine/src/similar.ts`).
3. **The metamodel is data.** A framework or type-specific behaviour goes into a package (`packages/content`) or the metamodel, never into an `if (type === …)` in code. Behaviour keys off the semantic kind or category (`design/02-model/semantics.md`), not the type's name.
4. **Structural rules block; quality rules advise.** Only the essential rules (`design/02-model/overview.md` §3) refuse a change. Anything else is a finding with a severity. An error finding blocks sign-off, never editing.
5. **Relationships are stored once.** Reverse lookups, traces and counts are derived (`packages/semantics`). Never store them on the object.

## How to add a write

1. **Design first.** Add the edit or field to `design/` in the same change. New edits go in `design/05-structures/changes.ts`, and storage or edit additions go in `design/03-platform/storage.md` §7. Open product questions go in `design/decision-log.md`.
2. **Name the edit for what it does.** Use verb + noun (`renameObject`, `setPayload`, `moveToFolder`), not a generic `update`. A generic patch is only for property values (`setProperties`).
3. **Mirror it.** Copy the edit into `packages/model/src/changes.ts` (the drift test compares everything from the first `import`) and add its Zod schema.
4. **Apply it in the engine only.** Implement it in `packages/engine/src/apply.ts`. The engine stays pure: no I/O, no clock, no randomness beyond what the change carries.
5. **Record an exact inverse.** Every edit pushes the edits that undo it. If the inverse needs information the edit doesn't carry (a deleted value, a confirmation), add it to the edit as an optional field marked `build:`, as `createObject` does. Undo, history, rebase and scenarios all depend on this.
6. **Make it atomic.** A user action is one change, which is one undo step. Several edits that belong together go in one change.
7. **Expose it the same way to everyone.** The web app submits through `@connectome/client`, which uses the same `POST …/changes` that scripts use. A new read endpoint goes into `design/03-platform/openapi.yaml`. A refusal is a problem+json with a stable `code`, a sentence a person can act on, and the ids involved.
8. **Check input once at the edge**, with Zod or JSON Schema, then trust the types inside. No defensive null checks in the engine.

## Before committing

- The inverse property test passes: `packages/engine/test/inverse.test.ts`. Add the new edit to its generators.
- A unit test named after the rule it proves, such as "deleting an object removes its occurrences".
- The drift tests pass, and `design/` says what the code does.
- `npm run check` is green. Database tests need `DATABASE_URL` (see `CLAUDE.md`).
