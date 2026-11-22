# Broken tenant isolation

## When is it relevant

The app serves several tenants (organizations, companies, workspaces, projects) from shared code or data, and the change adds or modifies something that touches tenant-owned data or tenant membership: an entry point, query, background job, cache or file path.

## Attack

A member of tenant A reaches tenant B's data or actions. Typical ways in:

- Passing one of B's resource IDs to a route that checks only the caller's role or account type, not the resource's tenant.
- Switching tenants with a header or parameter that isn't checked against membership.
- A query, job or cache key that is missing the tenant filter.
- A query that is scoped to the caller's tenant, but merges caller-supplied filters in after the scope, so a `tenantId` filter in the request replaces it. Allowlists of filterable fields built from the model's columns let the tenant key through.
- Obtaining a credential or token that acts inside B.

## Mitigation

- Derive the tenants a caller may act in from their authenticated identity (membership), never from client input alone.
- On every lookup of a tenant-owned resource, check that the resource's tenant is one the caller belongs to, before reading or acting.
- Apply the tenant filter centrally (repository or query helper), including keys, tokens, files, jobs and caches.
- Add the tenant condition last, so caller-supplied filters can't replace it, and allowlist filterable fields explicitly rather than deriving them from the model.
- Bind issued credentials to the tenant they were created in.

## Test

- **Point-in-time:** with users in two tenants, have tenant B's user reach tenant A's resources by ID, by switching the tenant header or parameter, and through exports, jobs and file paths.
- **Continuous:** a two-tenant integration test in CI, and a lint or code-review rule that every query on a tenant-owned table goes through the tenant-scoped helper.

## Examples

=== "Express (JS)"

    --8<-- "examples/broken-tenant-isolation/express.md"

=== "Spring (Java)"

    --8<-- "examples/broken-tenant-isolation/spring.md"

=== "Flask (Py)"

    --8<-- "examples/broken-tenant-isolation/flask.md"

## Resources

- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [PortSwigger: Access control vulnerabilities](https://portswigger.net/web-security/access-control)
- [CWE-639: Authorization Bypass Through User-Controlled Key](https://cwe.mitre.org/data/definitions/639.html)
