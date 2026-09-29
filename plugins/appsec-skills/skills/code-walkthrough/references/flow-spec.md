# Flow spec format

One file per flow: `docs/flows/<id>.flow.json`. `scripts/walkthrough.mjs` turns it into
`.tours/<order>-<id>.tour` (CodeTour) and `docs/flows/<id>.md` (Mermaid diagram + step table).
Never edit the generated files by hand; edit the spec and rebuild.

## Top level

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | kebab-case, used in file names: `list-orders` |
| `order` | no | tour order when there are several flows (1, 2, ...). The first is the primary tour |
| `next` | no | `id` of the flow whose tour follows this one |
| `title` | yes | tour and page title: `Update profile (PATCH /profile)` |
| `description` | yes | 1–2 sentences: who does what, and where the flow ends. String or array of lines |
| `actor` | yes | `{ "id": "C", "name": "Customer\nweb / mobile client" }` |
| `lanes` | yes | ordered participants after the actor: `[{ "id": "E", "name": "Express" }, ...]`. Optional `label` overrides the generated header |
| `steps` | yes | the numbered steps, see below |
| `diagram` | yes | the ordered diagram events, see below |

A lane's header is generated: a lane whose steps touch **one** file shows `Name` + the file's base
name; a lane touching **several** files shows only `Name`, and each step in it is drawn as a white
box headed `📄 <file>` inside that single column, stacked in call order.

## Steps

```json
{
  "n": 4,
  "title": "Auth: read the session cookie",
  "lane": "AU",
  "kind": "control",
  "file": "app/middleware/session.py",
  "pattern": "(session_id = request\\.COOKIES\\.get\\('sid'\\))",
  "note": ["request.COOKIES.get('sid')", "no cookie → 401"],
  "description": [
    "**What happens:** reads the `sid` cookie. No cookie stops the request:",
    "",
    "```http",
    "HTTP/1.1 401 Unauthorized",
    "",
    "{\"error\":\"not logged in\"}",
    "```",
    "",
    "**Next →** `load_session(session_id)` (step 5)."
  ]
}
```

| Field | Required | Meaning |
|---|---|---|
| `n` | yes | 1..N, in order, no gaps. Tour step N = diagram step N |
| `title` | yes | `Layer: action`, short: `Controller: validate status` |
| `lane` | for code steps | lane id the step belongs to |
| `kind` | no | `control` (🔒 auth, authz, validation, sanitisation, CSRF, rate limit…), `sink` (⚠️ dangerous call or the scanner finding), `source` (🎯 where untrusted input enters) |
| `file` + `pattern` | for code steps | repo-relative path and a JS regex that matches **exactly once** in that file. The **first capture group** is what the tour highlights (the whole match if there is no group). Anchor on code text, never on line numbers; escape regex characters; use `[^\n]*` / `\n` to span lines |
| `note` | no | 1–3 short lines shown in the diagram under the title (the key code or value) |
| `description` | yes | tour text, Markdown. String or array of lines |

Steps without `file` (the HTTP request, the database, a third-party API) become text-only tour steps.

## Diagram events

`diagram` is an array of events, rendered top to bottom. Every step must appear at least once,
either as a step note (`{ "step": n }`) or as the label of an arrow (`"step": n` on a call).

| Event | Renders |
|---|---|
| `{ "phase": "Authentication", "events": [...] }` | coloured band with a header `Authentication · steps a–b` (range computed). Known phases get fixed colours: Routing, Authentication, Authorization, Input handling, Business logic, Data access, External call, Rendering, Response |
| `{ "call": ["C", "E"], "step": 1, "text": "GET /profile" }` | solid arrow. With `step`, the label is `1 · <title>` + `text` |
| `{ "return": ["D", "P"], "text": "rows" }` | dashed arrow (returns, responses). May carry `step` |
| `{ "step": 4 }` | the step's note over its lane (a 📄 file box in multi-file lanes). `over` overrides the lane |
| `{ "note": "sort is renamed orderColumn", "over": ["O", "S"] }` | free note over one lane or a span |
| `{ "break": "no session cookie", "events": [...] }` | an error exit: the request stops here |
| `{ "alt": [{ "label": "rows", "events": [...] }, { "label": "SQL error", "events": [...] }] }` | a real fork where both branches continue |

Use a self-arrow (`"call": ["AU", "AU"]`) for the hand-off between two files in the same lane.
`;` and `#` in text are escaped for Mermaid automatically. Use `\n` in text for line breaks.

