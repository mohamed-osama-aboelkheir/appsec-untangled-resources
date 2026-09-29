# Trace spec format

One file per trace: `docs/traces/<id>.trace.json`. `scripts/trace.mjs` turns it into
`docs/traces/<id>.md` (a Mermaid dataflow diagram, a sources table and a card table) and
`.tours/source-to-sink-<order>-<id>.tour` (CodeTour, step N = card N).
Never edit the generated files by hand; edit the spec and rebuild.

A trace is a list of **cards**. Each card is one line of code the value passes through. Cards
are grouped into **paths**: a path starts at a source card and follows one value, hop by hop,
until it reaches a sink or stops. The diagram draws each path as a chain of cards, top to
bottom, with thick arrows in the colour of the source's origin.

## Top level

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | kebab-case, used in file names: `orders-order-by` |
| `order` | no | tour order when there are several traces (1, 2, ...) |
| `next` | no | `id` of the trace whose tour follows this one |
| `mode` | no | `backward` (from a sink) or `forward` (from a source), for the reader |
| `title` | yes | `Source to sink 1 · sort → ORDER BY ${orderBy}` |
| `description` | yes | 1–2 sentences: which value is followed and where it ends. String or array of lines |
| `cards` | yes | the cards, numbered 1..N in reading order (see below) |

## Cards

```json
{
  "n": 3,
  "role": "hop",
  "path": "A",
  "edge": "url → target",
  "title": "url → target",
  "file": "app/previews.py",
  "pattern": "fetch_preview\\((target)\\)",
  "code": "fetch_preview(**target**)",
  "description": [
    "**Propagates:** `url` is passed to `fetch_preview` and received as `target`.",
    "",
    "**Value here:** `target = 'https://example.com'`",
    "",
    "**Next →** used as the request URL (step 4)."
  ]
}
```

| Field | Required | Meaning |
|---|---|---|
| `n` | yes | 1..N, in reading order, no gaps. Tour step N = card N |
| `role` | yes | `source` · `hop` · `sink` · `stop` · `control` · `gap` (see below) |
| `path` | source, hop, sink, stop | path id (`A`, `B`...). A sink reached by several paths may list them: `["A", "B"]` |
| `origin` | source | `user` · `config` · `constant` · `identity` · `stored` · `external` (see below) |
| `label` | no | short text in the card header: who can send it (`user input, any logged-in user`), the sink type (`SQL text`), what a control does |
| `edge` | hop, sink, stop | the arrow **into** this card: the value's name here, or the rename (`sort → orderColumn`) |
| `from` | no | branch: draw the arrow into this card from card `from` instead of the previous card on the path. Use it when one value is used in two places (forward mode) |
| `attach` | control, gap | the card number the control applies to; drawn as a dashed side card |
| `title` | yes | short, for the tour: `SOURCE: req.query.sort`, `sort → orderColumn`, `SINK: ORDER BY ${orderBy}` |
| `file` + `pattern` | for code cards | repo-relative path and a JS regex matching **exactly once**. The **first capture group is the value itself** (`(sort)`, `(\\$\\{orderBy\\})`), because that's what the tour highlights |
| `code` | for code cards | the line as shown in the diagram, trimmed (abbreviate with `...`), with the value in `**bold**` |
| `description` | yes | tour text, Markdown. String or array of lines |

### Roles

| Role | Drawn as | Use for |
|---|---|---|
| `source` | coloured card at the top of a path, `🔴 SOURCE · <label>` | where a value enters |
| `hop` | white card with a coloured border | each line that passes, renames or merges the value |
| `sink` | thick black frame, `⚠️ SINK · <label>` | the dangerous call that receives the value |
| `stop` | dashed grey card, `✋ <label>` | where a path ends before any sink: used only as a key, compared, cast to a number, allowlisted |
| `gap` | dashed grey side card, `🚫 <label>` | a control on the path that **does not cover** this value |
| `control` | dashed green side card, `🛡 <label>` | a control on the path that does cover it |

### Origins

| Origin | Colour | Meaning |
|---|---|---|
| `user` | 🔴 red | request data: query, body, path params, headers, cookies, uploaded files. Put who can send it in `label` |
| `identity` | 🟢 green | set by authentication from a verified credential (`req.user.id`) |
| `config` | 🔵 blue | source code config, env vars, config files. Say in `label` who can change it |
| `constant` | ⚪ grey | a literal in the code |
| `stored` | 🟣 purple | read from a database, cache or file. Say in `label` who wrote it (second-order input) |
| `external` | 🟠 orange | a response from another service |

## Example: backward trace from a sink, with a second source that stops

```json
{
  "id": "preview-fetch",
  "title": "Source to sink · url → requests.get(target)",
  "mode": "backward",
  "description": "Follows the values that reach requests.get() in previews.py.",
  "cards": [
    { "n": 1, "role": "source", "path": "A", "origin": "user", "label": "user input, anonymous",
      "title": "SOURCE: request.args['url']", "file": "app/views.py",
      "pattern": "url = (request\\.args\\['url'\\])", "code": "url = **request.args['url']**", "description": "..." },
    { "n": 2, "role": "gap", "attach": 3, "label": "checks the scheme only, not the host",
      "title": "Check on the path: scheme check", "file": "app/views.py",
      "pattern": "(if not url\\.startswith\\('http'\\))", "description": "..." },
    { "n": 3, "role": "hop", "path": "A", "edge": "url → target", "title": "url → target",
      "file": "app/views.py", "pattern": "fetch_preview\\((url)\\)", "code": "fetch_preview(**url**)", "description": "..." },
    { "n": 4, "role": "sink", "path": "A", "edge": "target", "label": "outbound HTTP request",
      "title": "SINK: requests.get(target)", "file": "app/previews.py",
      "pattern": "requests\\.get\\((target)", "code": "requests.get(**target**, timeout=5)", "description": "..." },
    { "n": 5, "role": "source", "path": "B", "origin": "user", "label": "user input, anonymous",
      "title": "User input: request.args['size']", "file": "app/views.py",
      "pattern": "size = (request\\.args\\.get\\('size'\\))", "code": "size = **request.args.get('size')**", "description": "..." },
    { "n": 6, "role": "stop", "path": "B", "edge": "size", "label": "cast to int, then only compared",
      "title": "size stops here", "file": "app/views.py",
      "pattern": "(int\\(size\\))", "code": "width = **int(size)**", "description": "..." }
  ]
}
```

Forward traces use the same format: start from the source card, and use `from` for every
place the value is used, so each use becomes its own branch ending in a `sink` or a `stop`.
