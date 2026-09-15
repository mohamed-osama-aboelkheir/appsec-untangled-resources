# Client-side path traversal (CSPT)

## When is it relevant

Front-end code builds a request URL by putting a value into the **path** of a
`fetch`, `axios` or XHR call — an id, slug, alias, handle or filename — and that
value can be influenced by someone else: chosen by another user, stored by the
server, or read out of the current URL.

## Attack

The attacker supplies a value containing `../`. The browser resolves dot
segments *before the request leaves the page*, so the request lands on a
different endpoint than the code intended, carrying the victim's session.

If the retargeted endpoint changes state, this is CSRF that **`SameSite` and
CSRF tokens do not stop**, because the request is same-origin and issued by the
application itself (CSPT2CSRF). If it is a `GET` whose response is rendered, the
attacker gets data instead.

The value is often one the server handed back, so "it came from our API" is not
a reason to trust it.

## Mitigation

- Encode every user-controlled path segment with `encodeURIComponent`, at a
  single shared URL builder.
- Never hand-concatenate an identifier into a path anywhere else, so one
  forgotten call site cannot reopen the hole.
- Validate the identifier's grammar on ingest, server-side, as defence in depth.
- Mint identifiers server-side when the client has no legitimate reason to
  choose them.
- Review both directions: state-changing sinks (forced action) and `GET` sinks
  whose response is displayed (data disclosure).

## Examples

=== "Fetch API (JS)"

    --8<-- "examples/client-side-path-traversal/vanilla-js.md"

## Resources

- [Doyensec: CSPT2CSRF](https://blog.doyensec.com/2024/07/02/cspt2csrf.html)
- [Doyensec: CSPT2CSRF whitepaper](https://www.doyensec.com/resources/Doyensec_CSPT2CSRF_Whitepaper.pdf)
- [Doyensec: CSPT resource hub](https://blog.doyensec.com/2025/03/27/cspt-resources.html)
- [CVE-2023-5123: Grafana JSON API plugin CSPT to admin](https://www.cve.org/CVERecord?id=CVE-2023-5123)
- [OWASP Top 10 A01:2021 — Broken Access Control](https://owasp.org/Top10/A01_2021-Broken_Access_Control/)
- [WHATWG URL Standard — path normalisation](https://url.spec.whatwg.org/)
- [CWE-22: Path Traversal](https://cwe.mitre.org/data/definitions/22.html)
