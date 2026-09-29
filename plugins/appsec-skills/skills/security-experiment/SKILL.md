---
name: security-experiment
description: >-
  Build a short, runnable notebook that shows why a security control makes a sink safe (or why
  its absence doesn't): one classic payload goes through the application's real steps, first
  without the control, then with it, printing the value after every step with the dangerous part
  highlighted, until the payload disappears (or reaches the sink). Works for sanitisers, encoders,
  validators, allowlists, parameterised queries and path checks. Use when asked why a finding is a
  false positive, to prove or demonstrate a control, to show what a sanitiser removes, or to
  "experiment" with a payload against the code.
---

# Security experiment

Answer one question with a notebook the user runs **step by step**: *"The sink is dangerous. Why
does this control make it safe?"* (or *"why doesn't it?"*). It should be a 2–3 minute read: the
user presses Shift+Enter on each cell and watches the payload survive every step without the
control, then disappear at the control's step.

## Inputs

- **The question** (required): a sink and a control, e.g. a triage finding
  ("`comments.ejs:18` is safe because of DOMPurify"), or a control to demonstrate.
- **Output** (optional): defaults to `experiments/<id>.ipynb`.

If `docs/triage/*.md` or `docs/traces/*.trace.json` exist, read the finding and its trace first:
they give the sink, the control, the steps in between, and the "would become a true positive if"
conditions to mention.

## Files

- `${CLAUDE_PLUGIN_ROOT}/skills/security-experiment/templates/show.ts`: the step logger. Copy it to
  `experiments/lib/show.ts`.
- `${CLAUDE_PLUGIN_ROOT}/skills/security-experiment/scripts/notebook.mjs`: `build` (cells file →
  notebook) and `verify` (runs a copy, prints every cell's output, checks the saved notebook is
  empty). Run from the repo root.

## Ground rules

1. **The application's real steps.** Every step calls the same function or library call the app
   uses, in the same order, with the **same library versions** (pinned from the lockfile). Read the
   app's code first. Render or build the sink's actual output with the app's own template, query
   builder or path code wherever you can.
2. **One classic, harmless demonstration payload** (e.g. `<img src="x" onerror="alert('XSS')">`,
   `' OR '1'='1` for a query shown as text, a `../` path resolved against a temp folder). Nothing
   that reaches real systems, reads real secrets, or changes data. Never send it to a running app.
3. **Don't change application code.** Write only under `experiments/`.
4. **Keep it short.** One question, one payload, one sink. Lists, never tables.

## Runtime

- **JavaScript / TypeScript project:** a **Deno** notebook (kernel `deno`). Import the app's
  libraries with pinned `npm:` specifiers (`npm:dompurify@3.4.16`, versions from
  `package-lock.json`), and add `experiments/deno.json` with `{ "nodeModulesDir": "none" }`, so
  Deno uses its own npm cache instead of the repo's `node_modules` (some packages, like jsdom's
  dependencies, don't load from there). Set libraries up the way the app does (e.g.
  `isomorphic-dompurify` is DOMPurify on a jsdom window). App modules without dependencies, and
  templates read from disk, can be used directly.
- **Python project:** a `python3` notebook that imports the app's modules.
- **Anything else,** or a step that can't run in the notebook: call a small script that runs that
  step in the project's own runtime, and print what it returns.

Prerequisites: `jupyter` (e.g. `pipx install jupyter --include-deps`) and, for Deno,
`deno jupyter --install`. If they're missing, tell the user the install commands; don't install
system packages yourself.

## The notebook, cell by cell

Write the cells in a Markdown file, then build it:
`node ${CLAUDE_PLUGIN_ROOT}/skills/security-experiment/scripts/notebook.mjs build experiments/<id>.cells.md experiments/<id>.ipynb`.
Every fenced ```` ```ts ```` / ```` ```python ```` block becomes a code cell; the text between becomes a
markdown cell (split with `<!-- cell -->`).

1. **Title and question** (markdown): `# Why <control> makes <sink> safe`. Two or three sentences:
   the sink (`file:line`, what it does with the value, why the scanner flags it), and the one line
   of app code that holds the control, quoted.
2. **Setup** (code): pinned imports with a comment saying they match the app, the library set up
   as the app does, `setDanger([...])` with the payload's **active part** (what makes it dangerous
   at this sink), the payload, and the step variables declared with `let` so any cell can be
   re-run. Prints nothing.
3. **Without the control** (a `## Without <control>` heading): **one step per cell**, each with a
   one-line bold heading (`**2 · Markdown → HTML** (\`marked.parse\`)`) and a code cell that does
   exactly one thing and logs it: `input = payload; log('input', input);`, then each app step, then
   the sink's real output (e.g. the rendered page fragment, cut out with its indentation and passed
   through `dedent()`). Then one sentence on what the browser,
   database or filesystem would do with it.
4. **With the control** (`## With <control>: what the app does`): the same steps again, one per
   cell, with the control **starting its own cell** (`sanitized = DOMPurify.sanitize(html);`), so the
   payload is visibly there in the cell before and gone in this one. In the same cell, list what the
   control removed or rejected and why (`logList`). Finish with the sink's real output again.
5. **Why that's enough, and what would break it** (markdown, three bullets): why it works, why
   it's enough *here* (last step before the sink, nothing changes the value afterwards), and what
   would break it (config, a change after the control, an outdated library). Take these from the
   triage report when there is one. End with one line: *try another payload: change `payload`,
   then re-run the cells*.

Output rules, learned the hard way:
- **One `console.log` per step** (`log`/`logList` do this). The Deno kernel can drop a cell's output
  when it is sent in many small pieces.
- **Keep step functions synchronous** where you can (read templates with `readTextFileSync`), so each
  cell's output is complete when the cell finishes.
- The saved notebook has **no outputs**: the user runs it. `build` writes it empty.

## Verify

`node ${CLAUDE_PLUGIN_ROOT}/skills/security-experiment/scripts/notebook.mjs verify experiments/<id>.ipynb --markdown experiments/<id>.md`

It runs a copy and prints what every cell printed. Check it tells the story: ⚠️ with the active
part at every step without the control, ⚠️ up to the step before the control, ✅ from the control's
step on, and the sink's real output at the end of both halves. Fix and rebuild until it does and
`verify` passes. Keep the `.cells.md` next to the notebook: it's the source.

## Report back

Tell the user: the notebook path; how to run it (VS Code with the Jupyter extension → Select
Kernel → Jupyter Kernel… → Deno or Python; if the Deno kernel isn't listed, select a Python
interpreter that has Jupyter installed, then reload the window); the story in four lines (payload,
where it survives, where the control removes it, what reaches the sink); and the readable copy
(`experiments/<id>.md`).
