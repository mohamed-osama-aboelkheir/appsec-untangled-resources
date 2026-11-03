# Scope questions

These are the questions in Steps 1 and 2 of the Notion template, in the same
order. Answer every one, from the stories and the material you were given.

- **Yes**: add what the question names. A door, window or hole question adds
  the group (or a member of an existing group), then each listed threat with
  its starting mitigation, adapted to this system.
- **No**: say why in one line ("bearer token in a header, no cookies").
- **Not in scope**: the material doesn't cover it. Say so; don't invent it.

Each threat names its wiki page (bucket 1 under `threats/business-logic/`,
bucket 2 under `threats/source-to-sink/`, or a `threat-modeling/` page).
Read that page's **When is it relevant** before answering yes, and its
**Mitigation** before writing the mitigation.

## Step 1 · General scope

| Section | Question | If yes |
|---|---|---|
| Target users and roles | Who are the roles, and does the app serve several organizations, companies or workspaces from shared code or data? | Write the roles. Several organizations: ask the tenant question at every door that reads tenant data |
| Data handled or stored | Is any of it sensitive: PII, payments, health, secrets, private content? | Mark it; it sets severity |

## Step 2 · 🚪 Doors

| Section | Question | If yes, add | Starting mitigation |
|---|---|---|---|
| Backend routes | Are there new or changed backend routes? | 🚪 one door per group of routes behind the same middleware with the same rule; split outliers | — |
| Backend routes | Should only known callers reach them (not public by design)? | Authentication (`broken-authentication`) | Every route behind the auth middleware, which checks signature, issuer, audience, expiry; public routes are an explicit allowlist |
| Backend routes | Only allowed for specific users or roles? | Function-level authorization (`broken-function-level-authorization`) | Role or permission check on every route, deny by default |
| Backend routes | Do they take a resource ID and read, change or delete it? | IDOR (`broken-object-level-authorization`) | Load every record scoped to the caller; same 404 for missing and not yours |
| Backend routes | Do they serve several organizations? | Tenant isolation (`broken-tenant-isolation`) | Tenant from the session, never the request; every query filtered by it |
| Backend routes | Create or update from body fields, or return fields the caller must not set or see? | Property-level authorization (`broken-property-level-authorization`) | Allowlist of writable fields per role; responses from a schema that omits hidden fields |
| Backend routes | Mutating and authenticated with session cookies? | CSRF (`csrf`) | SameSite cookies plus a CSRF token or custom-header check |
| Backend routes | Client sends prices or quantities, moves a workflow forward, or uses something limited? | Business rules (`threat-modeling/business-rules`), Race condition | Server prices from the database and checks every state change; one atomic conditional update or lock |
| Public API routes | Public API for customers or partners; high volume or expensive? | 🚪 door, Authentication, Abuse and rate limits | Keys checked and scoped per customer; rate limits and quotas per key |
| Sign-in, sign-up, recovery | Adds or changes sign-in, sign-up, reset, MFA or OAuth callbacks? | 🚪 door, Authentication, Abuse and rate limits | Identity provider's flows; same answer for unknown and known accounts; rate limits |
| Webhooks and callbacks | Does a third party call one of our URLs? | 🚪 door, Forged webhook, Replay | Verify the provider's signature over the raw body; act only on the named object after checking it; each event ID once, reject old timestamps |
| Links, codes and tokens | Do we issue QR codes, links, reset tokens or signed URLs that come back to us? | 🚪 door (the route that receives them), Forged or reused token | Signed or random 128-bit tokens checked on the server, bound to one resource, single use or short-lived |
| Web pages and forms | Do pages send input to routes not listed above? | Add those routes above; what pages render is a hole | — |

## Step 2 · 🪟 Windows

