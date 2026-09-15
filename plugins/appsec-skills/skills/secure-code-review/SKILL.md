---
name: secure-code-review
description: Threat-model-first security code review of a pull request, commit or diff. Builds the story of the change, lists entry points and dangerous sinks, picks the relevant threats from the AppSec Untangled wiki, checks each mitigation against the code, and writes Markdown and HTML reports with evidence. Use when asked for a security review of a PR, commit, branch or diff.
---

# Secure code review (threat-model-first)

Review a change the way you'd read a story. Understand what it does, find where input enters and where it can do harm, decide which threats apply, then show for each one whether the code mitigates it.

## Inputs

- **Target** (required): a GitHub PR (URL or number), a commit SHA, a range `base..head`, or the current branch against its merge base.
- **Scope** (optional): paths to focus on. Read outside them only to follow a trace.
- **Output directory** (optional): defaults to `./security-review/`.

If the target is ambiguous, ask once. Otherwise proceed without asking.

## Ground rules

1. **Evidence or nothing.** Every claim cites `path:line` at the pinned commit, with the code you rely on quoted. If you can't confirm something from the code, mark it ❓ Needs verification instead of guessing.
2. **Judge the code, not its reputation.** Base conclusions only on the code at the target commit and on the wiki.
   - Don't look up the project's vulnerabilities, advisories, CVEs, security issues, bug bounty reports, changelogs or release notes, and don't search the web.
   - Don't read commits, branches or tags newer than the target, or later versions of files.
   - If you remember anything about known vulnerabilities in this project, set it aside and say so under the report's assumptions.
   - The report must show what this method finds on its own.
3. **Never fabricate results.** Never present expected output as observed. Report a request or test as executed only if you ran it in this session.
4. **Review, don't exploit.** Don't run attacks against the code, and don't write exploitation steps, attacker payloads or attacker-hosted pages into the report. For anything not fully mitigated, write the short **Exploitability** summary in step 5 instead: who could do it, what they'd need, and whether the victim has to act.
5. **Read-only on the target.** Don't modify the reviewed code or push anything. Write only to the output directory.
6. **Findings are confidential.** Don't post them anywhere: PR comments, issues, chat. Tell the user to report real findings through the project's security policy.

## The wiki

Threat pages live in `${CLAUDE_PLUGIN_ROOT}/wiki/docs/threats/`:

- `business-logic/*.md`: missing or broken controls, checked at every entry point.
- `source-to-sink/*.md`: untrusted input reaching a dangerous sink, checked at every sink.

Each page is one markdown file named after the threat, in its category folder, with three sections: **When is it relevant**, **Attack**, and **Mitigation** (a stack-agnostic checklist). Pages get added over time, so list the folders in step 4 instead of relying on a fixed list. Skip the `index.md` files.

Mitigation examples live outside the pages, one file per technology:

```
${CLAUDE_PLUGIN_ROOT}/wiki/examples/<threat-file-name>/<stack>.md
```

Each example file carries, for that stack: **Mitigation options** (the accepted
ways to implement the control, with documentation links), a **Vulnerable** and a
**Mitigated** example per option, **Bypasses to check**, and **What to grep for**.

A threat's example files are named after **whatever decides the answer for that
threat**, which is not always the backend framework:

| Threat | Named after | For example |
|---|---|---|
| Authentication, the four authorization threats, CSRF, open redirect | backend framework | `express.md` |
| SQL injection | database library | `pg.md`, `knex.md`, `prisma.md` |
| NoSQL injection | database library | `mongoose.md` |
| XSS | view layer | `ejs.md`, `react.md` |
| SSTI | template engine | `ejs.md` |
| Client-side path traversal | front-end framework | `vanilla-js.md`, `react.md` |
| SSRF, path traversal | language runtime | `node.md` |

**For each threat, list its example folder and read only the file matching your
profile** — normally one, occasionally two when the app genuinely uses both (EJS
views plus a React island, or two ORMs). Never read files that don't match: they
cost context and don't apply.

Read them one at a time, when you reach that threat in step 5 — never in
advance, and never in bulk: no `grep -r`, glob or directory-wide read across
`${CLAUDE_PLUGIN_ROOT}/wiki/examples/`, which would pull every technology into
context at once. Listing a folder to see what exists is fine; reading the files
in it is not.

