# Using the skill

`secure-code-review` is a [Claude Code](https://code.claude.com/docs) skill that
runs the [methodology](methodology.md) against a pull request, commit or diff,
using this wiki as its reference.

## Install

```
/plugin marketplace add mohamed-osama-aboelkheir/appsec-untangled-resources
/plugin install appsec-skills@appsec-untangled
```

## Run it

From the repository you want reviewed:

```
/appsec-skills:secure-code-review 128          # a pull request
/appsec-skills:secure-code-review HEAD         # a commit
/appsec-skills:secure-code-review main..HEAD   # a range
```

Plain English works too: *"do a security review of PR 128, output to
./security-review/"*. If you don't name a target it reviews the current branch
against its merge base.

Optional: paths to focus on, and an output directory (defaults to
`./security-review/`).

## What you get

A Markdown report and a self-contained HTML version beside it, following the
same [methodology](methodology.md) steps:

1. 🗺️ **Scope and architecture** — the change, its story as a sequence diagram, and the code behind each step
2. 🚪 **Entry points** — with the authorization model and who should be able to reach them
3. 🎯 **Dangerous sinks** — including the ones searched for and not found
4. 🧩 **Threat model** — both categories, plus the threats considered and ruled out
5. 🔍 **Mitigation analysis** — one card per threat with evidence, and for anything unmitigated:
    - 💥 **Exploitability** — who could abuse it and what they would need
    - 🛠️ **Suggested fix** — the smallest change that closes it
6. ✅ **Action items** — everything open, in one table

The HTML needs nothing installed and works offline. See the
[example report](example-report.html), and the
[Markdown template](https://github.com/mohamed-osama-aboelkheir/appsec-untangled-resources/blob/main/plugins/appsec-skills/skills/secure-code-review/templates/security-review-report.md)
it is rendered from.

## How it uses the wiki

It reads the [threat pages](threats/index.md) to decide which threats apply,
then reads **only the example files matching the project's stack**. Reviewing an
Express app with `pg` and EJS, it opens `express.md`, `pg.md`, `ejs.md` and
`node.md`, and never the Django or Prisma ones. That keeps a review's context
roughly constant no matter how many stacks the wiki grows to cover.

Where a stack has no examples yet, it falls back to the stack-agnostic checklist
on each threat page and says so in the report.

## What it will not do

- **It does not exploit anything.** For unmitigated threats it writes two or
  three sentences on who could abuse it and what they'd need, never attack steps
  or payloads.
- **It does not look up the project's CVEs, advisories or release notes**, and
  does not read commits newer than the target. The report has to show what the
  method finds from the code alone.
- **It does not modify the reviewed code** or post findings anywhere. Report
  real findings through the project's own security policy.

## Getting better results

- Point it at a **change**, not a whole repository, where you can. The method
  works on a diff plus the code around it.
- Tell it the business rules it can't infer: who is meant to see what, which
  roles exist, what a tenant means in your app.
- Treat ❓ **Needs verification** as work, not noise — it marks what the code
  alone couldn't settle.
- A finding still needs a human to confirm. The report has a verification
  checkbox in its header for exactly that.

## Adding your stack

Examples live beside the wiki pages, one file per technology. The naming rules
and the shape of an example file are in
[CONTRIBUTING.md](https://github.com/mohamed-osama-aboelkheir/appsec-untangled-resources/blob/main/CONTRIBUTING.md).
