# Vision

## Problem

Architecture teams must answer questions like these quickly and credibly:
- what runs where;
- who owns it;
- what breaks if we retire X;
- what the target state costs.

Today they use one of three things:

| Today | Why it falls short |
|---|---|
| Drawing tools | Pictures aren't data. The same application on 30 diagrams is 30 unrelated boxes |
| Spreadsheets | Data without structure or visuals; relationships are painful; no future states |
| Traditional EA suites | Sound models, but desktop-first, slow to collaborate, and dependent on custom scripts for everyday needs (rules, generated diagrams, approvals, Excel round trips) |

## Product statement

> Connectome is a browser-based modelling tool where teams build one shared model of objects and relationships. They see that model through diagrams and catalogues, edit it together in real time, and design future states in scenarios. Rules keep the model consistent, with no scripting needed.

## Principles

1. **One fact, one place.** An object exists once. Diagrams, catalogues and scenarios refer to it.
2. **Diagrams show the model.** Every symbol is an object occurrence; every line is a relationship occurrence. Annotations are visibly not model.
3. **Online and together by default.** Live co-editing, presence, comments and history.
4. **Configuration over code.** Rules, calculations, generated diagrams and approvals are configured. Automation is the escape hatch, and it is safe.
5. **Safe changes.** Every change can be undone, audited and reviewed. Destructive actions show their impact first.
6. **Simple surface, deep model.** Newcomers start from a ready-made metamodel; experts can shape everything.
7. **Open and connected.** Full API in any language; interoperability as a strategic investment: XLSX, JSON and ArchiMate at launch, then BPMN, markup formats (Mermaid, PlantUML, DOT) and model-as-code.
8. **Framework-neutral.** Frameworks (ArchiMate, BPMN, TOGAF, in-house methods) are configuration packages on one object model, never special code.
9. **Cheap to run.** Pooled multi-tenant cloud on PostgreSQL alone at launch; dedicated placement only for customers who need it.

## Non-goals

- General-purpose drawing.
- Process execution or simulation.
- Replacing a CMDB (we sync with one).
- Long offline editing.
- A supported on-premise product. Connectome is cloud-based; the architecture stays portable (containers + PostgreSQL + S3-compatible storage), so private hosting remains possible.

## Success measures (12 months after launch)

| Measure | Target |
|---|---|
| Time from new workspace to first useful diagram | < 15 minutes |
| Objects that occur on 2+ diagrams | > 60% of objects on any diagram |
| Customers needing custom scripts for everyday rules | < 10% |
| A co-editor sees a change (p95) | < 300 ms |
