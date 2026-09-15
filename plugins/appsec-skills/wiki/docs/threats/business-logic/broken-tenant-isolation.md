# Broken tenant isolation

## When is it relevant

The app serves several tenants (organizations, companies, workspaces, projects) from shared code or data, and the change adds or modifies something that touches tenant-owned data or tenant membership: an entry point, query, background job, cache or file path.

## Attack

A member of tenant A reaches tenant B's data or actions. Typical ways in:

- Passing one of B's resource IDs to a route that checks only the caller's role or account type, not the resource's tenant.
- Switching tenants with a header or parameter that isn't checked against membership.
- A query, job or cache key that is missing the tenant filter.
- Obtaining a credential or token that acts inside B.

## Mitigation

- Derive the tenants a caller may act in from their authenticated identity (membership), never from client input alone.
- On every lookup of a tenant-owned resource, check that the resource's tenant is one the caller belongs to, before reading or acting.
- Apply the tenant filter centrally (repository or query helper), including keys, tokens, files, jobs and caches.
- Bind issued credentials to the tenant they were created in.

## Examples

=== "Express (JS)"

    --8<-- "examples/broken-tenant-isolation/express.md"

## Resources

- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [PortSwigger: Access control vulnerabilities](https://portswigger.net/web-security/access-control)
- [CWE-639: Authorization Bypass Through User-Controlled Key](https://cwe.mitre.org/data/definitions/639.html)
