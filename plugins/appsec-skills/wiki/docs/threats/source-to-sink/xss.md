# Cross-site scripting (XSS)

## When is it relevant

A change that puts data into an HTML, attribute, URL or script context where users or third parties can influence that data. This covers server-rendered HTML and templates, frontend code (`innerHTML`, `dangerouslySetInnerHTML`, `v-html`, `href` or `src` from data), and rendering of rich text, Markdown or SVG.

## Attack

The attacker stores or reflects a payload, such as `<img src=x onerror=…>` or a `javascript:` link, that the browser runs as code in the victim's session. It can read data, act as the victim or take over their account. The context matters: escaping for HTML text doesn't protect attributes, URLs or script blocks.

## Mitigation

- Render data with auto-escaping templates or `textContent`, never string-built HTML.
- When rich text is needed, sanitize it with an allowlist sanitizer such as DOMPurify.
- Allow only `http:` and `https:` in links and sources built from data.
- Serve APIs as `application/json`, and add a Content Security Policy as defense in depth.

## Test

- **Point-in-time:** store a script, an event-handler attribute and a `javascript:` link in every field that is rendered, then view each page where it appears, including admin and organizer pages.
- **Continuous:** a SAST rule for `innerHTML`, `dangerouslySetInnerHTML`, `v-html` and unescaped template output, a unit test on the sanitizer, and a CSP header check.

## Examples

=== "EJS (JS)"

    --8<-- "examples/xss/ejs.md"

=== "Nunjucks (JS)"

    --8<-- "examples/xss/nunjucks.md"

## Resources

- [OWASP XSS Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
- [OWASP DOM-based XSS Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/DOM_based_XSS_Prevention_Cheat_Sheet.html)
- [PortSwigger: Cross-site scripting](https://portswigger.net/web-security/cross-site-scripting)
- [CWE-79: Cross-site Scripting](https://cwe.mitre.org/data/definitions/79.html)
