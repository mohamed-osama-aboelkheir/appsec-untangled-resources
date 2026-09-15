# Contributing

## Layout

```
plugins/appsec-skills/
├── skills/            # one folder per skill
└── wiki/
    ├── docs/          # the website pages (docs_dir)
    │   └── threats/
    │       ├── business-logic/
    │       └── source-to-sink/
    └── examples/      # per-stack code examples, included into the pages
        └── <threat-file-name>/<stack>.md
```

Example files live outside `docs/` on purpose: every `.md` inside `docs/` would
otherwise become its own page on the site.

## Threat pages

Each threat is one markdown page in a category folder. The folder is the
category and the file name is the threat, so no ID is needed.

The pages are kept short, with these sections:

- **When is it relevant**: two or three sentences of clear criteria, based on
  entry points and sinks, for deciding whether the threat belongs in a threat
  model.
- **Attack**: what the attacker does and the usual ways the control fails.
- **Mitigation**: a checklist that holds for any stack. The skill relies on this
  when a project's stack has no examples yet, so keep it complete on its own.
- **Examples**: tabs that include the per-stack files.

See `wiki/docs/threats/business-logic/broken-object-level-authorization.md` for
the shape.

## Adding a stack example

1. Create `wiki/examples/<threat-file-name>/<stack>.md` with these parts, in
   this order (see `examples/sql-injection/express.md`):

   - **Mitigation options** — a table of the accepted ways to implement the
     control in that stack (middleware, handler, data layer, database; or the
     competing libraries), with what each fits and a documentation link. Note
     unmaintained libraries where relevant.
   - **Vulnerable** — one or more, labelled. Include the near-miss that looks
     safe, not just the obvious case.
   - **Mitigated** — one per option, with a sentence on why it holds.
   - **Bypasses to check** — including check-then-change cases, where a value
     passes validation and is then lowercased, trimmed, normalised, decoded or
     rebuilt before use.
   - **What to grep for** — the identifiers a reviewer searches for.

   Link to the library's own documentation wherever a link exists. **Every
   library named in an example carries a `Docs:` line directly under that
   example** (for example `express-mongo-sanitize`, `csrf-csrf`, DOMPurify),
   so a reader never has to scroll back to the options table to find it. Threat-level
   references (OWASP, PortSwigger, CWE) belong on the threat page under
   **Resources**, not in the per-stack file, since they are the same for
   every stack.
2. Add a tab to the threat page:

   ```markdown
   === "Django"

       --8<-- "examples/<threat-file-name>/django.md"
   ```

   The include marker must be indented by four spaces so it stays inside the tab.

Name the file after **whatever decides the answer for that threat**, which is
not always the backend framework. The fix for SQL injection depends on the
database library, not on Express; the fix for XSS depends on the view layer.
Naming it this way means React's XSS example is written once and serves every
backend, instead of being copied into each framework's file.

| Threat family | Named after | File names |
|---|---|---|
| Authentication, the four authorization threats, CSRF, open redirect | backend framework | `express.md`, `nextjs.md`, `nestjs.md`, `aspnet.md`, `spring.md`, `fastapi.md`, `django.md`, `flask.md`, `laravel.md`, `rails.md`, `gin.md` |
| SQL injection | database library | `pg.md`, `knex.md`, `prisma.md`, `sqlalchemy.md`, `django-orm.md`, `hibernate.md`, `ef-core.md`, `eloquent.md`, `activerecord.md` |
| NoSQL injection | database library | `mongoose.md`, `mongodb.md` |
| XSS | view layer | `ejs.md`, `react.md`, `vue.md`, `angular.md`, `blade.md`, `thymeleaf.md`, `razor.md`, `erb.md`, `jinja2.md` |
| SSTI | template engine | `ejs.md`, `handlebars.md`, `pug.md`, `jinja2.md`, `thymeleaf.md`, `blade.md` |
| Client-side path traversal | front-end framework | `vanilla-js.md`, `react.md`, `vue.md`, `angular.md` |
| SSRF, path traversal | language runtime | `node.md`, `python.md`, `java.md`, `dotnet.md`, `php.md`, `ruby.md`, `go.md` |

Naming rules: lowercase and hyphenated, the library's common name, and an
ecosystem prefix only when two ecosystems would collide (`django-orm.md`).

**The tab label on the page carries the language in parentheses**, so a reader
scanning a threat page can find their stack at a glance: `Knex (JS)`,
`SQLAlchemy (Py)`, `Hibernate (Java)`, `EF Core (.NET)`, `Eloquent (PHP)`,
`ActiveRecord (Ruby)`, `GORM (Go)`. Use `JS` for the JavaScript and TypeScript
ecosystem, `Py`, `Java`, `.NET`, `PHP`, `Ruby` and `Go` for the rest.

Target ecosystems, in rough order of priority: JavaScript and TypeScript
(Express, Next.js, NestJS), .NET, JVM, Python (FastAPI, Django, Flask), PHP
(Laravel), Ruby (Rails), Go (Gin).

The JavaScript and TypeScript set is written first and sets the depth for the
rest; later files follow its shape rather than inventing their own.

## Checks

```
claude plugin validate --strict .
claude plugin validate --strict plugins/appsec-skills
zensical build --clean
```

`zensical build` fails on a missing include, so a typo in an example path is
caught before it ships.
