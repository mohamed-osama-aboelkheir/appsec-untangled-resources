# Filling the Notion threat model template

The template is one page with five inline databases. Every copy of the
template has its own databases, so never reuse IDs from another copy: find them
on the page the user gave you.

## 1. Find the databases

1. Fetch the page the user named. If it is the original template rather than a
   copy, ask whether to duplicate it first (the Notion connector's
   duplicate-page tool), and work on the copy.
2. Find the five `<database>` tags by title, and fetch each one for its
   `collection://` data source ID and exact property names:

| Database | Title property | Holds |
|---|---|---|
| Stories | `Story` | Step 1 |
| Doors, windows & holes | `Name` | Step 2, one row per group |
| Threats | `Threat` | Step 3 |
| Testing plan | `Test` | Step 4 |
| Threat library (from the AppSec Untangled wiki) | `Threat` | Read-only reference rows |

3. Query the Threat library for its rows (title and page URL). Each threat you
   create links to one of them through `Library threat`. If no row fits, add
   one to the library with the same properties as the others, pointing at the
   closest wiki page.

If a database or a property below is missing, the page is not a copy of this
template. Stop and tell the user rather than guessing.

## 2. Fill the scope

Replace the empty bullets under Step 1's headings (Problem, Users and roles,
New or changed API routes and pages, Scheduled or event-driven workflows,
Infrastructure and third-party services, Data and credentials, Links) with the
scope bullets, using targeted content updates. Replace `{{Project name}}` in
the first paragraph and in the page title.

## 3. Create rows, in this order

Create in batches (one create call per database) and keep the returned page
URLs: later rows relate to earlier ones.

**Stories**

- `Story`: `S1: Organizer creates an event`
- `Actor`, `Summary`
- Page content: the Mermaid diagram in a ```` ```mermaid ```` code block, then
  the step notes.

**Doors, windows & holes** (one row per group)

- `Name`: the group name in business terms
- `Type`: exactly `🚪 Door`, `🪟 Window` or `🕳️ Hole`
- `Members`, `Grouped because`, `Component`, `Story steps` (`S3 · step 2, S4 · step 1`)
- `Stories`: the story page URLs
- `Who can reach it` (multi-select): `Anonymous`, `Any signed-in user`,
  `Resource owner`, `Role or group`, `Other tenant`, `Third party / SaaS`,
  `Cloud principal (IAM)`, `Internal service`, `Pipeline / admin`
- `Authentication`, `Input / exposure`
- Windows: `Window kind`, one of `Compute`, `Queue / event bus`,
  `Object storage`, `Database / cache`, `Identity provider`,
  `DNS / CDN / load balancer`, `Secrets and keys`, `SaaS / OAuth integration`,
  `Repo / CI/CD / IaC`, `Admin tool`, `Exported file`, `Email / SMS provider`,
  `Scheduler`, `Mobile / desktop app`, `Logs / monitoring`, `Other`
- Holes: `Sink type`, one of `SQL`, `NoSQL`, `HTML / DOM`, `Template`,
  `Outbound URL`, `Redirect`, `File path / object key`,
  `Client-side request path`, `HTML → PDF`, `CSV / spreadsheet`,
  `Email body / headers`, `OS command`, `Deserialization`, `XML`,
  `Token / QR parsing`, `Logs`, `Dependency`, `Other`
- Page content: the threats ruled out for this group, one line each.

**Threats**

- `Threat`: a short name for the attack
- `Door / window / hole`: the group's page URL (one)
- `Source door`: bucket 2 only, the door group the input comes from
- `Library threat`: the library row's page URL
- `Who`, `What`, `Impact`, `Mitigation`, `Evidence`, `Notes`
- `Mitigation kind`: `No user input reaches it`, `Safe function`,
  `Validation / sanitization`, `Access control check`, `Business rule check`,
  `Platform / cloud config`, `Process`
- `Status`: `Not discussed`, `❓ Needs verification`, `❌ Missing`,
  `⚠️ Partially mitigated`, `✅ Mitigated`, `Risk accepted`
  (design mode: usually `❓ Needs verification`)
- `Severity`: `Critical`, `High`, `Medium`, `Low`

`Bucket`, `Type`, `Gap`, `Open` and the `Wiki …` fields are formulas and
rollups: don't set them.

**Testing plan**

- `Test`: what it checks, as a short sentence
- `Threats`: the threat page URLs it covers
- `When` (multi-select): `Point-in-time`, `Continuous`
- `Test type`: `Unit test`, `Integration test`, `Concurrency / load test`,
  `Code review`, `Config review`, `DAST / manual request`, `Pen test`,
  `SAST rule`, `Policy-as-code / IaC check`, `Dependency scan`,
  `Monitoring / alert`
- `Status`: `Not started` unless you ran it in this session
- `How`, `Where it runs`, `Link`

## 4. Feature mode

Query the existing Doors, windows & holes and Threats first. Add a new member
to an existing group (update `Members`) when it meets the grouping rule, and
create rows only for what is new. Never delete or overwrite rows the team
wrote; put disagreements in `Notes`.

## 5. Check

Fetch the **⚠️ No threats yet** view of Doors, windows & holes and the
**🧪 No test** view of Threats, and report anything left in them. Give the
user the page link.
