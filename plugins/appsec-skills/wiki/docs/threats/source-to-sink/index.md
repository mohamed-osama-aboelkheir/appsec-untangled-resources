# Source to sink threats

Untrusted input reaching a dangerous sink, checked at every sink.

| Threat | Sink |
|---|---|
| [SQL injection](sql-injection.md) | SQL query |
| [NoSQL injection](nosql-injection.md) | NoSQL query or update |
| [Cross-site scripting (XSS)](xss.md) | HTML / DOM |
| [Server-side template injection (SSTI)](ssti.md) | Template source |
| [Server-side request forgery (SSRF)](ssrf.md) | Outbound URL |
| [Open redirect](open-redirect.md) | Redirect location |
| [Path traversal](path-traversal.md) | File system path |
| [Client-side path traversal (CSPT)](client-side-path-traversal.md) | Client-side request path |
