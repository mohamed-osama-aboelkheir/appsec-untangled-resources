---
name: semgrep-triage
description: >-
  Triage Semgrep (or other SAST) findings: for each finding, trace the flagged value back to its
  sources, check the controls on the path against the AppSec Untangled wiki, and decide true or
  false positive, severity (impact × likelihood) and confidence. False positives get a decision
  on whether to disable or suppress the rule. Writes one Markdown report with source-to-sink
  diagrams, CodeTours and manual reproduction steps for every finding. Supports a learn mode
  where the user decides first. Use when asked to triage, review, validate or prioritise scanner
  findings, or to check whether a finding is exploitable or a false positive.
---

# Semgrep triage

Turn scanner findings into decisions the user can check. Every verdict is backed by a
source-to-sink trace, the wiki's controls and bypasses for the stack, and steps the user can repeat
by hand. The report explains *why*, so the reader learns the pattern, not just the answer.

## Inputs

- **Findings** (required): a Semgrep JSON file (`semgrep.json`), or run Semgrep if the user asks
  (`semgrep scan --config <config> --json --json-output=semgrep.json`). Other SAST JSON works if it has
  a rule id, a file and a line per finding.
- **Scope** (optional): specific findings (by rule or location). Default: every finding in the file.
- **Output** (optional): defaults to `docs/triage/semgrep-triage.md`.
- **`--learn`** (optional): learn mode, see the end of this file.

## Files

- `${CLAUDE_PLUGIN_ROOT}/skills/semgrep-triage/references/report-template.md`: the report format,
  severity rubric and rule decision guide. **Read it before writing the report.**
- `${CLAUDE_PLUGIN_ROOT}/skills/semgrep-triage/scripts/triage.mjs`: `findings`, `embed` and `check`.
  Run it from the repo root.
- `${CLAUDE_PLUGIN_ROOT}/skills/source-to-sink/`: builds the traces (see step 3).
- The wiki: `${CLAUDE_PLUGIN_ROOT}/wiki/docs/threats/<category>/<threat>.md` (**When is it relevant**,
  **Attack**, **Mitigation**) and `${CLAUDE_PLUGIN_ROOT}/wiki/examples/<threat>/<stack>.md`
  (**Mitigation options**, **Bypasses to check**, **What to grep for**).

## Ground rules

1. **Evidence or nothing.** Every claim cites `file:line` with the code quoted. If something can't be
   confirmed from the code, say so and lower the confidence. Never guess.
2. **Never fabricate results.** "Observed" means you sent that request in this session and saw that
   response. Everything else is "derived from code, not run".
3. **Harmless local requests only.** You may run the app locally and send normal requests: normal
   use, a missing or invalid value, one seeded test user accessing another test user's data. Never
   send or write down attack payloads (injection strings, traversal sequences, scripts). When a stronger
   confirmation would help, describe it in words in the manual reproduction steps.
4. **Judge the code, not its reputation.** Don't look up known vulnerabilities, advisories or CVEs for
   the project, and don't use later versions of its code.
5. **Read-only on the application.** Don't change application code or configuration, even to apply a
   suppression or a fix: recommend it in the report. Write only the traces and the report.
6. **Findings are confidential.** Don't post them anywhere (PR comments, issues, chat). Tell the user
   to report real vulnerabilities through the project's security process.

## Step 1: Load the findings and the context

1. `node ${CLAUDE_PLUGIN_ROOT}/skills/semgrep-triage/scripts/triage.mjs findings semgrep.json`: the rule
   ids, locations, Semgrep severity and metadata (impact, likelihood, confidence, CWE).
2. Record a **technology profile** (framework, database library, template engine, front-end, runtime),
   named the way the wiki's example files are (`express`, `pg`, `ejs`, `node`).
3. Find how users authenticate and **whether anyone can sign up** (a public registration route, the
   README). The likelihood rubric depends on it. Record it under **Assumptions**.