| Section | Question | If yes, add | Starting mitigation |
|---|---|---|---|
| Buckets | New buckets that store customer data? | 🪟 window, Unauthorized bucket access (`threat-modeling/windows`) | Block Public Access; policy allows only the app's roles; no listing; short-lived pre-signed URLs |
| Buckets | New buckets with code or assets? | 🪟 window, Unauthorized write access | Only the CI/CD deploy role writes; reads only through the CDN |
| Queues, topics, schedulers | Can anyone besides the intended producer send the event? Delivered twice? | 🪟 window, Unauthorized write access, Replay | Queue policy allows only the producer; consumer re-checks state in the database; idempotent on the event ID |
| Compute | Who can exec, push code or change config, and what can the role do? | 🪟 window, Shell, deploy or code-change access | Exec off in production; only CI/CD pushes; secrets in a secret manager; least-privilege role |
| Identity provider | Self sign-up, or attributes users can write themselves? | 🪟 window, Function-level authorization (a user grants themselves a role) | Roles only from admin-managed groups; app client can't write role attributes |
| Credentials, secrets and keys | New credentials, keys or roles? Where kept, what can each do if it leaks? | 🪟 window, Secret exposure — or cover it at the window the secret lives in | Secret manager, never code or env vars; least privilege; rotation |
| Third-party and SaaS | What data do we share; which tokens does it hold into us? | 🪟 window, Unnecessary data sharing, Secret exposure | Only the fields it needs; narrowest scopes |
| Caches | Cached data that needs authorization? | 🪟 window, Cache authorization bypass | Cache key includes the user or tenant; no CDN caching of authenticated responses |
| Logs and monitoring | What data goes into logs? | 🪟 window, PII or credentials in logs | No tokens, secrets, signed URLs or full PII; redaction in the logger |
| Logs and monitoring | Will people need to know later who exported data or changed money or permissions? | Repudiation, on the door where the action happens | Audit log entry (who, what, when, which record) the actor can't edit |
| Exported files | Do files we export get used later by a person or another system? | 🪟 window, Edited or injected file | Whatever reads it treats it as untrusted; decisions come from the system |
| Repo, CI/CD, IaC | Does the work change pipelines, deploy roles or infrastructure code? | 🪟 window, Shell, deploy or code-change access | Protected branches; deploy role only from the pipeline; short-lived OIDC credentials |
| Other services | Any other service that stores customer data, or another entry point? | 🪟 window and its common misconfigurations | — |

## Step 2 · 🕳️ Holes

Trace every hole back to the door its input enters through (`Source door`),
including through stored data and queues.

| Section | Question | If yes, add | Starting mitigation |
|---|---|---|---|
| Data stores | User input in SQL queries, including sort columns and raw fragments? | 🕳️ hole (one per query helper), SQL injection | Safe function: parameterized queries; sort columns from an allowlist |
| Data stores | User input in NoSQL queries? | 🕳️ hole, NoSQL injection | Validation: cast to expected types; no operators from the request |
| UI changes | Pages show text one user wrote to another? | 🕳️ hole, XSS | Safe function: auto-escaping, no raw HTML; sanitizer for rich text; CSP |
| UI changes | Redirect to a location from the URL? | 🕳️ hole, Open redirect | No user input: fixed paths or an allowlist |
| UI changes | Front end builds API paths from IDs or names? | 🕳️ hole, Client-side path traversal | Validation: encode segments; IDs match their format |
| Files, templates, emails, exports | Users write templates the server renders? | 🕳️ hole, SSTI | Safe function: logic-less engine, fixed placeholders |
| Files, templates, emails, exports | User text rendered into PDFs or images? | 🕳️ hole, HTML → PDF injection | Safe function: auto-escaping; renderer with JS, network and file access off; patched |
| Files, templates, emails, exports | User text in CSV exports or emails? | 🕳️ hole, CSV injection, Email injection | Safe function: CSV library, neutralise leading `= + - @`; structured email API, no line breaks in headers |
| Files, templates, emails, exports | Paths or keys from input, shell commands, deserialization, XML? | 🕳️ hole per sink, matching threat | Keys from database IDs; `execFile` with an argument array; safe loaders |
| Outbound requests | Server fetches a URL the user controls? | 🕳️ hole, SSRF | Validation: allowlist, or block private and metadata ranges; no redirects |
| AI services | User input in prompts whose output acts or reaches a sink? | 🕳️ hole, Prompt injection | Treat output as untrusted; tools no stronger than the user; a person confirms changes |
| New libraries | New libraries handling user input? | 🕳️ hole, Dependency vulnerabilities — or cover it in the mitigation of the hole it serves | Dependency scanning in CI; patch within an agreed time |
