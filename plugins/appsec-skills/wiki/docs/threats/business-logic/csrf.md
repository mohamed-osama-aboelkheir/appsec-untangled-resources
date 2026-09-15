# Cross-site request forgery (CSRF)

## When is it relevant

A new or changed state-changing entry point (`POST`, `PUT`, `PATCH`, `DELETE`, or a `GET` that changes state) that authenticates with credentials the browser sends automatically: cookies, HTTP basic auth or client certificates. It doesn't apply when the only credential is a header the page has to set itself, such as `Authorization: Bearer`.

## Attack

A page on another site makes the victim's browser send the request, and the browser attaches their cookies. This works through an auto-submitting form, an image tag for `GET`, or `fetch` with `mode: 'no-cors'`. JSON endpoints are exposed too if they also accept form or `text/plain` bodies, or if CORS allows credentials from any origin.

## Mitigation

- Set session cookies with `SameSite=Lax` or `Strict`, plus `Secure` and `HttpOnly`.
- On unsafe methods, reject cross-site requests. Use a CSRF token, or check `Sec-Fetch-Site` or `Origin` against your own origin.
- Never change state on `GET`. Accept only `application/json` bodies where possible.
- Don't reflect arbitrary origins in `Access-Control-Allow-Origin` together with credentials.

## Examples

=== "Express (JS)"

    --8<-- "examples/csrf/express.md"

## Resources

- [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [PortSwigger: Cross-site request forgery](https://portswigger.net/web-security/csrf)
- [CWE-352: Cross-Site Request Forgery](https://cwe.mitre.org/data/definitions/352.html)
