# Application security, untangled

A working reference for developers doing security code review: **14 threats**,
each one page, each answering the same three questions — when does this apply to
my code, how is it attacked, and what does the fix look like in my stack.

It is written to be used during a review, not read once. Every page ends in code
you can compare against your own.

## Where to start

- **[The methodology](methodology.md)** — how to run a review end to end, from
  one pull request to a list of action items. Start here if you have never done
  a security review.
- **[The threats](threats/index.md)** — the catalogue. Go straight here when you
  are mid-review and need one answer.
- **[Using the skill](using-the-skill.md)** — run the same method as a Claude
  Code skill, which reads these pages and checks a diff against them.

## What it covers

| | Category | Checked at | Pages |
|---|---|---|---|
| 🔓 | [**Business logic**](threats/business-logic/index.md) | every entry point | Broken authentication · the four broken-authorization threats (object, function, property, tenant) · CSRF |
| 💉 | [**Source to sink**](threats/source-to-sink/index.md) | every dangerous sink | SQL and NoSQL injection · XSS · SSTI · SSRF · path traversal · client-side path traversal · open redirect |

Two categories because they are found differently. Business-logic flaws are
missing controls, so you look for them at every way into the application.
Source-to-sink flaws are untrusted input reaching somewhere dangerous, so you
look for them at every sink. A review that only greps for injection misses half
the map — and the business-logic half is where the interesting bugs live.

## What a threat page gives you

- **When is it relevant** — clear criteria, so you can rule a threat in or out
  rather than worrying about all of them at once.
- **Attack** — what the attacker actually does, and the usual ways the control
  fails.
- **Mitigation** — a checklist that holds in any language.
- **Examples** — per technology, in tabs: the mitigation options open to you,
  vulnerable and fixed code for each, the **bypasses worth checking**, and the
  identifiers to grep for.
- **Resources** — the OWASP cheat sheet, PortSwigger and CWE entries for that
  threat.

The bypasses are the part you won't find in a cheat sheet: the near-misses that
look fixed. A query that binds its values but interpolates `ORDER BY`. A path
check defeated by `//evil.com`. A role rejected, then lowercased back into
`admin`.

## Examples are named after what decides the answer

Not after the backend framework. The fix for SQL injection depends on your
database library; the fix for XSS depends on your view layer:

| Threat | Examples named after | Today |
|---|---|---|
| Authentication, authorization, CSRF, open redirect | backend framework | `Express (JS)` |
| SQL injection | database library | `node-postgres (JS)` · `Knex (JS)` · `Prisma (JS)` |
| NoSQL injection | database library | `Mongoose (JS)` |
| XSS, SSTI | view layer | `EJS (JS)` |
| Client-side path traversal | front end | `Fetch API (JS)` |
| SSRF, path traversal | language runtime | `Node.js (JS)` |

**Coverage today is the JavaScript and TypeScript stack**, with Django and Rails
started on the IDOR page. Next.js, ASP.NET Core, Spring Boot, FastAPI, Django,
Laravel, Rails, NestJS, Flask and Gin are the target, in that order. Where your
stack has no example yet, the checklist on each page still applies —
[contributions welcome](https://github.com/mohamed-osama-aboelkheir/appsec-untangled-resources).

From the [AppSec Untangled](https://medium.com/appsec-untangled) blog.
