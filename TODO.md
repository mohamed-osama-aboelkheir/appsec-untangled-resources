# TODO: wiki coverage

Plan for growing the wiki's stack coverage. Work through it in batches, one
ecosystem per batch, so a project in that language is fully covered instead of
partly covered. Tick items off as they land.

## How coverage works

Example files are named after **whatever decides the fix for that threat** (see
`CONTRIBUTING.md`), so combinations never need their own files. An Express +
Prisma + React app reads `express.md` for authorization, `prisma.md` for SQL
injection, `react.md` for XSS and `node.md` for SSRF. Coverage is the union of
one short list per deciding layer:

| Threat page | Decided by |
|---|---|
| broken-authentication, the four authorization threats, csrf, open-redirect, file-upload | backend framework |
| sql-injection, nosql-injection | database library |
| xss | view layer (server templates and front-end frameworks) |
| ssti | template engine |
| client-side-path-traversal | front-end framework |
| path-traversal, ssrf, command-injection, insecure-deserialization, xxe | language runtime |
| prototype-pollution (JS only) | runtime (`node.md`) and front end (`vanilla-js.md`) |

Runtime files cover the runtime's common libraries as **Mitigation options**
instead of splitting files: HTTP clients for SSRF (axios, got, fetch /
requests, httpx / RestTemplate, WebClient / HttpClient / Guzzle / Net::HTTP,
Faraday / net/http), process APIs for command injection, serializers for
deserialization, XML parsers for XXE. Split one out (for example
`node-axios.md`) only if the file gets crowded.

GraphQL servers (`apollo.md`, `graphene.md`, `hot-chocolate.md`) count as
backend frameworks for the authorization threats, because resolver-level
checks look nothing like route middleware.

## Definition of done for each example file

- Follows the format in `CONTRIBUTING.md`: Mitigation options, Vulnerable,
  Mitigated, Bypasses to check, What to grep for, and a `Docs:` line under
  every example that names a library.
- Has a tab on its threat page, with the language in the label, for example
  `=== "NestJS (JS)"`.
- `zensical build --clean` passes.

## Batch 0: groundwork

Do these before the language batches. Without them, the skill's context grows
with every stack added.

- [ ] Loader script `plugins/appsec-skills/skills/secure-code-review/scripts/wiki.mjs`:
  - [ ] `profile <repo> <sha>`: read the dependency files at the pinned
        commit (package.json and lockfile, requirements.txt / pyproject.toml,
        Gemfile.lock, go.mod, *.csproj, pom.xml / build.gradle) and print the
        candidate technology profile.
  - [ ] `relevance`: print only the "When is it relevant" section of every
        threat page (replaces reading each full page in step 4).
  - [ ] `threat <name> --stack a,b`: print one threat page with only the
        matching examples inlined, the What to grep for lists for the
        profile, and "no example for X" when nothing matches.
- [ ] `plugins/appsec-skills/wiki/examples/stacks.json`: package name → file
      name, listing only the exceptions (`pg`, `node`, `vanilla-js`,
      `django-orm`, …). The default is a file of the same name.
