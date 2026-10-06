# Security

## 1. Sign-in and accounts

| Topic | Design |
|---|---|
| Sign-in | OIDC (MVP), SAML 2.0 (v1), e-mail link for small teams |
| Provisioning | SCIM 2.0 users and groups (v1); just-in-time creation with a default role |
| Sessions | HTTP-only cookies; idle timeout (default 12 h); live connections use short-lived tokens |
| API access | Personal tokens and service accounts with scopes and expiry; OAuth client credentials for connectors |
| MFA | Delegated to the identity provider |

## 2. Permissions

**Roles** set the defaults. **Folder permissions** refine them.

| Role | Default | Phase |
|---|---|---|
| Admin | Members, sign-in, metamodel, permissions, all content | Launch |
| Modeller | Create and edit objects, relationships, diagrams and catalogues; create scenarios | Launch |
| Viewer | Read and comment | Launch |
| Contributor | Edit properties of objects they own; read the rest | Next |
| Owner | Billing and plan (with commercial features) | Later |

Plans, seat licensing and billing are not built at launch. The roles above already separate paid editors (admin, modeller) from free readers (viewer, contributor), so licensing can be added without changing permissions.

| Permission scope | Example |
|---|---|
| Folder (inherited by subfolders) | `Applications/Finance`: the Finance architects edit, everyone else reads |
| Scenario | Target 2027: the programme team edits |
| Object type | Only the security team edits `securityControl` objects |
| Repository | Sandbox: everyone is admin |

Levels: `none < read < comment < edit < approve < admin`. The most specific grant wins.

**Hidden objects:**
- Objects a user cannot read appear on diagrams as grey "restricted" symbols: the layout is kept and the name hidden.
- They are left out of query results, with a count ("3 hidden").
- Relationships to them show as restricted stubs, so impact analysis stays honest.

## 3. Data protection

| Concern | Design |
|---|---|
| Tenant isolation | `workspace_id` on every row + database row-level security; automated cross-tenant tests on every endpoint |
| Encryption | TLS 1.2+; storage encrypted at rest; secrets envelope-encrypted per workspace |
| Data residency | Each workspace stays in one region (EU, US, AU), including backups |
| Automations | V8 isolates, no file system, host allow-list, resource limits, a token that expires with the run |
| Panels | Sandboxed iframes, strict CSP, SDK only |
| Input safety | Rich text sanitised; SVG export sanitised; XLSX formula injection prevented |
| Audit | Append-only change log + admin action log |
| Deletion | Workspace deletion: 30-day grace period, then removal including backups after retention |

## 4. Specific risks

| Risk | Mitigation |
|---|---|
| A script leaks data | Host allow-list, scoped token, run audit, admin approval for automations that write or call out |
| Over-powered tokens | Scoped by repository, permission and expiry |
| Share links leak | Read-only, revocable, optionally expiring and/or restricted by e-mail domain |
| Accidental mass deletion | Impact preview; a second approver above a threshold (policy); everything restorable from history |
