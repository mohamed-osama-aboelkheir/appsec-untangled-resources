# Open redirect

## When is it relevant

A new or changed code path that redirects to, or links to, a location taken from input. Examples are `returnTo`, `next`, `redirect_uri`, the `Referer` header, OAuth `state`, and client-side `window.location` assignments.

## Attack

The attacker sends a link on your trusted domain that bounces the victim to a phishing site. Worse, a login or OAuth flow redirects to the attacker with codes or tokens attached. Prefix checks are bypassed with values like `//evil.com`, `/\evil.com`, `https://app.example.com.evil.com` and `javascript:`.

## Mitigation

- Redirect only to relative paths, validated by parsing them against your own origin, or to an allowlist of exact origins.
- Compare parsed origins, never string prefixes.
- For OAuth, match registered redirect URIs exactly.

## Examples

=== "Express (JS)"

    --8<-- "examples/open-redirect/express.md"

## Resources

- [OWASP Unvalidated Redirects and Forwards Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Unvalidated_Redirects_and_Forwards_Cheat_Sheet.html)
- [PortSwigger: DOM-based open redirection](https://portswigger.net/web-security/dom-based/open-redirection)
- [CWE-601: URL Redirection to Untrusted Site](https://cwe.mitre.org/data/definitions/601.html)
