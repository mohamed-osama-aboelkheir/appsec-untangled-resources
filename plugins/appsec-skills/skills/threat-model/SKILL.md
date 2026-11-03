---
name: threat-model
description: Builds a threat model with the Doors, Windows & Holes method from the AppSec Untangled wiki, for a design doc, a feature description, an architecture or a repository. Writes stories, groups doors (entry points), windows (hidden entry points) and holes (dangerous sinks), adds business-logic and source-to-sink threats with mitigations for each group, and ends with a point-in-time and continuous testing plan. Outputs Markdown and JSON, and can fill the Notion threat model template. Use when asked to threat model a system, feature, design or repo.
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
- **Notion page** (optional): the URL of a copy of the Notion threat model
  template to fill. See step 6.
- **Output directory** (optional): defaults to `./threat-model/`.

Ask the user only for what you can't derive: the goal, the users and roles,
and anything about the deployment the material doesn't show. Ask once, in one
message, then proceed with stated assumptions.

## Ground rules

1. **Useful, not complete.** Prefer ten threats people will fix over a hundred
   they won't read. Respect the budget in step 3.
2. **Developer language.** Name routes, tables, roles and buckets, not STRIDE
   categories or CWE IDs. Write each threat as **Who / What / Impact**.
3. **Evidence or assumption.** In code mode every claim cites `path:line`.
   In design mode every claim the design doesn't state is marked
   *Assumption* and listed under open questions.
4. **Model, don't exploit.** No attack payloads or exploitation steps. Tests
   say what to send and what must happen, not how to weaponise it.
5. **Confidential.** The model describes weaknesses. Write it only to the
   output directory or the Notion page the user named. Don't post it anywhere
   else.

## The wiki

Read from `${CLAUDE_PLUGIN_ROOT}/wiki/docs/`:

- `threat-modeling/index.md`: the method, the grouping rule and the threat
  format. **Read it first.**
- `threat-modeling/doors.md`, `threat-modeling/windows.md`,
  `threat-modeling/holes.md`: where to look and what to record for each.
  `windows.md` has the de-abstraction checklist per component type.
- `threat-modeling/business-rules.md`: the "what else must hold?" checks.
- `threat-modeling/testing-plan.md`: point-in-time vs continuous tests.
- `threats/business-logic/*.md` (bucket 1) and `threats/source-to-sink/*.md`
  (bucket 2): one page per threat. List the folders at run time; skip
  `index.md`. Read **When is it relevant** to rule a page in or out, then
  **Mitigation** and **Test** for each threat you keep.

Don't read `wiki/examples/` in design mode. In code mode, follow the
`secure-code-review` skill's rule: for a threat you are checking, read only
the one example file that matches the project's stack, when you reach it.

## Step 1: Scope and stories (what are we working on?)

1. Write the scope in short bullets: the problem and goal; users and roles
   (anonymous, signed-in, owner, admin, staff, other tenants, third parties);
   new or changed routes and pages; scheduled or event-driven workflows;
   infrastructure and third-party services, **including SaaS integrations**;
   data handled and credentials used.
   - Code mode: derive from the README, router, OpenAPI spec, IaC and UI.
2. Write the **stories**: each way the system is meant to be used. For each,
   a Mermaid `sequenceDiagram` with `autonumber`, from the actor through
   every component to the data store, with a `Note` for the log line a step
   writes where it matters. Name them `S1`, `S2`… so later steps can cite
   "S3 · step 4". Keep to the stories the scope needs; five to eight is typical
   for a system, one to three for a feature.

## Step 2: Doors, windows and holes (what are we working on?)

Walk each story step by step.

1. **Doors**: every step where an actor hands the system input
   (`doors.md`). Record who is meant to use it, the input, the action and how
   sensitive it is, and the authentication.
2. **Windows**, in two tiers:
   - **Story windows** (model these fully): every box that appears in a
     story, de-abstracted with the checklist in `windows.md`: what is it
     really, who else can reach it, write to it or read from it, and what
     credentials live in it or near it. This includes compute (exec, roles,
     image push), queues, buckets, the identity provider, exported files and
     every SaaS or OAuth integration a story touches.
   - **Platform windows** (keep short): things no story step touches but that
     reach everything, such as DNS and the registrar, the code repository and
     CI/CD, infrastructure state, account-wide IAM, logs and SaaS
     dashboards. For a whole system, put them in **one group** with one threat
     per kind that matters. For a feature, include one only if the feature
     changes it. Never let them outnumber the story windows.
3. **Holes**: every step that stores, renders, runs, fetches or writes
   something input can reach, using the sink catalogue in `holes.md`. Record
   the sink type and which inputs reach it. Tokens the system issues and
   later checks (QR codes, unsubscribe links, reset tokens) are threats at
   the door that receives them, not holes; make the parser a hole only when
   parsing itself is the risk (a JWT library, a deserializer).
