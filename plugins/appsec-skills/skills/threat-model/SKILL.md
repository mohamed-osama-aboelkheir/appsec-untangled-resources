---
name: threat-model
description: Builds a threat model with the Doors, Windows & Holes method from the AppSec Untangled wiki, for a design doc, a feature description, an architecture or a repository. Writes the problem and stories, answers the template's scope questions, groups doors (entry points), windows (hidden entry points) and holes (dangerous sinks), adds business-logic and source-to-sink threats with shared mitigations, and ends with a testing plan of point-in-time and continuous tests per mitigation. Runs in four stages with a user review after each (stories, doors/windows/holes, threats and mitigations, tests) unless asked for one shot. Outputs Markdown and JSON, and can fill the Notion threat model template. Use when asked to threat model a system, feature, design or repo.
---

# Threat model (Doors, Windows & Holes)

Answer the four questions for a system or a feature, in developer language:
what are we working on, what can go wrong, what are we going to do about it,
and did we do a good job. The aim is a **useful** model that a team reads and
acts on in one meeting, not a complete one.

## Inputs

- **Target** (required): a design doc, a feature description, an architecture
  diagram, a repository (code, Terraform, CDK, CloudFormation, OpenAPI), or a
  mix.
- **Mode** (inferred, confirm if unclear):
    - **design**: no code yet. Mitigations are what *must* be true; statuses
      start as ❓ Needs verification; label every inference as an assumption.
    - **code**: a repository exists. Check each mitigation against the code and
      cite `path:line`.
    - **feature**: a change to a system that already has a model (a
      `threat-model.json` or a filled Notion template). Model only the delta,
      and add to existing groups where the new door, window or hole fits.
- **Run** (optional): **iterative** (the default) or **one-shot**. See below.
- **Notion page** (optional): the URL of a copy of the Notion threat model
  template to fill. See step 6.
- **Output directory** (optional): defaults to `./threat-model/`.

Ask the user only for what you can't derive: the goal, the users and roles,
and anything about the deployment the material doesn't show. Ask once, in one
message, then proceed with stated assumptions. A design's own "Assumptions"
section is stated design, not your assumption.

## Iterative or one-shot

A mistake in an early step (a missing story, a wrong group) spreads into every
later one, so by default the skill stops for review after each stage:

| Stage | Steps | Ends with |
|---|---|---|
| 1 · Stories | Step 1 | Problem, stories, general scope and its two questions |
| 2 · Doors, windows and holes | Step 2 | Every scope question answered, the groups |
| 3 · Threats and mitigations | Step 3 | Threats, shared mitigations, ruled-out lines |
| 4 · Tests | Step 4 | The testing plan, and the outputs complete |

At the end of each stage:

1. Write the outputs so far (step 5): `threat-model.md` with the sections
   done, and `threat-model.json` with `system.stage` set to the stage just
   finished and the later arrays empty. With a Notion page, fill that stage's
   part of the page too (see `references/notion.md`).
