# Automation and extensions

**Principle: the cheapest, easiest path first.** Automation is **API-first**. Anything that can call HTTPS can automate Connectome:
- a Python notebook;
- a PowerShell script;
- a CI pipeline;
- a serverless function;
- a low-code tool (Power Automate, n8n, Zapier).

We host nothing at launch. A hosted runtime comes later, on the same contract.

Most everyday needs don't need code at all:
- [rules and calculations](../02-model/rules-and-calculations.md);
- [generated diagrams](../02-model/diagrams-and-catalogues.md#4-generated-diagrams);
- [imports](import-export.md).

## 1. Phases

| Phase | What ships | Cost to us |
|---|---|---|
| **Launch** | REST API ([api.md](api.md)) + webhooks + API tokens. Thin SDKs for **TypeScript** and **Python**, generated from [openapi.yaml](openapi.yaml) plus a small hand-written helper layer. Any other language uses the OpenAPI spec directly | Near zero: no compute of ours runs customer code |
| **Later** | "Run in Connectome": upload a script (TypeScript or Python) with parameters, triggers and schedules; it runs in a sandbox on the cheapest suitable runtime (e.g. scale-to-zero container jobs); run reports in the UI | Pay per run; scales to zero |
| **Later** | Panels: custom windows in the workbench (sandboxed iframes) using the same SDK | Static hosting |
| **Later** | Connectors: packaged syncs (e.g. ServiceNow) with property ownership | Worker time |

## 2. The contract (same in every phase)

Every automation, wherever it runs, uses the same rules ([sdk.d.ts](../05-structures/sdk.d.ts)):

| Rule | Why |
|---|---|
| Reads return **read-only snapshots** | Safe to loop over while writing |
| **`change(label, …)` is the only way to write.** One call = one atomic, labelled, undoable change. Large runs are batched automatically | Every automated edit shows in history, can be undone, and respects rules and permissions |
| **Preview** mode collects the edits, discards them and returns the differences | Try before you write |
| **Upsert by key or external ID** | Scripts can be re-run without creating duplicates |
| Tokens are scoped (repository, permission, expiry); secrets stay outside code | No embedded passwords |
| A run returns a **report** (summary, warnings, created/changed/deleted with links) | One clear result, with warnings shown together at the end |

### Running a script anywhere (launch)

```ts
import { connect } from "@connectome/sdk";

const ct = await connect({ url: "https://eu.connectome.app", token: process.env.CT_TOKEN!, repository: "Insurance Group EA" });
const unowned = await ct.model.query("type:application AND NOT exists(ownership.businessOwner)");
await ct.change("Tag applications without an owner", c => {
  for (const app of unowned) c.setTags(app.id, [...app.tags, "needs-owner"]);
});
```

The same module format (`parameters` + `run(ctx)`, see [example-automation.ts](../05-structures/example-automation.ts)) can be run locally with `runAutomation(module, options)`. Later it can be uploaded to the hosted runtime unchanged.

### Triggers without hosting

| Need | Launch solution |
|---|---|
| React to changes | Webhook (filtered by query) → the customer's function → API |
| Schedule | The customer's scheduler (cron, CI, serverless timer) → API |
| Manual button in the UI | "Call webhook" actions on objects and catalogues (sends the selection) |

## 3. Webhooks

Webhooks can subscribe to:
- committed changes (filtered by a query);
- scenario events;
- change-request events (when change requests ship).

They are signed with HMAC-SHA256 and retried with backoff for 24 hours. Payloads hold IDs and labels; the receiver fetches details through the API (keeps payloads small and permission-checked).

## 4. Later: hosted runtime, panels, connectors

| Feature | Design notes |
|---|---|
| Hosted runtime | Sandbox with CPU, memory and time limits and an outbound host allow-list; scoped token per run; versioned code; typed `parameters` rendered as a form; schedules and change triggers; runs recorded with their report and changes |
| Panels | Manifest `{ id, title, icon, singleInstance, dock }` + web bundle; events `selection`, `change`, `scenario`, `visibility`; writes through `change()`; closing a single-instance panel hides it |
| Connectors | Match rules (external ID, key), property ownership (`master: servicenow` vs `master: connectome`), folder targets, schedule, conflict report. Every run is reviewable and undoable |
