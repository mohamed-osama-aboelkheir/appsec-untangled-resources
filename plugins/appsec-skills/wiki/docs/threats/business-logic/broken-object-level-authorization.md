# Broken object-level authorization (IDOR)

## When is it relevant

A new or changed entry point that takes a resource identifier (path parameter, query, body, or a nested or bulk list of IDs) and reads, changes or deletes that resource or its children.

## Attack

The attacker replaces the ID with one that belongs to someone else, and the server acts on it because it only checks that the caller is logged in. IDs hidden in the body, child resources checked only through their parent, and "unguessable" UUIDs that leak through other responses are all easy to miss.

## Mitigation

- Load the resource scoped to the caller (`WHERE id = ? AND owner_id = ?`), or check ownership after loading and before acting.
- Check every ID in the request, including IDs in the body and IDs of child resources.
- Return the same `404` for "doesn't exist" and "not yours".
- Don't rely on IDs being hard to guess.

## Examples

=== "Express (JS)"

    --8<-- "examples/broken-object-level-authorization/express.md"

=== "Django (Py)"

    --8<-- "examples/broken-object-level-authorization/django.md"

=== "Rails (Ruby)"

    --8<-- "examples/broken-object-level-authorization/rails.md"

## Resources

- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [PortSwigger: Access control vulnerabilities](https://portswigger.net/web-security/access-control)
- [CWE-639: Authorization Bypass Through User-Controlled Key](https://cwe.mitre.org/data/definitions/639.html)
- [CWE-862: Missing Authorization](https://cwe.mitre.org/data/definitions/862.html)