4. **Group** them with the rule in `index.md` (same enforcement point, same
   rule, and for holes the same sink through the same function). Each group
   gets a name in business terms, its **Members** (every route, query, bucket
   or component in it), a one-line **Grouped because**, and the story steps it
   appears in. Split any outlier into its own row and say why: it is usually
   where the bug is.

In code mode, confirm groups from the code: the same middleware on the router,
the same repository or query helper, the same IAM policy. A member that
doesn't use the shared control is an outlier.

## Step 3: Threats and mitigations (what can go wrong, and what are we going to do about it?)

For each group:

- **Doors and windows (bucket 1)**: ask AuthN, AuthZ (object, function,
  property, tenant) and "what else must hold?" using the business-logic pages
  and `business-rules.md`. For windows the caller is often a cloud principal,
  a pipeline or a third party.
- **Holes (bucket 2)**: name the attack from the source-to-sink pages (or
  `holes.md` when no page exists), **trace it back to a door**, including
  through queues and stored data, and pick the mitigation kind: no user input
  reaches it, a safe function, or validation or sanitization, in that order of
  preference.

At every door that is not public by design, **start with the AuthN threat**,
then the AuthZ threats, then the business rules, even when the design already
names the control: the threat is what makes the control testable. After
that, write a threat only where the answer could be "yes, someone can". Every threat
has: **Who**, **What**, **Impact**, **Mitigation** (adapted from the wiki
page's checklist to this system), **Mitigation kind**, the **library threat**
(wiki page) it comes from, **Status**, **Severity**, and **Evidence**
(`path:line` in code mode, the design reference or *Assumption* in design
mode). For each group, list the pages ruled out in one line each
("CSRF: bearer token in a header, no cookies").

**Budget**: about 10 to 25 threats for a feature and 30 to 50 for a whole
system, with doors and holes taking most of them. If you are over, you have
not grouped enough: merge groups that share the control, merge threats on one
group that share one mitigation, or fold platform windows into one group.
Never drop a high-severity threat to meet the budget.

**Status in design mode**: ❓ Needs verification when the design is silent on
the control; ❌ Missing only when the design draws the step and leaves the
control out or contradicts it (a queue any role can send to, a check the
diagram skips); ✅ only when the design states the control explicitly and you
add a test for it.

**Severity**, from who can do it and what they get:

- **Critical**: anyone, or any signed-in user, gets code execution, cloud
  credentials, the whole database, or money.
- **High**: any signed-in user gets another user's data, tickets or actions;
  or a cloud principal or pipeline gets broad access.
- **Medium**: needs a privileged role or an unusual condition, or the impact
  is limited to one record or to abuse (spam, holding stock).
- **Low**: nuisance, or an impact the user mostly inflicts on themselves.

In code mode, set the status from the code the way `secure-code-review` does:
✅ Mitigated, ⚠️ Partially mitigated, ❌ Missing, ❓ Needs verification. Look
for the control in middleware, the handler, the data layer and the platform
before marking it missing.

## Step 4: Testing plan (did we do a good job?)

For each mitigated or planned mitigation, add a test that would fail if the
mitigation were missing, from the threat page's **Test** section and
`testing-plan.md`. Each test has the threats it covers, **When**
(point-in-time, continuous, or both), the **type**, **How** (what it does and
what must happen to pass), and **Where it runs**. One test may cover several
threats in the same group. Risk-accepted threats need no test.

## Step 5: Write the outputs

1. `<output>/threat-model.md`, following
   `${CLAUDE_PLUGIN_ROOT}/skills/threat-model/templates/threat-model.md`. The
   template is a shortened dummy example: keep its structure, replace the
   content, and write every group and threat, not an excerpt. It has a
   summary, scope, stories, doors, windows and holes (grouped, with members),
   threats **grouped by door, window or hole**, testing plan, open questions
   and assumptions. Use the `Mitigation kind` values from the schema as
   written. Link each threat to the wiki page or heading it came from; for a
   sink with no page, link the `holes.md` sink catalogue.
2. `<output>/threat-model.json`, matching
   `${CLAUDE_PLUGIN_ROOT}/skills/threat-model/references/threat-model.schema.json`.
   It is what feature mode reads next time and what step 6 pushes to Notion.
   Check it parses (`node -e "JSON.parse(require('fs').readFileSync(process.argv[1]))" <file>`).
3. Long models get truncated if written in one go: write the Markdown in parts.

## Step 6 (optional): Fill the Notion template

When the user gives a Notion page, or asks for Notion, follow
`${CLAUDE_PLUGIN_ROOT}/skills/threat-model/references/notion.md`. It needs the
Notion connector. Write to the page the user named, never to another one, and
in feature mode add rows instead of duplicating existing ones.

## Reply

Reply with: the counts (stories, doors, windows, holes, groups, threats,
tests), the threats that are ❌ Missing or ⚠️ Partial with their severity, the
open questions, and the output paths or Notion link.
