# Threats

Every threat in the wiki, in the two categories a review checks separately.

## 🔓 Business logic

Controls that should be there. Checked at **every entry point** — each route,
event, webhook, job or command the change adds or alters.

- [**Broken authentication**](business-logic/broken-authentication.md)
  Can someone reach this without being logged in, or with a session or token that shouldn't still work?

- [**Broken object-level authorization (IDOR)**](business-logic/broken-object-level-authorization.md)
  Can someone act on a record that isn't theirs by naming its ID?

- [**Broken function-level authorization**](business-logic/broken-function-level-authorization.md)
  Can someone call an operation their role shouldn't allow?

- [**Broken property-level authorization**](business-logic/broken-property-level-authorization.md)
  Can someone set a field they shouldn't, or read one they shouldn't see?

- [**Broken tenant isolation**](business-logic/broken-tenant-isolation.md)
  Can one organization reach another's data?

- [**Cross-site request forgery (CSRF)**](business-logic/csrf.md)
  Can another site make this request using the victim's session?

## 💉 Source to sink

Untrusted input reaching somewhere dangerous. Checked at **every sink** the
change introduces or feeds.

- [**SQL injection**](source-to-sink/sql-injection.md) — sink: SQL query
  Can input change the query instead of being data in it?

- [**NoSQL injection**](source-to-sink/nosql-injection.md) — sink: NoSQL query or update
  Can an object where a string was expected change the filter?

- [**Cross-site scripting (XSS)**](source-to-sink/xss.md) — sink: HTML / DOM
  Can input run as script in someone's browser?

- [**Server-side template injection (SSTI)**](source-to-sink/ssti.md) — sink: template source
  Can input become part of a template, and so run on the server?

- [**Server-side request forgery (SSRF)**](source-to-sink/ssrf.md) — sink: outbound URL
  Can input make the server fetch somewhere it shouldn't?

- [**Path traversal**](source-to-sink/path-traversal.md) — sink: file system path
  Can input reach a file outside the intended directory?

- [**Client-side path traversal (CSPT)**](source-to-sink/client-side-path-traversal.md) — sink: client-side request path
  Can input move a browser request onto a different endpoint?

- [**Open redirect**](source-to-sink/open-redirect.md) — sink: redirect location
  Can input send the user to another site?

## How to use a page

Read **When is it relevant** first and rule the threat in or out. If it applies,
work through **Mitigation**, then open the tab for your stack: it lists the
mitigation options, vulnerable and fixed code for each, the **bypasses worth
checking**, and what to grep for.

New to this? Start with [the methodology](../methodology.md), which puts these
in order over one pull request.
