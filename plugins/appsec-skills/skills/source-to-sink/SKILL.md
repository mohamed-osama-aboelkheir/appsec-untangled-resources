---
name: source-to-sink
description: >-
  Trace how data flows between sources and dangerous sinks, like a SAST dataflow trace, and
  explain it as a diagram of code cards plus a VS Code CodeTour that highlights the value on
  every line. Backward mode starts from a sink (a file:line, or a Semgrep/SAST finding) and finds
  every source that reaches it and whether it is user input, and which users can send it.
  Forward mode starts from an input (a parameter, header, body field, or all inputs of a route)
  and finds every dangerous sink it reaches, or where it stops. Use when asked what reaches a
  sink, whether a finding's input is user-controlled, where an input goes, or for a
  source-to-sink / taint / dataflow trace.
---

# Source to sink: dataflow traces

Follow one value at a time through the code and show its path as a chain of code cards: where it
enters, every line that passes or renames it, and the sink it reaches (or where it stops). The
reader should see the path in five seconds, and then follow it line by line in the tour.

## Inputs

- **Backward mode:** a sink: a code location (`src/repositories/orderRepository.js:10`), a
  function call, or findings in a scanner report (`semgrep.json`). One trace per sink.
- **Forward mode:** a source: an input (`req.query.file` on `GET /exports`), or a route, in which
  case trace every input it reads. One trace per input.
- **Output directory** (optional): defaults to `docs/traces/` for specs and pages, `.tours/` for
  tours.

If the mode is unclear, a location or finding means backward, an input or route means forward.
If the target itself is ambiguous, ask once.

## Files

- `${CLAUDE_PLUGIN_ROOT}/skills/source-to-sink/references/trace-spec.md`: the spec format.
  **Read it before writing a spec.**
- `${CLAUDE_PLUGIN_ROOT}/skills/source-to-sink/scripts/trace.mjs`: builds and checks the outputs.
  Run it from the target repo root.
- `${CLAUDE_PLUGIN_ROOT}/wiki/docs/threats/source-to-sink/`: the sink catalogue for forward mode,
  one page per threat (SQL injection, NoSQL injection, SSRF, path traversal, XSS, SSTI, open
  redirect, client-side path traversal). Per-stack sinks and safe patterns are in
  `${CLAUDE_PLUGIN_ROOT}/wiki/examples/<threat-file-name>/<stack>.md` (**What to grep for**,
  **Mitigation options**). Read only the files for the project's stack, one threat at a time.

## Ground rules

1. **Evidence only.** Every card points at a line you read, through a pattern that matches
   exactly once. Never guess a hop; if a link in the chain can't be confirmed from the code, stop
   the path with a `stop` card that says so.
2. **Never fabricate values.** "Value here" examples are captured from the running app in this
   session, taken from existing walkthrough specs (`docs/flows/*.flow.json`), or derived from the
   code and labelled `(derived from code, not run)`.
3. **Classify, don't judge.** For each source, state facts: its origin, who can send it, how it
   reaches the sink, and which controls on the path cover it or not. **Don't give exploitability
   verdicts or severities**: that's triage, which uses this trace as its input.
4. **Local and harmless only.** If you run the app, run it locally and send only normal requests.
   No attack payloads. Stop anything you started.
5. **Don't touch application code.** Write only the specs and the generated outputs.

## Reuse walkthrough output when it exists

If `docs/flows/*.flow.json` exists (from the `code-walkthrough` skill), read the flow that
contains the sink or the source before you start: it gives the route, the auth and role gates
(who can send an input), the captured example requests, and the file order. Don't copy its steps.
A trace follows one value, not the whole request. If it doesn't exist, work from the code.

## Backward mode: sink → sources

1. **Pin the sink and the dangerous value.** Identify the call and the exact expression that
   makes it dangerous: the interpolated value in a SQL string, the path passed to `readFile`, the
   URL passed to the HTTP client. Values passed safely (bound parameters) are not traced.
2. **Walk back one hop at a time,** writing each hop down as a card:
   - a local variable → its assignment;
   - a function parameter → **every call site** of that function (search for callers). Each call
     site that passes a different expression is a separate path;
   - an object field or destructured value → where the object is built;
   - a merge (`a || b`, ternary, concatenation, template) → each operand is its own path.
3. **Stop at a source** and classify it by origin (`user`, `identity`, `config`, `constant`,
   `stored`, `external`; see the spec). For user input, record **who can send it** from the
   route's middleware (anonymous, any logged-in user, a role). For config or stored data, record
   **who can write it**.
4. **Stored values: keep going to the writer.** When the value is read from a database, cache or file,
   don't stop there: find the code that writes that field (search for the column or key) and
   continue the path back to the input it stores, one level. The storage write and the read become
   hops (`stored in comments.body`, `read back for every visitor`), and the source is the writer's
   input, with who can write it *and* who receives it in its `label`. Only stop at a `stored` source
   when nothing in the codebase writes the field (a migration, another service), and say so.
