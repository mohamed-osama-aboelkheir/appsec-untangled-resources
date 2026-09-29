---
name: code-walkthrough
description: >-
  Explain how a feature or a code location works as a numbered walkthrough: a Mermaid sequence
  diagram (UI → HTTP → app → route → auth → controller → service → store → database) and a matching
  VS Code CodeTour whose steps highlight the exact code, with real request/response and error
  examples. Starts from a route, a feature, or a code location such as a SAST/Semgrep finding's sink,
  and finds the routes that reach it. Use when asked to walk through, trace, diagram, explain or
  "code tour" a flow, route, feature or finding.
---

# Code walkthrough: sequence diagram + CodeTour

Produce, for each flow, one spec file that a bundled script turns into a CodeTour and a Mermaid
diagram whose step numbers match one to one. The goal is **understanding**: a reader should follow
the diagram, open the tour, and see where each step lives in the code, what goes in and what comes out.

## Inputs

- **Target** (required): a route (`GET /orders`), a feature ("how users reset their password"), or a
  code location (`src/repositories/orderRepository.js:8`, a function name, or findings in a scanner
  report such as `semgrep.json`).
- **Output directory** (optional): defaults to `docs/flows/` for specs and pages, `.tours/` for tours.

If the target is ambiguous, ask once. Otherwise proceed.

## Files in this skill

- `${CLAUDE_PLUGIN_ROOT}/skills/code-walkthrough/references/flow-spec.md`: the spec format. **Read it before writing a spec.**
- `${CLAUDE_PLUGIN_ROOT}/skills/code-walkthrough/scripts/walkthrough.mjs`: builds and checks the outputs. Run it from the target repo root:
  `node ${CLAUDE_PLUGIN_ROOT}/skills/code-walkthrough/scripts/walkthrough.mjs build docs/flows` (or `check`).

## Ground rules

1. **Evidence only.** Every code step points at code you read, through a `pattern` that matches
   exactly once. Never guess a location.
2. **Never fabricate examples.** Requests, responses, status codes, error bodies and log lines are
   either captured from the running app in this session, or derived from the code and labelled
   `(derived from code, not run)`. Never present derived output as observed.
3. **Explain, don't judge.** Describe what the code does ("`sort` is not validated",
   "`tableName` is written into the SQL text"). Don't give exploitability verdicts or severities:
   that's a triage task, not a walkthrough.
4. **Local and harmless only.** If you run the app, run it locally, send only normal requests and
   the error cases the flow already handles (missing auth, wrong role, invalid input). No attack
   payloads. Stop anything you started when you're done.
5. **Don't touch application code.** Write only the spec files and the generated outputs.

## Step 1: Find the flows

- **From a code location:** find every caller, up to the entry points: search for the function
  name, then its callers' names, until you reach route declarations, message consumers, jobs or CLI
  commands. Each entry point that reaches the location is **one flow**. List them with the call
  chain as evidence (`route → controller.fn → service.fn → repo.fn`), and say explicitly if a
  location has no caller or several.
- **From a route or feature:** find the route declaration and follow it forward.

## Step 2: Read the whole path

Read every file on the path completely, not just the lines around the call: app setup (middleware
order, body parsers, error handler), router, every middleware in the chain, controller, service,
data access, config the flow reads, and the view/template if one renders the result.
Note where each value comes from and every time a value is **renamed** between layers.

## Step 3: Capture real examples

If the app can run locally (README, `package.json` scripts, docker-compose), start it and send
requests for the success case and for **every error branch** the flow has: no credentials, invalid
credentials, wrong role, invalid input, not found, and a server error if a normal input causes one.
Record the exact status line and body, plus any relevant server log line. If it can't run, derive
the examples from the code and label them as derived.

## Step 4: Write the spec

One `docs/flows/<id>.flow.json` per flow, in the format of `${CLAUDE_PLUGIN_ROOT}/skills/code-walkthrough/references/flow-spec.md`.

**Steps**
- Step 1 is the client's HTTP request (text only): a sample request, then a table of every possible
  response (case, status, body).
- Then one step per meaningful hop, in execution order: app setup / router mounting, route
  declaration (with its handler chain), each middleware check, each controller action (read input,
  validate, call the next layer), each service decision, the data-access call, the external system
  (database, HTTP API; text only), and the response(s), including the error handler.
- A step is worth its own number if it: moves the request to another file or layer, reads or
  transforms an input, enforces a control (`kind: control`), renames a value, or is the location
  being asked about (`kind: sink`). Merge trivial pass-throughs into the next step.
- Include every security-relevant location on the path, even the ones that look fine: that's
  what the reader needs to compare.
- **Title:** `Layer: action`, 2–6 words. **Pattern:** capture exactly the part the description
  talks about (the argument, the condition, the interpolation), not the whole line.
- **Description**, in this order: `**What happens:**` (1–3 sentences) · example (request,
  value, SQL, response or error, in a fenced block) · `**Security:**` (optional, factual) ·
  `**Next →** <the call that invokes the next step> (step N)`.
- `note`: 1–3 short lines for the diagram: the key code, a concrete value, or "x is not checked".

**Lanes**
- Same order in every flow of a run, left to right as the request travels:
  Client · Framework/routing (`Express`) · Auth · Controller · Config (only if read) · Service ·
  Store (data access) · external systems (`Postgres`, an API). Drop lanes a flow doesn't use; don't
  reorder them.
- Several files in one lane is expected (app setup + router, auth middleware + user lookup).
  The script draws them as stacked file boxes in one column; add a self-arrow for each hand-off
  between files in the same lane.

**Diagram**
- Wrap consecutive events in **phases**: Routing · Authentication (· Authorization) · Input handling
  · Data access · Response. Add Business logic, External call or Rendering only if the flow has them.
- Every call is a solid arrow labelled with the actual call (`requireAuth(req, res, next)`,
  `find(user.id, status, orderBy)`); every return and response is dashed.
- Every error exit is a `break` with the real response. Use `alt` only for a fork where both
  branches continue (rows vs. database error).
- Show values being renamed across layers with a note (`sort is renamed orderColumn`).

## Step 5: Build and check

```
node ${CLAUDE_PLUGIN_ROOT}/skills/code-walkthrough/scripts/walkthrough.mjs build docs/flows
node ${CLAUDE_PLUGIN_ROOT}/skills/code-walkthrough/scripts/walkthrough.mjs check docs/flows
```

Fix every reported problem (pattern matched 0 or 2+ times, unknown lane, step missing from the
diagram) and rebuild until `check` passes. Then open each generated `docs/flows/<id>.md` and read the
step table: every code location must be the line the step talks about.

## Step 6: Report

Tell the user:
- the flows found, and the evidence for how the target is reached (call chain per entry point);
- the files written (`docs/flows/*.flow.json`, `docs/flows/*.md`, `.tours/*.tour`);
- which examples were captured from the running app and which were derived;
- how to follow along: install the CodeTour extension (`vsls-contrib.codetour`), open the tour,
  step N = diagram step N; after code changes, re-run `build` (the command above) to move the highlights with the code,
  or `check` in CI.