2. Reply with a short summary of the stage (counts, the assumptions you made,
   what you're least sure of) and ask the user to review it: "Reply *go* to
   continue, or tell me what to change."
3. Stop. Don't start the next stage until the user replies.

When the user asks for a change, apply it, then re-check the stages already
done that depend on it (a new story can add a door; a merged group moves its
threats) before you ask again. When the skill starts and the output directory
already holds a `threat-model.json` whose stage isn't `complete`, offer to
continue from the next stage.

**One-shot**, when the user asks for it ("one shot", "no review", "all at
once"): run all four stages without stopping and write the outputs once.

## Ground rules

1. **Useful, not complete.** Prefer ten threats people will fix over a hundred
   they won't read. Respect the budget in step 3.
2. **Developer language.** Name routes, tables, roles and buckets, not STRIDE
   categories or CWE IDs. Every threat's title is **What** (the attack), with
   **Who** and **Impact** beside it.
3. **Evidence or assumption.** In code mode every claim cites `path:line`.
   In design mode every claim the design doesn't state is marked
   *Assumption* and listed under open questions.
4. **Model, don't exploit.** No attack payloads or exploitation steps. Tests
   say what to send and what must happen, not how to weaponise it.
5. **Confidential.** The model describes weaknesses. Write it only to the
   output directory or the Notion page the user named. Don't post it anywhere
   else.

## The wiki and the questions

Read from `${CLAUDE_PLUGIN_ROOT}/wiki/docs/`:

- `threat-modeling/index.md`: the method, the grouping rule and the threat
  format. **Read it first.**
- `threat-modeling/doors.md`, `threat-modeling/windows.md`,
  `threat-modeling/holes.md`: where to look and what to record for each.
  `windows.md` has the de-abstraction checklist per component type.
- `threat-modeling/business-rules.md`: the "what else must hold?" checks.
- `threat-modeling/testing-plan.md`: point-in-time and continuous tests.
- `threats/business-logic/*.md` (bucket 1) and `threats/source-to-sink/*.md`
  (bucket 2): one page per threat. List the folders at run time; skip
  `index.md`. Read **When is it relevant** to rule a page in or out, then
  **Mitigation** and **Test** for each threat you keep.

And `${CLAUDE_PLUGIN_ROOT}/skills/threat-model/references/questions.md`: the
scope questions from the Notion template, each with the group, threats and
starting mitigation a yes adds. Steps 1 and 2 answer every one of them.

Don't read `wiki/examples/` in design mode. In code mode, follow the
`secure-code-review` skill's rule: for a threat you are checking, read only
the one example file that matches the project's stack, when you reach it.

## Step 1: Problem, stories and general scope (what are we working on?)

The problem and the stories come first: everything else is built from them.

1. **What**: the problem and goal, in a sentence or two.
2. **How**: the **stories**, each way the system is meant to be used. For
   each, a title, one sentence, and a Mermaid `sequenceDiagram` with
   `autonumber`, from the actor through every component to the data store,
   with a `Note` for the log line a step writes where it matters. Name them
   `S1`, `S2`… so later steps can cite "S3 · step 4". Five to eight is typical
   for a system, one to three for a feature.
   - Code mode: derive them from the README, router, OpenAPI spec, IaC and UI.
3. **General scope**, in short bullets: users and roles, whether it serves
   several organizations, data and how sensitive it is, other assets, links.
   Answer the general questions in `questions.md`.

If the material names something no story touches, add the missing story
rather than listing it bare.

## Step 2: Doors, windows and holes (what are we working on?)

Walk the stories and answer **every** door, window and hole question in
`questions.md`, in order, as yes, no or not in scope, with a one-line note.
Under each section, list what it covers (the routes, buckets, queries).

1. **Doors**: every step where an actor hands the system input
   (`doors.md`). Record who is meant to use it, the input, and the
   authentication.
2. **Windows**: de-abstract every box in a story with the checklist in
   `windows.md` (what is it really, who else can reach it, write to it or read
   from it, what credentials live in it or near it), then sort what you find:
   - **Trusted windows** get their own group and threats: the ones a story
     step *relies on* to be true, so that writing to or reading from them
     breaks the story. Typically the queue a worker trusts, the bucket that
     holds customer files or serves the code, the identity provider whose
     groups grant roles, the compute that holds the secrets, the file the
     system exports and someone acts on.
   - **Everything else** (the database's network exposure, the email
     provider, DNS and the registrar, the repository and CI/CD, IaC state,
     account-wide IAM, logs, a mobile client, SaaS dashboards) goes into
     **one platform group** with at most one threat per kind that matters,
     or into its `ruledOut` line. For a feature, include one only if the
     feature changes it. Secrets get a window of their own only when no
     trusted window holds them.
3. **Holes**: every step that stores, renders, runs, fetches or writes
   something input can reach, using the sink catalogue in `holes.md`. Tokens
   the system issues and later checks (QR codes, unsubscribe links, reset
   tokens) are threats at the door that receives them, not holes.
4. **Group** them with the rule in `index.md` (same enforcement point, same
   rule, and for holes the same sink through the same function). Each group
   gets an id (`D1`, `W1`, `H1`), a name in business terms, its **Members**,
   a one-line **Grouped because**, and the story steps it appears in. Split
   any outlier into its own row and say why: it is usually where the bug is.
   **Order the groups doors, then windows, then holes**, each in story order.

A yes answer adds the group (or a member to an existing one) and the threats
the question lists. A question whose threat already exists elsewhere ("the
organizer role is checked at the Cognito window") points at that threat
instead of adding a second one. Answer each question **yes**, **no** or
**not in scope** (the material doesn't cover it), shown as ✅, ⛔ and ➖.

In code mode, confirm groups from the code: the same middleware on the router,
the same repository or query helper, the same IAM policy. A member that
doesn't use the shared control is an outlier.

## Step 3: Threats and mitigations (what can go wrong, and what are we going to do about it?)

For each group, starting from the threats step 2 added:

- **Doors and windows (category: business logic)**: AuthN, AuthZ (object,
  function, property, tenant) and "what else must hold?" from the
  business-logic pages and `business-rules.md`. For windows the caller is
  often a cloud principal, a pipeline or a third party.
- **Holes (category: source to sink)**: name the attack from the
  source-to-sink pages (or `holes.md` when no page exists), **trace it back to
  every door** its input enters through (`sourceDoors`), including through
  queues and stored data, and pick the mitigation kind: no user input reaches
  it, a safe function, or validation or sanitization, in that order of
  preference.

**AuthN first.** Every door that is not public by design needs an AuthN
threat, even when the design already names the control: the threat is what
makes the control testable. Write **one AuthN threat per authentication
mechanism** (the bearer-token middleware, the webhook signature, the QR
signature), linked to every door that relies on it, not one per door. Then
the AuthZ threats, then the business rules. After that, write a threat only
where the answer could be "yes, someone can".

**One threat, several doors.** Whenever the same attack is stopped by the
same control at several doors or windows (AuthN, an audit log, a rate limit),
write it once and link it to all of them (`groups`). In the Markdown, list
it under the most sensitive of them, and add "also at …".

Every threat has: a **title** that is the What, **Who**, **Impact**,
**Category**, the **library threat** (wiki page) it comes from, **Status**,
**Severity**, and the **mitigations** that stop it.

**Mitigations** are their own list. Each says what must be true, adapted from
the wiki page's checklist and the starting mitigation in `questions.md`, with
its **kind**, **status** and **evidence**. In design mode a mitigation is
`📝 Planned` when the design states it, `❌ Missing` when the design draws the
step without it or contradicts it, and `❓ Needs verification` otherwise. When two threats are stopped by the same
control (one owner check on two routes), they share one mitigation; don't
write it twice.

For each group, list the pages ruled out in one line each ("CSRF: bearer
token in a header, no cookies").

**Budget**: about 10 to 25 threats for a feature and 30 to 40 for a whole
system, with doors and holes taking most of them. If you are over, you have
not grouped enough: merge groups that share the control, write one threat for
the same attack at several doors, merge threats on one group that share one
mitigation, or move windows nothing trusts into the platform group. Never
drop a high-severity threat to meet the budget.

**Threat status**: ✅ Mitigated **only when a test of its mitigation has
passed** (so never in design mode, where nothing has run). Otherwise take the
worst of its mitigations: any `❌ Missing` makes the threat ❌ Missing, any
`⚠️ Partial` makes it ⚠️ Partially mitigated, and the rest is ❓ Needs
verification. In design mode, mark a mitigation ❌ only when the diagram shows
the dangerous step itself (a queue any role can send to, a render step with
no sanitizer), not merely because a sketch leaves a control out.

**Severity**, from who can do it and what they get:

- **Critical**: needs no role beyond a free sign-up, and gets code execution,
  cloud credentials, the whole database, or money at scale (free tickets for
  everyone, not one cheap order).
- **High**: any signed-in user gets another user's data, tickets or actions,
  or money on their own orders; or a cloud principal or pipeline gets broad
  access.
- **Medium**: needs a privileged role or an unusual condition, or the impact
  is limited to one record or to abuse (spam, holding stock).
- **Low**: nuisance, or an impact the user mostly inflicts on themselves.

In code mode, set the status from the code the way `secure-code-review` does:
✅ Mitigated, ⚠️ Partially mitigated, ❌ Missing, ❓ Needs verification. Look
for the control in middleware, the handler, the data layer and the platform
before marking it missing.

## Step 4: Testing plan (did we do a good job?)

Every mitigation gets **one test** that would fail if the mitigation were
missing, from the threat page's **Test** section and `testing-plan.md`. Each
test has one **type**, **Point-in-time** (once, before release) or
**Continuous** (every change or on a schedule), and a **kind** (code review,
config review, dynamic test (Burp), pen test, unit, integration,
concurrency, SAST rule, policy-as-code, dependency scan, monitoring, other).
Pick the type that fits: continuous for controls in code and config that
change, point-in-time for things checked once.

Add a **second test of the other type** only when the mitigation stops a
Critical threat, or a High threat whose control lives in application code
that changes often (route handlers, middleware, query code): check it now,
then keep it true. Write **How** (what to send or check, and what must happen
to pass) and **Where it runs**. Risk-accepted threats need no test.

## Step 5: Write the outputs

In iterative mode, write them at the end of every stage with what is done so
far; in one-shot mode, once at the end.

1. `<output>/threat-model.md`, following
   `${CLAUDE_PLUGIN_ROOT}/skills/threat-model/templates/threat-model.md`. The
   template is a shortened dummy example: keep its structure, replace the
   content, and write every group, threat, mitigation and test, not an
   excerpt. Link each threat to the wiki page or heading it came from; for a
   sink with no page, link the `holes.md` sink catalogue.
2. `<output>/threat-model.json`, matching
   `${CLAUDE_PLUGIN_ROOT}/skills/threat-model/references/threat-model.schema.json`.
   It is what feature mode reads next time and what step 6 pushes to Notion.
   Check it parses (`node -e "JSON.parse(require('fs').readFileSync(process.argv[1]))" <file>`)
   and that every id it references exists.
3. Long models get truncated if written in one go: write the Markdown in parts.

## Step 6 (optional): Fill the Notion template

When the user gives a Notion page, or asks for Notion, follow
`${CLAUDE_PLUGIN_ROOT}/skills/threat-model/references/notion.md`. It needs the
Notion connector. Write to the page the user named, never to another one, and
in feature mode add rows instead of duplicating existing ones.

## Reply

In iterative mode, after stages 1 to 3 reply with the stage summary and the
review request (see above). After the last stage, or in one-shot mode, reply
with: the counts (stories, doors, windows, holes, threats, mitigations,
tests), the threats that are ❌ Missing or ⚠️ Partial with their severity, the
open questions, and the output paths or Notion link.