5. **Lookups end user input.** When user input is only used to *select* something (an object key,
   an ID for a row, a switch case) and its own value goes no further, end its path with a `stop`
   card. The value that continues (the config entry, the database row) is a new source with its
   own origin. This is the difference between "user input reaches the sink" and "user input
   picks which trusted value reaches the sink".
6. **Record the controls on each path** as side cards attached to the card they sit on:
   validation, allowlists, casts, sanitisers, parameterisation, encoding. Say exactly what each
   one covers. A check on another field, or one that doesn't fit this sink (HTML-escaping before
   SQL), is a `gap`.

## Forward mode: source → sinks

1. **Start at the input** as the first card (for a route, list its inputs first and trace each).
2. **Follow every use of the value:** assignments, calls (into the callee's parameter), returns,
   object fields, string building. Each distinct use is a branch (`from` in the spec).
3. **Check each use against the sink catalogue** in the wiki's `source-to-sink` threat pages, using
   the stack's **What to grep for**. A use that matches is a `sink` card, labelled with the sink
   type (`SQL text`, `file path`, `outbound URL`, `HTML output`, `redirect`, `template`).
4. **End a branch with a `stop` card** when the value is neutralised (cast to a number, checked
   against an allowlist, parameterised, sanitised for this sink type), only compared or used as a
   key, or leaves the code you can see.
5. **Stored values:** when the value is written to a database, cache or file, add a `stop` card
   (`stored in comments.body`), then follow the readers of that field **one level**, as a new
   path with origin `stored`. Say that you stopped at one level.

## Capture example values

If the app can run locally (README, `package.json`, docker-compose), start it and send one normal
request that exercises the path, so each card can say what the value is at that point
(`orderBy = 'total'`). Reuse walkthrough examples if they exist. Otherwise derive the values from
the code and label them.

## Write the spec

One `docs/traces/<id>.trace.json` per sink (backward) or per input (forward), in the format of
`${CLAUDE_PLUGIN_ROOT}/skills/source-to-sink/references/trace-spec.md`.

- **Cards in reading order:** for each path, its source, then the side cards (`gap`/`control`)
  where they occur, then its hops, then the sink or stop. Put a path that stops before the path
  that reaches the sink.
- **One card per line the value touches.** Include the callee's parameter line (`async function
  find(userId, status, orderBy)`) whenever the value is renamed on the way in.
- **One source card per place, not per value.** Alternatives that come from the same place (the
  entries of one config object, the members of one allowlist, the cases of one switch) are a
  single source card; list the possible values in its `label` or description.
- **Side cards** (`gap`, `control`) attach to the card whose line they guard, usually the next hop
  after the check. Include the route's auth gate as a `control` on the user-input source when it
  decides who can send it.
- **Pattern:** the capture group is **the value itself**, not the whole line. For a config or
  constant source, capture the literal values that reach the sink (the two table names), not the
  variable or `module.exports` that holds them.
- **Code:** the line trimmed, with the value in `**bold**`.
- **Edge:** the value's name on the next card (`orderBy`), or the rename (`sort → orderColumn`).
  Never start it with an arrow.
- **Titles:** `SOURCE: req.query.sort`, `sort → orderColumn`, `Check on the path: status
  allowlist`, `User input stops here`, `SINK: ORDER BY ${orderBy}`.
- **Descriptions**, in this order: `**Source:**` / `**Propagates:**` / `**Sink:**` (what happens to
  the value) · `**Value here:**` (the example) · any control or second source on this line ·
  `**Next →** ... (step N)`. The sink card ends with what the sink receives for the example, and a
  one-line summary of the path (origin → controls → sink).
- Several traces in one run: set `order` and chain them with `next`.

## Build and check

```
node ${CLAUDE_PLUGIN_ROOT}/skills/source-to-sink/scripts/trace.mjs build docs/traces
node ${CLAUDE_PLUGIN_ROOT}/skills/source-to-sink/scripts/trace.mjs check docs/traces
```

Fix every problem (a pattern matched 0 or 2+ times, a path with no source, a bad `attach`), and
every `!` warning: a warning means the tour highlight doesn't contain the value in bold, so the
capture group is on the wrong text. Rebuild until `check` passes, then read the card table in each
generated `docs/traces/<id>.md`: every highlight must be the value.

## Report

Tell the user, per trace:
- the sources table: each source, its origin, who can send or change it, whether it reaches the
  sink, and the controls on its path;
- the files written (`docs/traces/*.trace.json`, `docs/traces/*.md`, `.tours/source-to-sink-*.tour`);
- which example values were captured and which were derived;
- how to follow along: open `docs/traces/<id>.md` for the diagram and the CodeTour extension
  (`vsls-contrib.codetour`) for the tour, where step N = card N. After code changes, run `build`
  again to move the highlights with the code, or `check` in CI.