- [ ] Update `secure-code-review/SKILL.md` to use the loader, check
      source-to-sink pages only for sink types found in step 3, and drop the
      library-specific names from the sink table (they belong in each
      example's What to grep for).
- [ ] CI check: every `examples/*/<stack>.md` resolves through `stacks.json`
      or the default name.
- [ ] New threat pages (When is it relevant / Attack / Mitigation /
      Examples / Resources), plus their sink rows in SKILL.md step 3:
  - [ ] `threats/source-to-sink/command-injection.md`
  - [ ] `threats/source-to-sink/insecure-deserialization.md`
  - [ ] `threats/source-to-sink/xxe.md`
  - [ ] `threats/source-to-sink/prototype-pollution.md`
  - [ ] `threats/business-logic/file-upload.md`
  - [ ] Add them to `threats/index.md` and the category `index.md` files.
- [ ] Fix the stale reference in `CONTRIBUTING.md` to
      `examples/sql-injection/express.md`, which doesn't exist (use `pg.md`).

## Tier 1 batches

Paths are relative to `plugins/appsec-skills/wiki/examples/`.

### Batch 1: JavaScript / TypeScript

Sets the depth for every later batch.

#### Backend framework: Express (JS)

- [x] `broken-authentication/express.md`
- [x] `broken-object-level-authorization/express.md`
- [x] `broken-function-level-authorization/express.md`
- [x] `broken-property-level-authorization/express.md`
- [x] `broken-tenant-isolation/express.md`
- [x] `csrf/express.md`
- [x] `open-redirect/express.md`
- [ ] `file-upload/express.md`

#### Backend framework: NestJS (JS)

- [ ] `broken-authentication/nestjs.md`
- [ ] `broken-object-level-authorization/nestjs.md`
- [ ] `broken-function-level-authorization/nestjs.md`
- [ ] `broken-property-level-authorization/nestjs.md`
- [ ] `broken-tenant-isolation/nestjs.md`
- [ ] `csrf/nestjs.md`
- [ ] `open-redirect/nestjs.md`
- [ ] `file-upload/nestjs.md`

#### Backend framework: Next.js (JS) (route handlers and server actions)

- [ ] `broken-authentication/nextjs.md`
- [ ] `broken-object-level-authorization/nextjs.md`
- [ ] `broken-function-level-authorization/nextjs.md`
- [ ] `broken-property-level-authorization/nextjs.md`
- [ ] `broken-tenant-isolation/nextjs.md`
- [ ] `csrf/nextjs.md`
- [ ] `open-redirect/nextjs.md`
- [ ] `file-upload/nextjs.md`

#### Database library

- [x] `sql-injection/pg.md`
- [x] `sql-injection/knex.md`
- [x] `sql-injection/prisma.md`
- [ ] `sql-injection/mysql2.md`
- [ ] `sql-injection/sequelize.md`
- [ ] `sql-injection/typeorm.md`
- [x] `nosql-injection/mongoose.md`
- [ ] `nosql-injection/mongodb.md`

#### View layer (XSS)

- [x] `xss/ejs.md`
- [ ] `xss/handlebars.md`
- [ ] `xss/react.md`
- [ ] `xss/vue.md`
- [ ] `xss/angular.md`
- [ ] `xss/vanilla-js.md`

#### Template engine (SSTI)

- [x] `ssti/ejs.md`
- [ ] `ssti/handlebars.md`
- [ ] `ssti/pug.md`
- [ ] `ssti/nunjucks.md`

#### Front-end framework (client-side path traversal)

- [x] `client-side-path-traversal/vanilla-js.md`
- [ ] `client-side-path-traversal/react.md`
- [ ] `client-side-path-traversal/vue.md`
- [ ] `client-side-path-traversal/angular.md`

#### Runtime: Node.js

- [x] `path-traversal/node.md`
- [x] `ssrf/node.md`
- [ ] `command-injection/node.md`
- [ ] `insecure-deserialization/node.md`
- [ ] `xxe/node.md`
- [ ] `prototype-pollution/node.md`
- [ ] `prototype-pollution/vanilla-js.md`

### Batch 2: .NET

#### Backend framework: ASP.NET Core (.NET) (MVC and minimal APIs)

- [ ] `broken-authentication/aspnet.md`
- [ ] `broken-object-level-authorization/aspnet.md`
- [ ] `broken-function-level-authorization/aspnet.md`
- [ ] `broken-property-level-authorization/aspnet.md`
- [ ] `broken-tenant-isolation/aspnet.md`
- [ ] `csrf/aspnet.md`
- [ ] `open-redirect/aspnet.md`
- [ ] `file-upload/aspnet.md`

#### Database library

- [ ] `sql-injection/ef-core.md`
- [ ] `sql-injection/dapper.md`

#### View layer (XSS)

- [ ] `xss/razor.md`

#### Runtime: .NET

- [ ] `path-traversal/dotnet.md`
- [ ] `ssrf/dotnet.md`
- [ ] `command-injection/dotnet.md`
- [ ] `insecure-deserialization/dotnet.md`
- [ ] `xxe/dotnet.md`

### Batch 3: Java

#### Backend framework: Spring Boot + Spring Security (Java)

- [ ] `broken-authentication/spring.md`
- [ ] `broken-object-level-authorization/spring.md`
- [ ] `broken-function-level-authorization/spring.md`
- [ ] `broken-property-level-authorization/spring.md`
- [ ] `broken-tenant-isolation/spring.md`
- [ ] `csrf/spring.md`
- [ ] `open-redirect/spring.md`
- [ ] `file-upload/spring.md`

#### Database library

- [ ] `sql-injection/jdbc.md`
- [ ] `sql-injection/hibernate.md`

#### View layer (XSS)

- [ ] `xss/thymeleaf.md`

#### Template engine (SSTI)

- [ ] `ssti/thymeleaf.md`
- [ ] `ssti/freemarker.md`

#### Runtime: Java

- [ ] `path-traversal/java.md`
- [ ] `ssrf/java.md`
- [ ] `command-injection/java.md`
- [ ] `insecure-deserialization/java.md`
- [ ] `xxe/java.md`

### Batch 4: Python

#### Backend framework: Django (Py) (including DRF permissions)

- [ ] `broken-authentication/django.md`
- [ ] `broken-object-level-authorization/django.md` (stub: expand to the full format)
- [ ] `broken-function-level-authorization/django.md`
- [ ] `broken-property-level-authorization/django.md`
- [ ] `broken-tenant-isolation/django.md`
- [ ] `csrf/django.md`
- [ ] `open-redirect/django.md`
- [ ] `file-upload/django.md`

#### Backend framework: FastAPI (Py)

- [ ] `broken-authentication/fastapi.md`
- [ ] `broken-object-level-authorization/fastapi.md`
- [ ] `broken-function-level-authorization/fastapi.md`
- [ ] `broken-property-level-authorization/fastapi.md`
- [ ] `broken-tenant-isolation/fastapi.md`
- [ ] `csrf/fastapi.md`
- [ ] `open-redirect/fastapi.md`
- [ ] `file-upload/fastapi.md`

#### Backend framework: Flask (Py)

- [ ] `broken-authentication/flask.md`
- [ ] `broken-object-level-authorization/flask.md`
- [ ] `broken-function-level-authorization/flask.md`
- [ ] `broken-property-level-authorization/flask.md`
- [ ] `broken-tenant-isolation/flask.md`
- [ ] `csrf/flask.md`
- [ ] `open-redirect/flask.md`
- [ ] `file-upload/flask.md`

#### Database library

- [ ] `sql-injection/sqlalchemy.md`
- [ ] `sql-injection/django-orm.md`
- [ ] `nosql-injection/pymongo.md`

#### View layer (XSS)

- [ ] `xss/jinja2.md`
- [ ] `xss/django-templates.md`

#### Template engine (SSTI)

- [ ] `ssti/jinja2.md`

#### Runtime: Python

- [ ] `path-traversal/python.md`
- [ ] `ssrf/python.md`
- [ ] `command-injection/python.md`
- [ ] `insecure-deserialization/python.md`
- [ ] `xxe/python.md`

### Batch 5: PHP

#### Backend framework: Laravel (PHP)

- [ ] `broken-authentication/laravel.md`
- [ ] `broken-object-level-authorization/laravel.md`
- [ ] `broken-function-level-authorization/laravel.md`
- [ ] `broken-property-level-authorization/laravel.md`
- [ ] `broken-tenant-isolation/laravel.md`
- [ ] `csrf/laravel.md`
- [ ] `open-redirect/laravel.md`
- [ ] `file-upload/laravel.md`

#### Database library

- [ ] `sql-injection/pdo.md`
- [ ] `sql-injection/eloquent.md`

#### View layer (XSS)

- [ ] `xss/blade.md`

#### Template engine (SSTI)

- [ ] `ssti/blade.md`
- [ ] `ssti/twig.md`

#### Runtime: PHP

- [ ] `path-traversal/php.md`
- [ ] `ssrf/php.md`
- [ ] `command-injection/php.md`
- [ ] `insecure-deserialization/php.md`
- [ ] `xxe/php.md`

### Batch 6: Ruby

#### Backend framework: Rails (Ruby)

- [ ] `broken-authentication/rails.md`
- [ ] `broken-object-level-authorization/rails.md` (stub: expand to the full format)
- [ ] `broken-function-level-authorization/rails.md`
- [ ] `broken-property-level-authorization/rails.md`
- [ ] `broken-tenant-isolation/rails.md`
- [ ] `csrf/rails.md`
- [ ] `open-redirect/rails.md`
- [ ] `file-upload/rails.md`

#### Database library

- [ ] `sql-injection/activerecord.md`

#### View layer (XSS)

- [ ] `xss/erb.md`

#### Template engine (SSTI)

- [ ] `ssti/erb.md`

#### Runtime: Ruby

- [ ] `path-traversal/ruby.md`
- [ ] `ssrf/ruby.md`
- [ ] `command-injection/ruby.md`
- [ ] `insecure-deserialization/ruby.md`
- [ ] `xxe/ruby.md`

### Batch 7: Go

#### Backend framework: Gin (Go)

- [ ] `broken-authentication/gin.md`
- [ ] `broken-object-level-authorization/gin.md`
- [ ] `broken-function-level-authorization/gin.md`
- [ ] `broken-property-level-authorization/gin.md`
- [ ] `broken-tenant-isolation/gin.md`
- [ ] `csrf/gin.md`
- [ ] `open-redirect/gin.md`
- [ ] `file-upload/gin.md`

#### Database library

- [ ] `sql-injection/database-sql.md`
- [ ] `sql-injection/gorm.md`

#### View layer (XSS)

- [ ] `xss/go-templates.md`

#### Template engine (SSTI)

- [ ] `ssti/go-templates.md`

#### Runtime: Go

- [ ] `path-traversal/go.md`
- [ ] `ssrf/go.md`
- [ ] `command-injection/go.md`
- [ ] `insecure-deserialization/go.md`
- [ ] `xxe/go.md`
## Batch 8: Tier 2

Add these when a real review needs them, or after Tier 1 is done.

- Backend frameworks: `fastify`, `hono`, `nuxt`, `sveltekit` (JS); `quarkus`
  (Java); `symfony` (PHP); `echo`, `go-stdlib` (net/http, chi) (Go).
- GraphQL servers, for the authorization threats only: `apollo`, `graphene`,
  `hot-chocolate`.
- SQL libraries: `drizzle` (JS), `psycopg` (Py, raw SQL), `mybatis`, `jooq`
  (Java), `ado-net` (.NET), `doctrine` (PHP), `sequel` (Ruby), `sqlx` (Go).
- NoSQL libraries: `spring-data-mongodb` (Java), `mongodb-csharp` (.NET),
  `mongo-go` (Go).
- XSS view layers: `svelte`, `jquery`, `pug`, `nunjucks`, `twig`,
  `freemarker`, and Markdown renderers `markdown-it`, `marked`.
- SSTI engines: `velocity`, `django-templates`, `razor` (only for
  RazorEngine-style runtime compilation).
- Client-side path traversal: `svelte`.