When no file matches, rely on the page's checklist, adapt it to the project's
own helpers, and say so in the report. Do not substitute another technology's
examples: the Prisma answer is wrong for raw SQL, and the EJS answer is wrong
for React.

Use the parts as follows:

- **What to grep for** seeds the searches in steps 2 and 3.
- **Mitigation options** tells you where the control legitimately lives in this
  stack: middleware, the route handler, the data-access layer, or the database.
  Look in all of them before concluding a control is missing.
- **Bypasses to check** is the checklist for step 5. Work through it for each
  relevant threat, especially the check-then-change cases where a value is
  validated and then lowercased, trimmed, normalised, decoded, re-parsed or
  rebuilt before it is used.

## Step 0: Pin and collect

1. Resolve the base and head SHAs and record them. Every link and line number uses the head SHA.
   - PR: `gh pr view <n> --json title,body,author,baseRefName,headRefOid,files,additions,deletions` and `gh pr diff <n>`.
   - Commit or range: `git show --stat <sha>` and `git diff <sha>^ <sha>` (or `base..head`).
2. List the changed files with their additions and deletions. Separate tests, docs and generated files from code. Tests show intent but aren't attack surface.
3. Make sure you can read whole files at head, either from a checkout or with `git show <sha>:<path>`. Reviewing only the diff misses controls, and gaps, that sit outside it.

## Step 1: Understand the scope and architecture

1. State the goal of the change in two or three sentences, based on the description (if any) and the code.
2. Identify the stack (framework, data stores, authentication mechanism), the roles and identities (anonymous, user, admin, service tokens, tenants), and the trust boundaries.
   - **Record a technology profile**, naming each part the way a file would be named: backend framework (`express`), database library or ORM (`prisma`, `pg`, `mongoose`), template engine (`ejs`), front-end framework (`react`, `vue`, or `vanilla-js`), language runtime (`node`), HTTP client. Note versions where they change the answer.
   - Most repositories have several, and that is expected: an Express API using Prisma, EJS views and a Vue front end is four entries. Different threats are answered by different ones, so keep the whole profile.
3. Find the relevant code outside the diff: authentication and permission middleware, how the request context is built, data-access helpers, and tenant or membership helpers.
4. Write the **stories**. For each main flow the change adds or alters, draw a Mermaid `sequenceDiagram` from the actor through the network, backend and database. Show the controls along the way: authentication, permission checks, validation. Explain each story in a short paragraph.
   - Name participants with their lane first, as in `participant R as Backend<br/>routes/tasks.js` or `participant D as Database`. The HTML renderer uses that to place them in swim lanes.
5. Collect the **controls in this flow**: for the diagram's security-relevant steps — the authentication gate, each authorization check, and the write or render at the end — note the file, the line range and the few lines that matter. These go under the diagram in the report, each labelled with its step, so a reader can follow the flow straight into the code.

## Step 2: Entry points

List every place where the change lets input in:
- new or changed routes;
- WebSocket or Socket.IO events;
- webhooks;
- queue consumers and scheduled jobs;
- CLI commands;
- existing entry points whose behavior changed.

Write a one-line summary table of all of them, then a block per entry point with:

| Field | What to write | Feeds |
|---|---|---|
| **Action performed** | What it does in the language of the business, not the code: "rewrites one task's description", "refunds an order", "invites a user to an organization" | Judging severity |
| **Inputs** | Path params, query, body fields, headers, cookies, uploaded files — with types and limits | Source-to-sink tracing |
| **Outputs** | What comes back, including fields the caller didn't ask for and internal IDs | Property-level authorization, data disclosure |
| **Data sensitivity** | What the data is worth in this app: private content, PII, credentials, payment data, or nothing much | Severity |
| **Action sensitivity** | Read or write, one record or many, reversible or not, financial, destructive, or with side effects such as email | Severity |
| **Authentication** | Which middleware enforces it, or none | Authentication threats |
| **Authorization model** | Every dimension this app uses to decide access: tenant or organization, group or team, role, permission, the caller's relation to the resource (owner, member, assignee, follower), object state (draft, published, archived), feature flags and plan limits. Say which ones apply here and which the app doesn't have | All four authorization threats |
| **Location** | `path:line` with a link | Evidence |

Then write **Who should be able to do this** as a short list of ✅ and ❌ conditions, in business terms, covering: the intended caller; other authenticated users; other tenants or groups; higher-privilege roles; anonymous callers; and another origin acting through the victim's browser. These conditions are the yardstick for the business-logic threats in step 5 — a threat is a case where the code allows something this list marks ❌, or blocks something it marks ✅.

