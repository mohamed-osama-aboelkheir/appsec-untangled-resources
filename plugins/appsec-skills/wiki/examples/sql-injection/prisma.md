**Mitigation options**

| Option | When it fits | Docs |
|---|---|---|
| Prisma Client query API | Almost everything | [Prisma CRUD](https://www.prisma.io/docs/orm/prisma-client/queries/crud) |
| `$queryRaw` tagged template | SQL the client API can't express | [Prisma raw queries](https://www.prisma.io/docs/orm/prisma-client/queries/raw-database-access) |
| `Prisma.sql` + `Prisma.join` | Raw SQL assembled from parts | [Prisma raw queries](https://www.prisma.io/docs/orm/prisma-client/queries/raw-database-access) |

**Vulnerable — the unsafe raw variant**

```js
const users = await prisma.$queryRawUnsafe(
  `SELECT * FROM users WHERE id = ${req.params.id}`,
)
```

`$queryRawUnsafe` and `$executeRawUnsafe` take a plain string: nothing is bound.

**Vulnerable — a fragment built by hand, then passed to a tagged template**

```js
const filter = `category = '${req.query.category}'`
const rows = await prisma.$queryRaw`SELECT * FROM products WHERE ${Prisma.raw(filter)}`
```

The tagged template is safe, but `Prisma.raw` puts the string back in verbatim.

**Mitigated — the client API**

```js
const products = await prisma.product.findMany({
  where: { category: req.query.category, ownerId: req.user.id },
  orderBy: { createdAt: 'desc' },
  take: 50,
})
```

Docs: [Prisma CRUD](https://www.prisma.io/docs/orm/prisma-client/queries/crud)

**Mitigated — `$queryRaw` tagged template**

```js
const rows = await prisma.$queryRaw`
  SELECT * FROM products WHERE category = ${req.query.category}
`
```

Written as a tagged template, each `${}` becomes a bound parameter. The same
text passed to `$queryRawUnsafe` would not be.

**Mitigated — assembled raw SQL**

```js
const ids = z.array(z.string().uuid()).max(100).parse(req.body.ids)

const rows = await prisma.$queryRaw(
  Prisma.sql`SELECT * FROM products WHERE id IN (${Prisma.join(ids)})`,
)
```

`Prisma.join` binds each element, so an `IN` list needs no string building.

Docs: [Prisma raw queries](https://www.prisma.io/docs/orm/prisma-client/queries/raw-database-access)

**Mitigated — allowlist a dynamic sort**

```js
const SORTABLE = new Set(['name', 'price', 'createdAt'])
const field = SORTABLE.has(req.query.sort) ? req.query.sort : 'name'

const products = await prisma.product.findMany({
  orderBy: { [field]: req.query.dir === 'desc' ? 'desc' : 'asc' },
})
```

**Bypasses to check**

- `$queryRawUnsafe` / `$executeRawUnsafe` anywhere — treat every call as a
  finding until the argument is proven constant.
- `Prisma.raw()` inside an otherwise safe `$queryRaw`, which is the documented
  escape hatch and the usual near-miss.
- `$queryRaw` called as a **function** with a built string rather than as a
  tagged template: `prisma.$queryRaw(`...${x}...`)` binds nothing.
- A `where` object spread from `req.query` or `req.body`, letting the caller
  filter on columns you did not intend, or inject relation filters.
- `orderBy` keys taken from input without an allowlist.
- **Check then change:** the value is validated, then the raw request value is
  interpolated into the SQL.
- Prisma protects against SQL injection, not against missing authorisation —
  a safe query with no `ownerId`/`tenantId` filter is still a finding.

**What to grep for**

- `$queryRawUnsafe`, `$executeRawUnsafe`, `Prisma.raw(`
- `$queryRaw(` with a parenthesis rather than a backtick
- `where: { ...req.`, `orderBy: {` with a variable key
