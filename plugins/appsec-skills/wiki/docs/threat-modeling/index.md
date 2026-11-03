# Threat modeling: Doors, Windows & Holes

A step-by-step method for **useful, not complete** threat models, written in
developer language. It answers Adam Shostack's four questions for a system or a
feature, and ends with a testing plan instead of a document nobody reads.

| Question | Step | What you write |
|---|---|---|
| What are we working on? | [1 · Stories and scope](#step-1-stories-and-scope) | How the system is meant to be used, as numbered sequence diagrams, and the scope they add up to |
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

## Step 1: Stories and scope

Start with **what**: the problem it solves, and for whom, in a sentence or
two. Then **how**: the **stories**, each way the system is meant to be used,
as a sequence diagram with numbered steps, from the actor through every component to
the data store. In a design they come from the design doc; in code, from the
README, the router, the infrastructure code and the UI. Name each story (`S1`,
`S2`…) so later steps can point at "S3 · step 4". Add the log line each step
writes: it answers "would we know if this happened?".

Then write the **general scope**: what isn't a door, window or hole but decides
how bad a threat is.

- Who are the users and roles (anonymous, signed-in, owner, admin, staff,
  support, third parties), and does it serve several organizations?
- What data does it handle (PII, payments, secrets, private content), and
  what other assets matter (money, capacity, the brand's emails)?

Everything else the stories touch (routes, pages, webhooks, buckets, queues,
compute, identity, secrets, third parties, data stores, renderers, outbound
calls, AI, new libraries) is scope too, and step 2 sorts it into doors, windows
and holes.

## Step 2: Doors, windows and holes

Walk each story step by step and mark where input gets in (doors), what each box
really is and who else can reach it (windows), and where input can do damage
(holes). Record, for each one, the stories and steps it appears in.

Ask the questions in this order, so each answer adds the door, window or hole
and its threats together:

- 🚪 **Doors**: new or changed backend routes, public API routes, sign-in and
  recovery, webhooks, links and codes we hand out. For each: does it need
  AuthN, which roles may call it, does it take a resource ID, which fields can
  the caller set or see, cookies, prices, workflow steps, limited things?
- 🪟 **Windows**: buckets, queues and schedulers, compute, the identity
  provider, credentials, third parties, caches, logs, exported files, CI/CD.
  For each: who else can reach it, write to it or read from it?
- 🕳️ **Holes**: data stores, what pages render, templates, PDFs, CSV and email,
  file paths and commands, outbound requests, AI prompts, new libraries. For
  each: does user input reach it, and through which function?

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
to about 30 to 40: enough to read and discuss in one meeting.

## Step 3: Threats and mitigations

For each door, window and hole (or group), ask the bucket's questions and write
a threat only where the answer could be "yes, someone can". Write threats that
don't apply as one line ("no cookie auth, so no CSRF") instead of a full entry.

Every threat has:

- **Who**: the attacker and what they need first (anonymous, any signed-in
  user, another tenant, an AWS principal with `sqs:SendMessage`).
- **What**: the attack, in one sentence.
- **Impact**: what happens if it works, in business terms.
- **Mitigations**: what must be true, taken from the wiki page and adapted to
  the system. One mitigation often stops several threats, so mitigations are
  written once and linked. For bucket 2, name the kind: no user input, safe
  function, or validation or sanitization. Add **evidence** (`path:line`)
  when there is code.
- **Status**: ✅ Mitigated · ⚠️ Partially mitigated · ❌ Missing ·
  ❓ Needs verification · Risk accepted. In a design, most start as ❓.
- **Severity**.

## Step 4: Testing plan

Every mitigation gets a test that would fail if the mitigation were missing.
A test is **point-in-time** (run once before release: a manual check, a code or
config review, a dynamic test) or **continuous** (runs on every change or on a
schedule: unit and integration tests, SAST rules, policy checks, alerts). One
test per mitigation is the default; add one of the other type for critical
threats and for controls in code that changes often. See [Testing plan](testing-plan.md).

The model is done when every threat is either mitigated with a passing test, or
explicitly accepted.

## Using it

- By hand: the Notion template follows the same four steps. Steps 1 and 2 are
  page text with a question under each scope section that adds the matching
  door, window or hole and its threats; then databases for doors, windows and
  holes, threats, mitigations and the testing plan.
- With Claude Code: the `threat-model` skill runs the same steps over a design
  doc, a feature description or a repository, and can fill the Notion template.