4. Reuse what exists: `docs/flows/*.flow.json` (walkthroughs: routes, gates, captured requests) and
   `docs/traces/*.trace.json` (traces whose sink card is at a finding's location).

## Step 2: Map each finding to a threat

From the rule id, message, CWE and the flagged code, pick the wiki threat page
(`threats/source-to-sink/*` for injection-style sinks, `threats/business-logic/*` for missing controls).
List the category folders to see what exists. Then read **only** the example file for the project's
stack (`examples/<threat>/<stack>.md`), one threat at a time, never the whole `examples/` tree. If no
file matches the stack, use the page's stack-agnostic **Mitigation** checklist and say so.

Decide whether the finding is a **dataflow finding** (a value reaches a sink) or not (the rule
checks configuration, a missing library, a setting). Only dataflow findings get a trace.

## Step 3: Trace every dataflow finding

For each dataflow finding without an existing trace, invoke the **`source-to-sink`** skill in
**backward mode** once, for all of them together (`appsec-skills:source-to-sink`), and follow it: one
trace per finding, chained in finding order, built and checked with its generator. Trace past the
flagged line when the real sink is later (Semgrep may flag `path.join`, while the file is read in
`fs.createReadStream` one call later). The trace gives you the report's **Inputs reaching it** and
**Controls on the path**.

## Step 4: Decide

For each finding:

1. **Check each control on the path** against the wiki page's **Mitigation** and the stack file's
   **Mitigation options**: is it the right control for this sink, applied to this value, last, and not
   changed afterwards? Then go through **Bypasses to check** and keep the items that apply, with what
   you found (including the ones you ruled out).
2. **Verdict:**
   - **True positive:** a source the attacker controls reaches the sink without a control that covers it.
   - **False positive:** no attacker-controlled value reaches the sink, or a control covers it.
   - **Not applicable:** the rule's concern doesn't apply to this design (check the threat page's
     **When is it relevant**).
3. **Severity** (true positives): Impact × Likelihood from the rubric. Compare with Semgrep's severity
   and explain any difference.
4. **Suggested fix** (true positives): pick the wiki's mitigation option that fits where the code
   already puts its checks, and write the change as code (not applied: ground rule 5), why it holds,
   and how to verify it. If the app runs locally, apply the fix to a **scratch copy** outside the repo
   and run the verify requests there, so the suggestion is tested; say in the report whether it was.
5. **Confidence**, with what it rests on.
6. **Dismissed findings:** what would make it a true positive, and the **rule decision** (disable for
   this repo / keep and suppress this instance / keep, no suppression) from the guide. Count how many
   of this rule's hits in the scan are true positives; that's the main argument.
7. **Evidence:** confirm the key behaviour with harmless local requests where possible (see ground rule
   3), and write the manual reproduction steps: exact files, exact `grep`s that find each hop, the tour,
   and the requests with seeded test credentials.

## Step 5: Write, embed, check

1. Write the report in the format of `report-template.md`, with a `<!-- trace: <id> -->` line in each
   dataflow finding's **Source-to-sink trace** section.
2. `node ${CLAUDE_PLUGIN_ROOT}/skills/semgrep-triage/scripts/triage.mjs embed docs/triage/semgrep-triage.md`
   inserts each trace's diagram from `docs/traces/<id>.md`.
3. `node ${CLAUDE_PLUGIN_ROOT}/skills/semgrep-triage/scripts/triage.mjs check docs/triage/semgrep-triage.md`
   and fix everything it reports (missing sections, tables, missing tours).

## Step 6: Report back

Tell the user: the summary list (verdicts, severities, rule decisions), which findings to fix first and their suggested fixes (and whether each was tested on a scratch copy),
where the report, traces and tours are, which evidence was observed and which derived, and the
assumptions (sign-up, stack). Remind them to report real findings through their security process.

## Learn mode (`--learn`)

For users building triage skills. Do steps 1–3 as usual, then for each finding, **before deciding**:

1. Show the finding, the trace diagram path and the tour, the inputs and the controls on the path.
2. Ask the user for their **verdict**, and for true positives their **impact and likelihood**. Wait
   for the answer.
3. Then show your decision with the evidence, and explain each difference: which control or bypass
   they missed or over-weighted, and which rubric line applies.

Write the report as usual, and add a `**Your call:**` bullet under each finding's header list
recording what they answered.
