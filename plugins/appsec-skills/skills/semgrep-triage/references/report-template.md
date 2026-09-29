# Triage report format

One Markdown file: `docs/triage/semgrep-triage.md` (or the path the user gives). **Lists only,
never tables.** `scripts/triage.mjs check` enforces the structure below.

## Report skeleton

```markdown
# Semgrep triage: <repo name>

- **Scan:** Semgrep <version> · <config> · <N> findings (<counts per severity>) · <date>
- **Method:** each finding → source-to-sink trace → controls checked against the wiki (threat page + stack example file, including *Bypasses to check*) → verdict → severity from the rubric below.
- **Traces and tours:** `docs/traces/*.md` and `.tours/source-to-sink-*.tour`. Tour step N = card N in each diagram.
- **Assumptions:** <e.g. "sign-up is closed: accounts are created by admins (README)"; anything you couldn't confirm>

## Summary

**<n> to fix: F1, F3.** <n> dismissed, each with the reason, what would turn it into a true positive, and a decision on the rule.

- **F1 · <short title>** · `<file>:<line>`
  - ✅ **True positive** · 🟠 **High** · confidence High · Semgrep: WARNING
- **F2 · <short title>** · `<file>:<line>`
  - ❌ False positive · confidence High · Semgrep: WARNING
  - Rule: keep enabled, suppress this instance

> [!info]- Severity rubric (click to expand)
> <copy the rubric below>

> [!info]- Rule decision guide (click to expand)
> <copy the guide below>

---

## F1 · <short title> · ✅ True positive · 🟠 High
...
```

Number findings F1..Fn in the order of the scan output. Separate findings with `---`.
Mark a severity that differs from Semgrep's with ⬆️ (we rate it higher) or ⬇️ (lower) in the
summary and the finding title, and say why in the Assessment.

## Finding sections

Every finding starts with this header list:

```markdown
- **Rule:** `<short rule id>` · Semgrep: <SEVERITY>, impact <X>, likelihood <Y>, confidence <Z>
- **Location:** `<file>:<line>` (<the exact expression if it's on another line>)
- **Threat:** <threat name> · wiki: `threats/<category>/<threat>.md`, `examples/<threat>/<stack>.md`
- **Verdict:** ✅ True positive | ❌ False positive: <one-line reason> | ❌ Not applicable: <one-line reason>
- **Severity:** 🟠 **High** = Impact High × Likelihood Medium | n/a
- **Confidence:** High | Medium | Low: <what it rests on, and what would change it>
```

Then, **for a dataflow finding** (a value reaches a sink), in this order:

- `**Sink:**` the dangerous call and the exact value in it; say which values are safe (bound, escaped) and out of scope.
- `**Inputs reaching it**`: one bullet per source, from the trace:
  `- 🔴 **\`req.query.sort\`** (\`file:line\`): user input, any logged-in user → **reaches the sink unchanged**`
  Origins: 🔴 user input · 🟢 authenticated identity · 🔵 config · ⚪ constant · 🟣 stored data · 🟠 external service.
- `**Source-to-sink trace**`: a bullet with the tour and page paths, then a line
  `<!-- trace: <trace id> -->`. `triage.mjs embed` puts the diagram after it.
- `**Controls on the path**`: one bullet per control: what it is, where, and whether it covers the value
  (🛡 covers · 🚫 doesn't cover · plain for gates that only decide who can send it). Include "none" for
  expected controls that are missing (an ownership check, an allowlist).
- `**Wiki checks**` (`<example file>` · Bypasses to check): the items from the stack file that apply, each
  with what you found. Say when an item rules something out, too.

**For a finding with no dataflow** (the rule checks configuration or a missing library), instead:

- `**Source-to-sink trace:** none. <why: what the rule actually matches>`
- `**What the rule checks:**` in one or two sentences.
- `**Why it doesn't apply**` or the reasoning, citing the wiki page's *When is it relevant*.

**True positives** then add:

- `**Assessment**`: `- **Impact: <level>.** <what an attacker gets, concretely>` and
  `- **Likelihood: <level>.** <who can reach it, how many requests, any victim interaction>`, plus
  `- **Why Semgrep says less/more:**` when the severity differs from Semgrep's.
- `**Suggested fix**`, with these bullets:
  - `- **Change:**` where the fix goes (`file:line`) and what it does, naming the wiki's *Mitigation
    option* for the stack it follows (`pg.md`: identifiers from an allowlist).
  - `- **Code** (suggestion, not applied):` followed by a fenced code block with the changed function
    or lines, in the project's style. Show enough context to apply it; comment only the non-obvious line.
  - `- **Why it holds:**` why the value can no longer reach the sink unsafely, including the bypasses
    from *Bypasses to check* that it closes.
  - `- **Also:**` / `- **Better long term:**` optional: defence in depth or a structural change.
  - `- **Verify:**` harmless requests or tests and what they return after the fix, and what Semgrep
    will report afterwards (a finding that stays because the pattern remains needs a suppression
    comment pointing at the fix).

**False positives and not-applicable findings** then add:

- `**Why it's a false positive:**` (or `**Why it doesn't apply:**`), one or two sentences.
- `**Residual note (not a vulnerability):**` optional: hardening worth doing anyway.
- `**Residual risk:**` optional: what the verdict relies on (a library's correctness, a config).
- `**Would become a true positive if:**` (or `**Would become applicable if:**`) the concrete change that
  would flip the verdict.
- `**Rule decision: disable the rule?**` with these bullets:
  - `- **Decision:** disable for this repo | keep enabled, suppress this instance | keep enabled, no suppression`
  - `- **Why:** <how often this rule is right in this codebase, e.g. "1 of its 2 hits in this scan is a true positive">`
  - `- **How:** <the exact suppression comment with the full rule id, or the --exclude-rule / config change>`
  - `- **Revisit if:** <the change that should bring the rule back>`

**Every finding** ends with:

- `**Evidence**`: bullets labelled *Code:* (quoted, with `file:line`), *Observed (local, <date>):*
  (only requests you actually sent in this session), *Derived from code, not run:*.
- A collapsed callout, always titled exactly `Evidence (Manual Reproduction)`:

```markdown
> [!example]- Evidence (Manual Reproduction)
> 1. **Open the finding:** ...
> 2. **Read the sink:** `file:line` ...
> 3. **Find who calls it:** `grep -rn "<name>" src` → `<file:line>` ...
> 4. ... one step per hop back to the source, with the exact search that finds it
> 5. **Find who can send it:** the route and its middleware
> 6. **Or follow it in VS Code:** CodeTour → *<tour title>*
> 7. **Confirm on your local instance** (how to start it): harmless `curl` requests and what they return
```

Steps must be repeatable by someone who hasn't read the report: exact files, exact searches, exact
requests with the seeded test credentials. Only harmless requests (normal use, a missing or invalid
value, another test user's own data). Describe any stronger confirmation in words; never write an
attack payload.

## Severity rubric

Copy into the report's rubric callout.

- **Impact:** what an attacker gets.
  - **High:** read or change data beyond their own, obtain secrets or credentials, run code, act as another user.
  - **Medium:** limited data exposure or change, or it needs another bug to matter.
  - **Low:** minor information leak, no direct security effect.
- **Likelihood:** who can reach it and how hard it is.
  - **High:** unauthenticated, a single request, no victim interaction. Also **any authenticated user when anyone can sign up** (check: is there a public registration route?).
  - **Medium:** any authenticated regular user when accounts aren't self-service, or it needs victim interaction.
  - **Low:** a privileged role (admin, internal), or unlikely preconditions.
- **Severity = Impact × Likelihood:**
  - **High impact:** High likelihood → 🔴 Critical · Medium → 🟠 High · Low → 🟡 Medium
  - **Medium impact:** High likelihood → 🟠 High · Medium → 🟡 Medium · Low → 🟢 Low
  - **Low impact:** High likelihood → 🟡 Medium · Medium → 🟢 Low · Low → 🟢 Low
- **Confidence** says how sure the verdict is, and what would change it.
  - **High:** every hop confirmed in code, and the key behaviour confirmed locally or unambiguous.
  - **Medium:** the verdict rests on a library or config behaving as documented, or one hop couldn't be confirmed.
  - **Low:** important parts are inferred; say what's missing.

## Rule decision guide

Copy into the report's guide callout. Asked for every false positive: would this rule mostly produce
false positives here?

- **Disable for this repo:** the rule can't be right in this codebase (it checks for something the
  design makes irrelevant), so every hit will be a false positive.
- **Keep enabled, suppress this instance:** the rule finds real bugs in this codebase (or the pattern is
  worth a look every time), and this hit is an exception. Suppress it with a comment pointing at this
  triage, so the next reviewer sees why.
- **Keep enabled, no suppression:** the false positive depends on something that could change soon;
  let it come back.

## Example finding (made-up app, for shape only)

```markdown
## F2 · SSRF in link preview · ❌ False positive

- **Rule:** `requests-ssrf` · Semgrep: WARNING, impact HIGH, likelihood MEDIUM, confidence LOW
- **Location:** `app/previews.py:14`
- **Threat:** SSRF · wiki: `threats/source-to-sink/ssrf.md`, `examples/ssrf/python.md`
- **Verdict:** ❌ False positive: the URL is built from a fixed host and an allowlisted path
- **Severity:** n/a
- **Confidence:** High: the host is a constant, and the only user input is checked against a fixed list

**Sink:** `requests.get(url)`; `url` is the full request URL.

**Inputs reaching it**
- ⚪ **`PREVIEW_HOST`** (`app/settings.py:8`): constant → **reaches the sink** as the host
- 🔴 **`request.args['page']`** (`app/views.py:22`): user input, anonymous → reaches the sink only after the allowlist

**Source-to-sink trace**
- Tour: `.tours/source-to-sink-2-preview-url.tour` · page: `docs/traces/preview-url.md`

<!-- trace: preview-url -->

**Controls on the path**
- 🛡 Page allowlist (`app/views.py:23`): **covers it**: only `home`, `pricing` and `docs` pass

**Wiki checks** (`python.md` · Bypasses to check)
- *Host built from input:* no, the host is a constant: ✅
- *Redirects followed to another host:* `allow_redirects=False` (`previews.py:14`): ✅

**Why it's a false positive:** the user picks one of three fixed paths on a fixed host.

**Would become a true positive if:** the allowlist is removed, or the host moves into a request parameter.

**Rule decision: disable the rule?**
- **Decision:** keep enabled, suppress this instance.
- **Why:** outbound requests are rare in this codebase and each one deserves a look.
- **How:** `# nosemgrep: python.requests.security.requests-ssrf` on `previews.py:14`, with "fixed host, allowlisted path, see triage F2".
- **Revisit if:** the preview feature accepts arbitrary URLs.

**Evidence**
- *Code:* `url = f"https://{PREVIEW_HOST}/{page}"` (`previews.py:12`); `if page not in ALLOWED_PAGES: abort(400)` (`views.py:23`).
- *Observed (local, 2026-01-10):* `?page=home` → 200 with the preview; `?page=other` → 400.

> [!example]- Evidence (Manual Reproduction)
> 1. **Read the sink:** `app/previews.py:14`, `requests.get(url)`.
> 2. **Find how `url` is built:** `previews.py:12`, from `PREVIEW_HOST` and `page`.
> 3. **Find who calls it:** `grep -rn "fetch_preview" app` → `app/views.py:24`, with `page` from `request.args`.
> 4. **Read the check:** `views.py:23`, `ALLOWED_PAGES` is a fixed tuple (`settings.py:9`).
> 5. **Or follow it in VS Code:** CodeTour → *Source to sink 2*.
> 6. **Confirm on your local instance** (`make run`): `curl -s -o /dev/null -w "%{http_code}" "localhost:8000/preview?page=other"` → 400.
```
