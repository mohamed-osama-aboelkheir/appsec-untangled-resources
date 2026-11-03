# Holes

A hole is a dangerous sink: a place where input can change what the system
does, instead of just being data. Holes are found by asking, at every story
step that stores, renders, runs, fetches or writes something, "what if this
value were hostile?"

## The sink catalogue

| Sink | What to look for in a design | Wiki page |
|---|---|---|
| SQL | Search, filters, sort order, reports, admin lookups | [SQL injection](../threats/source-to-sink/sql-injection.md) |
| NoSQL query or update | Filters or updates built from request objects | [NoSQL injection](../threats/source-to-sink/nosql-injection.md) |
| HTML and the DOM | Anything that shows text one user wrote to another user: descriptions, names, comments, Markdown, links | [XSS](../threats/source-to-sink/xss.md) |
| Template source | User-editable emails, notifications or messages with placeholders | [SSTI](../threats/source-to-sink/ssti.md) |
| Outbound URL | Webhooks, URL previews, "import from URL", fetching images, HTML rendering that loads resources | [SSRF](../threats/source-to-sink/ssrf.md) |
| Redirect location | `next`, `returnTo`, OAuth `redirect_uri`, checkout success URLs | [Open redirect](../threats/source-to-sink/open-redirect.md) |
| File path or object key | Downloads, uploads, exports, archive extraction, storage keys built from IDs | [Path traversal](../threats/source-to-sink/path-traversal.md) |
| Client-side request path | The front end building API paths from IDs, slugs or names | [Client-side path traversal](../threats/source-to-sink/client-side-path-traversal.md) |
| HTML → PDF or image renderer | Tickets, invoices, reports rendered by a headless browser or a PDF library | [SSRF](../threats/source-to-sink/ssrf.md), [XSS](../threats/source-to-sink/xss.md) |
| CSV and spreadsheets | Exports opened in Excel or Sheets, or imported by another tool | — |
| Email body and headers | Subject lines, display names, HTML emails built from user text | — |
| OS command | `exec`, `spawn`, image or video tools, shelling out to CLIs | — |
| Deserialization | Pickle, Java serialization, YAML loaders, `eval`, `new Function` | — |
| XML | XML or SVG uploads, SAML, office documents | — |
| Token and document parsers | JWT libraries, QR or barcode decoders, file-format parsers: the parser itself mis-handles crafted input | — |
| Logs | Names, queries and headers written to logs (fake lines, secrets in logs) | — |
| Dependencies | Markdown renderers, PDF and image libraries, browser layers: their own sinks | — |

Forged or reused tokens the system issues (QR codes, unsubscribe links) are
bucket 1 threats at the door that receives them; see
[What else must hold](business-rules.md#tokens-codes-and-links-you-issue).

A sink without a wiki page is still a hole. Model it with the same three
mitigation kinds below.

## Trace it back to a door

For each hole, name the attack and trace the input back to where it entered:
"`attendees[].name` from `POST /api/orders` (S3 · step 1) → queue → ticket
Lambda → PDF template (S4 · step 2)". The source is often far from the sink,
and often **stored**: one user writes it, another user's request renders it.
Input that travels through queues, files or the database is still user input.

## Pick one of three mitigations

1. **No user input reaches it.** Build the value on the server: storage keys
   from database IDs, fixed redirect URLs, sort columns from an allowlist.
2. **A safe function.** Parameterized queries, auto-escaping templates, a
   logic-less template engine, a structured email API instead of raw MIME, a
   CSV library, `execFile` with an argument array.
3. **Validation or sanitization.** An allowlist of characters or values, an
   HTML sanitizer, URL scheme and destination checks, stripping line breaks.

Prefer them in that order. The first removes the hole; the third is the easiest
to get wrong.

## Group them

Group holes of the same sink type reached through the same function: every
query in a store class built with the same helper, every page that renders
organizer text through the same component. Split out the one raw query or the
one `dangerouslySetInnerHTML`. See [grouping](index.md#group-them).
