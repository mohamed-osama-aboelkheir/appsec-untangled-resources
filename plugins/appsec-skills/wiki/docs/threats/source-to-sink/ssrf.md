# Server-side request forgery (SSRF)

## When is it relevant

A new or changed code path where the server makes an outbound request and a user controls part of the destination: the URL, host, port, redirect target or DNS name. Examples are webhooks, URL previews, fetching images or files by URL, integrations, and PDF or HTML rendering.

## Attack

The attacker points the server at destinations only it can reach:
- `localhost` admin ports;
- the cloud metadata service (`169.254.169.254`);
- internal APIs and databases.

Bypasses include redirects, DNS rebinding, and alternative IP encodings such as decimal addresses and IPv4-mapped IPv6. If the response comes back to the attacker, secrets are exposed. If not, side effects and port scanning are still possible.

## Mitigation

- Allowlist destinations when you can.
- Otherwise, resolve the hostname, reject loopback, private, link-local and metadata ranges, and connect to the address you checked so DNS rebinding can't swap it.
- Don't follow redirects, or check each hop the same way.
- Allow only `http:` and `https:`, and expected ports. Set timeouts.
- Don't return the raw response to the caller.

## Examples

=== "Node.js (JS)"

    --8<-- "examples/ssrf/node.md"

## Resources

- [OWASP SSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)
- [PortSwigger: Server-side request forgery](https://portswigger.net/web-security/ssrf)
- [CWE-918: Server-Side Request Forgery](https://cwe.mitre.org/data/definitions/918.html)
