# API

The web app uses the same public API as customers. Base URL: `https://{region}.connectome.app/api/v1`. The contract is in [openapi.yaml](openapi.yaml).

## 1. Conventions

| Topic | Rule |
|---|---|
| Scenario | Every model call takes `?scenario=` (default: baseline) |
| Writes | All model writes go through `POST …/changes` (atomic, labelled). Single-item convenience endpoints (e.g. `PATCH /objects/{id}`) create a one-edit change |
| Versions | Items carry a `version`; edits pass `baseVersion` |
| Safe retries | The client generates the change `id`; resending returns the original outcome |
| Pagination | Cursor-based (`limit`, `cursor`) |
| Errors | RFC 9457 problem+json. `code`: `conflict`, `ruleViolation`, `forbidden`, `notFound`, `invalid`, `gone`. `details[]` give the edit index, property and rule |
| Expansion | `?include=properties,relationships,occurrences` |
| Limits | 600 reads and 120 changes per minute per token; bulk metered separately |

## 2. Resources

| Resource | Endpoints |
|---|---|
| Repositories | `GET/POST /repositories` · `GET/PATCH /repositories/{repo}` |
| Folders | `GET /repositories/{repo}/folders` (tree) · `GET …/folders/{id}/contents` |
| Metamodel | `GET …/metamodel` · `POST …/metamodel/changes` (with migration preview) · `POST …/metamodel/packages` |
| Objects | `GET …/objects?q=` (query language) · `GET …/objects/{id}` · `…/{id}/relationships` · `…/{id}/occurrences` · `…/{id}/history` |
| Relationships | `GET …/relationships?type=&source=&target=` · `GET …/relationships/{id}` |
| Changes | `POST …/changes` · `GET …/changes?since={seq}` · `POST …/changes/{id}/undo` |
| Diagrams | `GET …/diagrams/{id}` (with occurrences and annotations) · `GET …/diagrams/{id}/render?format=svg\|png\|pdf` · `POST …/diagrams/{id}/regenerate` |
| Diagram types | `GET …/diagram-types` · `GET/PUT …/diagram-types/{key}` |
| Catalogues | `GET …/catalogues/{id}/rows` · `GET …/catalogues/{id}/export?format=xlsx` |
| Queries | `POST …/query` (ad hoc + aggregation) · `GET/POST …/queries` |
| Scenarios | `GET/POST …/scenarios` · `POST …/scenarios/{id}/compare?with=` · `…/propose` · `…/merge` |
| Change requests | `GET/POST …/change-requests` · `POST …/change-requests/{id}/submit\|approve\|reject\|apply` |
| Comments | `GET/POST …/comments?anchor=` |
| Import / export / bulk | `POST …/imports` (returns a preview) · `POST …/imports/{id}/apply` · `POST …/exports` · `POST …/bulk` (NDJSON upserts, `preview=true`) |
| Automations *(hosted runtime, later)* | `GET/POST …/automations` · `POST …/automations/{id}/runs` · `GET …/runs/{id}` |
| Webhooks, admin | `/webhooks` · `/members` · `/groups` · `/grants` · `/policies` · `/audit/export` |

## 3. Example: one change

```http
POST /api/v1/repositories/01J…R/changes?scenario=01J…T27
{
  "id": "01J9Z3K2Q7V6B5N4M3L2K1J0HG",
  "label": "Replace Legacy CRM with Cloud CRM",
  "edits": [
    { "edit": "createObject", "id": "01J…NEW", "type": "saasApplication", "name": "Cloud CRM", "folderId": "01J…APPS",
      "properties": { "lifecycle.status": "planned", "lifecycle.activeFrom": "2026-07-01" } },
    { "edit": "setProperties", "id": "01J…OLD", "baseVersion": 12,
      "set": { "lifecycle.status": "phaseOut", "lifecycle.retiredFrom": "2027-03-31" } },
    { "edit": "createRelationship", "id": "01J…REL", "type": "serves", "sourceId": "01J…NEW", "targetId": "01J…PROC" }
  ]
}
```

```http
201 Created
{ "seq": 1042, "changeId": "01J9Z3K2Q7V6B5N4M3L2K1J0HG",
  "versions": { "01J…NEW": 1, "01J…OLD": 13, "01J…REL": 1 },
  "findings": [ { "rule": "retiredAppsNotServing", "itemId": "01J…OLD", "severity": "warning", "message": "…" } ] }
```

A `202 Accepted` with `heldInChangeRequest` means a governance policy held the change for review.

## 4. Live updates

Connect to `wss://…/api/v1/live?repository=&scenario=&since=`. Messages are defined in [changes.ts](../05-structures/changes.ts) (`ClientMessage`, `ServerMessage`).
