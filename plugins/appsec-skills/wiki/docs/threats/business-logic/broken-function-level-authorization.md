# Broken function-level authorization (roles and permissions)

## When is it relevant

A new or changed entry point that should be limited to certain roles or permissions: admin actions, settings, user and role management, billing, key or token management. Also a change to how roles and permissions are assigned or evaluated.

## Attack

A lower-privileged user calls the privileged endpoint directly, because the restriction exists only in the UI. Other variants:

- Sibling routes check a permission but the new one doesn't.
- The route checks a different permission from the action it performs.
- A user grants themselves, or others, a role more powerful than their own.

## Mitigation

- Put an explicit permission check on every privileged route, and deny by default.
- Check the permission for the exact action performed, and keep it consistent across siblings (`GET`, `POST`, `DELETE`).
- Enforce a delegation ceiling: a user can only grant roles or permissions they already hold.
- Never trust a role or permission sent by the client.

## Examples

=== "Express (JS)"

    --8<-- "examples/broken-function-level-authorization/express.md"

## Resources

- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [OWASP Access Control Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Access_Control_Cheat_Sheet.html)
- [PortSwigger: Access control vulnerabilities](https://portswigger.net/web-security/access-control)
- [CWE-862: Missing Authorization](https://cwe.mitre.org/data/definitions/862.html)
- [CWE-285: Improper Authorization](https://cwe.mitre.org/data/definitions/285.html)