Base the list on how the app is meant to work, not on what the code does. Read the product's own wording — README, UI copy, the PR description — and say so when you had to infer it.

Compare each entry point with its **siblings**, the other handlers for the same resource or router. A check that's present on the siblings but missing on one of them is a common finding.

## Step 3: Dangerous sinks

Search the changed code, and the code it calls, for sinks that entry-point input can reach. Front-end code counts: a URL built in the browser is a sink, and the request it sends carries the victim's session. For each, record the sink, its type, which inputs reach it, and its location.

| Type | Look for |
|---|---|
| SQL | `query(`, `raw(`, `whereRaw`, `knex.raw`, `sequelize.query`, `$queryRaw`, `sql.raw`, template literals with SQL keywords, `ORDER BY` or column names built from input |
| NoSQL | `find(`, `findOne(`, `update*(`, `aggregate(`, `$where`, filters or updates built from `req.body` or `req.query` |
| HTML / DOM | HTML strings in `res.send(`, template rendering, `innerHTML`, `dangerouslySetInnerHTML`, `v-html`, `href` or `src` set from data |
| Template | `ejs.render`, `pug.compile`, `Handlebars.compile`, `_.template`, `nunjucks.renderString` with input inside the template source |
| Outbound URL | `fetch(`, `axios`, `got`, `http.request`, webhook or callback URLs, URL previews, file-by-URL imports |
| Redirect | `res.redirect(`, `Location` headers, `window.location` |
| Client-side request path | template literals building `fetch`/`axios`/XHR URLs from ids, slugs, aliases, handles or filenames; `encodeURI` where `encodeURIComponent` is needed |
| File path | `fs.*`, `path.join` or `path.resolve` with input, `res.sendFile`, `res.download`, archive extraction |
| Other | `exec` / `spawn`, `eval` / `new Function`, deserialization, regexes built from input. Record these even if no wiki page covers them yet |

Record the sink types you searched for and didn't find, so coverage is explicit.

## Step 4: Threat model

1. List the pages in `${CLAUDE_PLUGIN_ROOT}/wiki/docs/threats/business-logic/` and `${CLAUDE_PLUGIN_ROOT}/wiki/docs/threats/source-to-sink/`, and read each page's **When is it relevant** section.
2. Test each **business-logic** page's criteria against every entry point from step 2. Test each **source-to-sink** page's criteria against every sink from step 3 and the inputs that reach it.
3. Add a threat for each match. Group entry points that share the same code path and the same control. Name the control type, such as authentication, object-level authorization, function-level authorization, tenant isolation, property-level authorization or CSRF.
4. For each page that didn't match, write a one-line reason, for example "no state-changing routes authenticated by cookies". These go in the report.
5. Fill in both threat tables from the report template, with the expected mitigation for each threat.
6. Each threat page ends with **Resources** (OWASP, PortSwigger, CWE). Cite the relevant one per finding in the report, and don't fetch them unless the user asks.

## Step 5: Mitigation analysis

For each threat in the model, read its full wiki page and the one example file for the stack you recorded in step 1, then:

1. **Trace** the path from the entry point or source to the handler or sink, across files. Follow middleware order, helper functions and data access.
2. **Check** the mitigations the wiki page lists. Compare with sibling handlers. Check every resource ID and every input, not just the first.
3. **Look for the control elsewhere before marking ❌.** It may be router-level middleware, a service-layer check or a database constraint. Mark ❓ if you can't tell.
4. **Set the status:** ✅ Mitigated · ⚠️ Partially mitigated · ❌ Not mitigated · ❓ Needs verification. For anything not fully mitigated, set a severity (Critical, High, Medium or Low) from who can trigger it and what they gain.
5. **Write it up as one card per threat**, so everything about a threat is in one place:
   - a short justification;
   - the code snippet with line numbers and a link;
   - for anything not fully mitigated, **Exploitability** and **Suggested fix** (below);
   - a details block with **Trace**, **Checked**, **How to verify** and **Evidence**. "How to verify" names the request or test that would confirm the result, marked as not executed unless you ran it.

### Exploitability

Inside the card, under a `#### 💥 Exploitability` sub-header, so it stands out when the report is scanned.

