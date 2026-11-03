# Filling the Notion threat model template

The template is one page in four steps, with five inline databases. Every
copy of the template has its own databases, so never reuse IDs from another
copy: find them on the page the user gave you. Fill it from
`threat-model.json` once the model is written.

## 1. Find the page parts

1. Fetch the page the user named. If it is the original template rather than a
   copy, ask whether to duplicate it first (the Notion connector's
   duplicate-page tool), and work on the copy.
2. Find the five `<database>` tags by title, and fetch each one for its
   `collection://` data source ID and exact property names:

| Database | Title property | Holds |
|---|---|---|
| Doors, windows & holes | `Name` | Step 2, one row per group |
| Threats | `Threat` | Step 3, one row per threat |
| Mitigations | `Mitigation` | Step 3, shared by threats |
| Testing plan | `Test` | Step 4, tests per mitigation |
| Threat library (from the AppSec Untangled wiki) | `Threat` | Read-only reference rows |

3. Query the Threat library for its rows (title and page URL). Each threat
   links to one through `Library threat`. Names differ from the wiki in a few
   places (Secret exposure → *Window: leaked or over-scoped credential*;
   unauthorized bucket access or write access, edited or injected file →
   *Window: unintended writer or reader*; PII in logs → *Log injection and
   secrets in logs*; dependency → *Vulnerable dependency on the input path*).
   If no row fits, add one with the same properties as the others.

If a database or a property below is missing, the page is not a copy of this
template. Stop and tell the user rather than guessing.

## 2. Fill the page text (Steps 1 and 2)

Use targeted content updates (search and replace), never a full rewrite: the
page holds the databases. Replace `{{Project name}}` in the first paragraph
and the page title.

**Step 1 · Stories and scope**

- *What: the problem we are trying to solve*: the `system.problem` bullet.
- *How: the stories*: replace the `S1` skeleton with one `####` heading per
  story (`S1: Organizer creates an event`), its one-line summary, and its
  diagram in a ```` ```mermaid ```` code block.
- *General scope*: fill each heading's empty bullet (Env setup, Useful links,
  Target users and roles, Data, Other assets, Diagrams, Code PRs).

**Step 2 · Doors, windows and holes**: under each section heading, replace the
empty bullet with what it covers (the routes, buckets, queries).

**Every 💡 callout** (Steps 1 and 2): keep the question, and replace the
`<quote>` block under it (the "If so, click…" text, the grey mitigation and
the 🔘 placeholders) with one quoted line answering it, from `questions`:

```
> ✅ <b>Yes.</b> Added 🚪 <b>Stripe webhook</b> with <b>Forged "payment succeeded" webhook</b> → <i>Verify Stripe-Signature over the raw body</i>.
> ⛔ <b>No CSRF.</b> Mutating, but the token is a Bearer header the browser can't attach.
> ⛔ <b>Not in scope.</b> The design doesn't cover redirects.
```

Name the door, window or hole added, then each threat → its mitigation. If
the threat already exists elsewhere, say where ("covered at the 🪟 Cognito
window").

## 3. Create rows, in this order

Create in batches (one create call per database) and keep the returned page
URLs: later rows relate to earlier ones. Wrap code identifiers in text
properties in backticks (`` `messageStore.save` ``): Notion turns bare
`name.name` into a web link, and `file://` into a link too.

**Doors, windows & holes**: create doors first, then windows, then holes,
each in story order.

- `Name`: the group name in business terms
- `Type`: exactly `🚪 Door`, `🪟 Window` or `🕳️ Hole`
- Page icon: the same emoji (🚪, 🪟 or 🕳️)
- `Members`, `Grouped because`, `Component`, `Story steps` (`S3 · step 2, S4 · step 1`)
- `Who can reach it` (multi-select): `Anonymous`, `Any signed-in user`,
  `Resource owner`, `Role or group`, `Other tenant`, `Third party / SaaS`,
  `Cloud principal (IAM)`, `Internal service`, `Pipeline / admin`
- `Authentication`, `Input / exposure`, `Ruled out` (one line each)
- Windows: `Window kind`; holes: `Sink type` (use the schema's values)

**Threats**

- `Threat`: the title (What)
- `Who`, `Impact`, `Notes`
- `Door / window / hole`: the group's page URL (always one; the main view is
  grouped by it)
- `Source door`: source-to-sink threats only, the door the input comes from
- `Library threat`: the library row's page URL
- `Status`: `Not discussed`, `❓ Needs verification`, `❌ Missing`,
  `⚠️ Partially mitigated`, `✅ Mitigated`, `Risk accepted`
- `Severity`: `Critical`, `High`, `Medium`, `Low`

`Category`, `Type`, `Gap`, `Open`, `Mitigation status`, `Untested mitigations`
and the `Wiki …` fields are formulas and rollups: don't set them.

**Mitigations**

- `Mitigation`: what must be true
- `Threats`: the threat page URLs it stops
- `Kind`: `No user input reaches it`, `Safe function`,
  `Validation / sanitization`, `Access control check`, `Business rule check`,
  `Platform / cloud config`, `Process`
- `Status`: `❓ Needs verification`, `📝 Planned`, `✅ In place`, `⚠️ Partial`,
  `❌ Missing`
- `Evidence`

**Testing plan**

- `Test`: what it checks, as a short sentence
- `Mitigations`: the mitigation page URLs it tests
- `Type`: `⏱️ Point-in-time` or `🔁 Continuous`
- `Kind`: `Code review`, `Config review`, `Dynamic test (Burp)`, `Pen test`,
  `Unit test`, `Integration test`, `Concurrency / load test`, `SAST rule`,
  `Policy-as-code / IaC check`, `Dependency scan`, `Monitoring / alert`,
  `Other`
- `Status`: `Not started` unless you ran it in this session
- `How`, `Where it runs`, `Link`

## 4. Feature mode

Query the existing Doors, windows & holes, Threats and Mitigations first. Add
a new member to an existing group (update `Members`) when it meets the
grouping rule, link a new threat to an existing mitigation when the same
control stops it, and create rows only for what is new. Answer the callouts
the change touches; leave the others. Never delete or overwrite rows the team
wrote; put disagreements in `Notes`.

## 5. Check

Query the **No threats yet** view of Doors, windows & holes, the **No
mitigation** view of Threats and the **No test** view of Mitigations, and
report anything left in them. Tell the user that **All threats** is grouped
by door, window or hole, and Notion sorts the groups by name: drag them once
into doors, then windows, then holes. Give the user the page link.
