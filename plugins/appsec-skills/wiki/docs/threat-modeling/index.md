# Threat modeling: Doors, Windows & Holes

A step-by-step method for **useful, not complete** threat models, written in
developer language. It answers Adam Shostack's four questions for a system or a
feature, and ends with a testing plan instead of a document nobody reads.

| Question | Step | What you write |
|---|---|---|
| What are we working on? | [1 · Scope and stories](#step-1-scope-and-stories) | How the system is meant to be used, as numbered sequence diagrams |
| | [2 · Doors, windows and holes](#step-2-doors-windows-and-holes) | Where input gets in, and where it can do damage |
| What can go wrong, and what are we going to do about it? | [3 · Threats and mitigations](#step-3-threats-and-mitigations) | Each threat at those places, and what must be true to stop it |
| Did we do a good job? | [4 · Testing plan](#step-4-testing-plan) | A test for each mitigation, run once or all the time |

## The three things to find

- 🚪 **Door**: an obvious entry point where we *expect* user input. API routes,
  UI forms, sign-in and OAuth callbacks, webhooks, file uploads, links and QR
  codes the system hands out. See [Doors](doors.md).
- 🪟 **Window**: a hidden entry point, found by **de-abstracting** each box in
  the diagram. Queues, buckets, cloud roles, CI/CD, admin tools, SSH or exec
  into containers, SaaS and OAuth integrations, exported files. See
  [Windows](windows.md).
- 🕳️ **Hole**: a dangerous sink where input can change behaviour. SQL, HTML,
  OS commands, file paths, templates, PDF and CSV generation, deserialization,
  outbound URLs. See [Holes](holes.md).

## Two buckets of threats

- 🔓 **Bucket 1, business logic**, at every door and window:
    - **AuthN**: is the caller who they claim to be?
    - **AuthZ**: are they allowed to do this to *this* resource?
    - **What else must hold?** CSRF, prices, quantities, races, replay, limits.
      See [What else must hold](business-rules.md).
- 💉 **Bucket 2, source to sink**, at every hole: name the attack, trace it back
  to a door, and pick one of three mitigations: **no user input reaches it**,
  a **safe function**, or **validation or sanitization**.

The wiki's [business-logic](../threats/business-logic/index.md) and
[source-to-sink](../threats/source-to-sink/index.md) pages are the two buckets.
Each page's **When is it relevant** decides whether it applies, **Mitigation**
is what must be true, and **Test** feeds the testing plan.

## Step 1: Scope and stories

Answer these first. In a design they come from the design doc; in code, from
the README, the router, the infrastructure code and the UI.

- What problem does it solve, and for whom? Who are the users and roles
  (anonymous, signed-in, owner, admin, staff, other tenants, third parties)?
- What is in scope: new and changed routes, pages, scheduled or event-driven
  workflows, infrastructure, third-party services?
- What data does it handle (PII, payments, secrets, private content), and
  which credentials does it introduce or use?
- Which components does it run on, and which services does it call?

Then write the **stories**: each way the system is meant to be used, as a
sequence diagram with numbered steps, from the actor through every component to
the data store. Name each story (`S1`, `S2`…) so later steps can point at
"S3 · step 4". Add the log line each step writes: it answers "would we know if
this happened?".

## Step 2: Doors, windows and holes

Walk each story step by step and mark where input gets in (doors), what each box
really is and who else can reach it (windows), and where input can do damage
(holes). Record, for each one, the stories and steps it appears in.

### Group them

A model with one row per route and one row per query is complete and unread.
**Group doors, windows and holes that would get the same threats with the same
mitigations, and model the group once.** Typical groups:

- Routes for the same resource behind the same middleware and the same rule,
  such as "owner-only event routes: `PATCH /events/:id`, `POST /events/:id/publish`,
  `DELETE /events/:id`".
- Queries in the same store class or repository that use the same query helper.
- Every bucket written by the same deploy role, or every queue consumed by the
  same kind of worker.
- Every page that renders organizer-written text through the same component.

Group only when **all** of these hold:

1. The same enforcement point: one middleware, policy, helper, IAM policy or
   sanitizer covers every member.
2. The same rule: the same callers are allowed, on the same kind of resource.
3. For holes, the same sink type reached through the same function.

Split a member out when it breaks one of them: a public `GET` beside owner-only
writes, one raw query among parameterized ones, one route mounted outside the
middleware. The outlier gets its own row, because the outlier is usually the bug.
List every member in the group so nothing is lost, and say in one line why they
are grouped.

As a budget, a feature should come to about 10 to 25 threats and a whole system
to about 40 to 60: enough to read and discuss in one meeting.

## Step 3: Threats and mitigations

For each door, window and hole (or group), ask the bucket's questions and write
a threat only where the answer could be "yes, someone can". Write threats that
don't apply as one line ("no cookie auth, so no CSRF") instead of a full entry.

Every threat has:

- **Who**: the attacker and what they need first (anonymous, any signed-in
  user, another tenant, an AWS principal with `sqs:SendMessage`).
- **What**: the attack, in one sentence.
- **Impact**: what happens if it works, in business terms.
- **Mitigation**: what must be true, taken from the wiki page and adapted to the
  system. For bucket 2, name the kind: no user input, safe function, or
  validation or sanitization.
- **Status**: ✅ Mitigated · ⚠️ Partially mitigated · ❌ Missing ·
  ❓ Needs verification · Risk accepted. In a design, most start as ❓.
- **Severity**, and **evidence** (`path:line`) when there is code.

## Step 4: Testing plan

Every mitigation gets a test that would fail if the mitigation were missing.
A test is **point-in-time** (run once before release: a manual check, a code or
config review, a DAST run), **continuous** (runs on every change or on a
schedule: unit and integration tests, SAST rules, policy checks, alerts), or
both. See [Testing plan](testing-plan.md).

The model is done when every threat is either mitigated with a passing test, or
explicitly accepted.

## Using it

- By hand: the Notion template follows the same four steps, with a database
  for stories, one for doors, windows and holes, one for threats and one for
  the testing plan.
- With Claude Code: the `threat-model` skill runs the same steps over a design
  doc, a feature description or a repository, and can fill the Notion template.