For each ❌, ⚠️ or ❓ threat, write **two or three sentences** answering: who can do it (anonymous, any logged-in user, a member of another tenant, a lower-privileged role), what they need first (an account, a specific permission, knowledge of a resource ID, a leaked token), and whether the victim has to do something (click a link, visit a page, be logged in at the time). Finish with whether it is reachable as the code stands, or only under a condition that isn't true yet.

**Do not attempt exploitation and do not write exploitation steps.** No attacker payloads, no attacker-hosted pages, no sequences of requests that carry out the attack. The reader needs to know whether to worry and who from, not how to do it. This holds even if the user points you at a running instance; if they want a proof of concept, say that it is outside this skill.

### Suggested fix

Under a `#### 🛠️ Suggested fix` sub-header in the same card. The renderer gives both sub-headers their own colour, red for exploitability and green for the fix.

The minimal fix: a diff against the reviewed code, and one line on how to verify it. Use the wiki's mitigated examples as the pattern, adapted to the project's own helpers. When several threats share a root cause, write the fix once and reference it from the others.

## Step 6: Action items

Collect every not-fully-mitigated threat into one table at the end of the report: the action, a link to its threat card, the status, severity, priority and effort. State explicitly which threats need nothing, so a reader knows the gaps were considered rather than skipped.

## Step 7: Report

1. Write `<output>/<target>-security-review.md` following `${CLAUDE_PLUGIN_ROOT}/skills/secure-code-review/templates/security-review-report.md`. The template is filled with a dummy example; keep its structure and replace the content. It includes:
   - the header table and the Summary (verdict, threat table, legend);
   - sections 1 to 6;
   - in section 1, **Controls in this flow**: after the sequence diagram, the security-relevant code behind its steps — the authentication gate, each authorization check, and the write or render at the end. Write each as:

     ```
     **Step N — short label** (`A->>A` in the diagram)

     <code fence, first line a `// path/to/file` comment, lines numbered>

     🔗 [`path/to/file#Lx-Ly`](link)
     ```

     **Diagram steps are prose, not code.** Each arrow says what happens in plain words ("Refuses the request unless the session identifies a user"), and the code it happens in is attached to that step. Never put code, SQL, paths or HTTP lines in the arrow text.

     **Attach a block wherever a reader would ask "what does that look like?"**: the request as it arrives and the response as it goes back (`http`), the page markup that starts the flow (`html`), and the handler code for each control (`js`).

     **For a database step, show the code that runs the query, not the query.** Attach the function that builds and executes it, with its file path and line range, to the backend step that calls it — a reviewer needs the call site to judge whether the values are bound and whether the filter is scoped. The database step itself stays prose. Blocks without a file — an HTTP exchange, a SQL statement — take a label comment instead of a path, such as `# HTTP request` or `-- as PostgreSQL receives it`.

     **Always tag the fence language** (`js`, `ts`, `tsx`, `http`, `sql`, `json`, `html`, `yaml`, `bash`) so the report highlights it. An untagged block renders as plain text.

     **N counts only the message lines of the diagram**, ignoring `participant` and `actor` declarations, so step 3 is the third arrow. The HTML renderer lifts these out and draws each one inside its own swim-lane step, which is why the number has to be right; it warns on stderr if a step number and its `A->>A` hint disagree, or if a control points past the end of the diagram. In the Markdown report they stay readable as a list under the diagram;
   - in section 2, a summary table plus one block per entry point, and its **Who should be able to do this** list;
   - threat cards with `<a id="tN"></a>` anchors, carrying **Exploitability** and **Suggested fix** for anything not fully mitigated, and a `<details>` block.

   After the two threat-model tables, add a **Threats considered, not applicable** table with the reasons from step 4. Long reports get truncated if written in one go, so write them in parts and join them.
2. When the repository is on GitHub, link code as `https://github.com/<owner>/<repo>/blob/<head-sha>/<path>#Lx-Ly`. Otherwise use `path:line`.
3. Check that every linked path exists at head (`git cat-file -e <sha>:<path>`), and spot-check the quoted line numbers.
4. Render the HTML:

   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/skills/secure-code-review/scripts/render-report-html.mjs <report.md> <report.html>
   ```

   The renderer needs only Node.js. The HTML is self-contained: the styles and the syntax highlighting are built into the template, so the report looks the same for everyone and works offline.
5. Reply to the user with:
   - the verdict;
   - the threat table (ID, threat, status, severity);
   - the action items;
   - the report paths;
   - anything you couldn't verify.