## Complete small example

```json
{
  "id": "update-profile",
  "title": "Update profile (PATCH /profile)",
  "description": "How a signed-in user changes their display name, from the request to the UPDATE statement.",
  "actor": { "id": "C", "name": "User\nbrowser" },
  "lanes": [
    { "id": "F", "name": "Framework" },
    { "id": "AU", "name": "Auth" },
    { "id": "V", "name": "View" },
    { "id": "P", "name": "Store" },
    { "id": "D", "name": "Postgres" }
  ],
  "steps": [
    { "n": 1, "title": "Client: HTTP request", "description": ["**What happens:** ...", "", "```http", "PATCH /profile", "Cookie: sid=...", "", "{\"name\":\"Ada\"}", "```", "", "**Next →** URL routing (step 2)."] },
    { "n": 2, "title": "Routing: PATCH /profile", "lane": "F", "file": "app/urls.py", "pattern": "path\\('profile', (views\\.update_profile)\\)", "description": "..." },
    { "n": 3, "title": "Auth: read the session cookie", "lane": "AU", "kind": "control", "file": "app/middleware/session.py", "pattern": "(session_id = request\\.COOKIES\\.get\\('sid'\\))", "note": ["no cookie → 401"], "description": "..." },
    { "n": 4, "title": "Auth: load the session", "lane": "AU", "kind": "control", "file": "app/sessions.py", "pattern": "def (load_session)\\(", "description": "..." },
    { "n": 5, "title": "View: read the new name", "lane": "V", "kind": "source", "file": "app/views.py", "pattern": "(name = request\\.data\\['name'\\])", "description": "..." },
    { "n": 6, "title": "Store: build the UPDATE", "lane": "P", "kind": "sink", "file": "app/store.py", "pattern": "(f\"UPDATE users SET name = '\\{name\\}'[^\\n]*)", "note": ["name inside the SQL text"], "description": "..." },
    { "n": 7, "title": "Postgres: run the statement", "description": "..." },
    { "n": 8, "title": "Response: 204", "lane": "V", "file": "app/views.py", "pattern": "(return Response\\(status=204\\))", "description": "..." }
  ],
  "diagram": [
    { "phase": "Routing", "events": [
      { "call": ["C", "F"], "step": 1, "text": "PATCH /profile\nCookie: sid=..." },
      { "step": 2 },
      { "call": ["F", "AU"], "text": "SessionMiddleware" }
    ] },
    { "phase": "Authentication", "events": [
      { "step": 3 },
      { "break": "no cookie", "events": [ { "return": ["AU", "C"], "text": "401 {\"error\":\"not logged in\"}" } ] },
      { "call": ["AU", "AU"], "text": "load_session(session_id)" },
      { "step": 4 }
    ] },
    { "phase": "Input handling", "events": [
      { "call": ["AU", "V"], "text": "update_profile(request)" },
      { "step": 5 }
    ] },
    { "phase": "Data access", "events": [
      { "call": ["V", "P"], "text": "set_name(user.id, name)" },
      { "step": 6 },
      { "call": ["P", "D"], "step": 7, "text": "UPDATE users ..." }
    ] },
    { "phase": "Response", "events": [
      { "return": ["D", "P"], "text": "1 row updated" },
      { "return": ["V", "C"], "step": 8, "text": "204 No Content" }
    ] }
  ]
}
```
