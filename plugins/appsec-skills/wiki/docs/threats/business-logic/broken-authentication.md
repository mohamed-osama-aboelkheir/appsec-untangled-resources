# Broken authentication

## When is it relevant

A new or changed entry point (route, socket event, webhook, job trigger) that should only be reachable by a known caller. Also a change to how callers are identified: login, sessions, tokens, API keys or SSO.

## Attack

The attacker calls the entry point with no credentials, or with expired, forged or wrongly scoped ones, and the server still treats them as an authenticated user. Common causes:

- A route is mounted outside the authentication middleware.
- Middleware fails open on errors or missing headers.
- Tokens are decoded without being verified.
- Credentials from one identity system are accepted as another.

## Mitigation

- Apply authentication at the router level so new routes are protected by default, and list public routes explicitly.
- Fail closed: missing, malformed or unverifiable credentials end the request with `401`.
- Verify tokens fully: signature with a pinned algorithm, expiry, issuer and audience. Check that the session or key is still active.

## Test

- **Point-in-time:** call each entry point with no credentials, an expired token, a token with a bad signature and a token from another issuer or audience. Every one must return `401`.
- **Continuous:** an integration test that walks the route table and asserts every route not on the public list rejects an anonymous request, so a new route outside the middleware fails the build.

## Examples

=== "Express (JS)"

    --8<-- "examples/broken-authentication/express.md"

## Resources

- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [PortSwigger: Authentication vulnerabilities](https://portswigger.net/web-security/authentication)
- [CWE-287: Improper Authentication](https://cwe.mitre.org/data/definitions/287.html)
- [CWE-384: Session Fixation](https://cwe.mitre.org/data/definitions/384.html)
