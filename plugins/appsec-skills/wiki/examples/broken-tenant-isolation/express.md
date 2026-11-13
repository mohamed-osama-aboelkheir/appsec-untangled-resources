**Mitigation options**

| Option | When it fits | Docs |
|---|---|---|
| Tenant in every query filter | Small codebases; explicit at each call site | [Mongoose queries](https://mongoosejs.com/docs/api/query.html) |
| Tenant-scoped repository or Mongoose plugin | Many handlers; one place to get it right | [Mongoose plugins](https://mongoosejs.com/docs/guide.html) |
| Database row-level security | Postgres, and you want the DB to enforce it | [node-postgres](https://node-postgres.com/features/queries) |

**Vulnerable — tenant taken from the request**

```js
router.get('/invoices', requireAuth, async (req, res) => {
  const tenantId = req.headers['x-tenant-id'] || req.query.tenantId
  res.json(await Invoice.find({ tenantId }))      // caller picks the tenant
})
```

**Vulnerable — object ID trusted once authenticated**

```js
router.get('/invoices/:id', requireAuth, async (req, res) => {
  res.json(await Invoice.findById(req.params.id))  // any tenant's invoice
})
```

**Vulnerable — tenant-scoped, then overridden by a filter**

```js
// filterable fields derived from the model: tenantId is a path, so it's "allowed"
const FILTERABLE = new Set(Object.keys(Recipe.schema.paths))

router.get('/kitchens/:kitchenId/recipes', requireAuth, requireMember, async (req, res) => {
  const filters = {}
  for (const [key, value] of Object.entries(req.query)) {
    if (!FILTERABLE.has(key)) return res.status(400).json({ error: `Unknown filter ${key}` })
    filters[key] = String(value)
  }
  const where = { kitchenId: req.params.kitchenId, ...filters }   // later key wins
  res.json(await Recipe.find(where))
})
```

`requireMember` checks the path's kitchen, and the query starts scoped to it,
so the obvious IDOR (`/kitchens/1/recipes`) is blocked. But
`/kitchens/2/recipes?kitchenId=1` passes the allowlist, and in an object
literal the later `kitchenId` replaces the trusted one. The guard authorizes
one tenant and the query reads another. Neither defect leaks on its own: a
model-derived allowlist always includes the tenant, ownership and audit
fields, and the spread order decides whether that matters. The same happens
with `Object.assign(where, filters)`, a TypeORM `{ kitchenId, ...columns }`,
or a list derived from `repo.metadata.columns`.

**Mitigated — filter on the server's copy of the tenant**

```js
function tenantContext(req, res, next) {
  req.tenantId = req.user.tenantId         // from the session, never the request
  if (!req.tenantId) return res.sendStatus(403)
  next()
}

router.get('/invoices/:id', requireAuth, tenantContext, async (req, res) => {
  const invoice = await Invoice.findOne({ _id: req.params.id, tenantId: req.tenantId })
  if (!invoice) return res.sendStatus(404)
  res.json(invoice)
})
```

**Mitigated — scoped repository**

```js
export function invoicesFor(tenantId) {
  const scope = { tenantId }
  return {
    list:   (q = {}) => Invoice.find({ ...q, ...scope }),     // scope wins over q
    byId:   (id)     => Invoice.findOne({ _id: id, ...scope }),
    update: (id, u)  => Invoice.updateOne({ _id: id, ...scope }, u),
  }
}
```

Spreading the scope **last** matters: `{ ...scope, ...q }` would let a caller
pass `tenantId` in `q` and override it. Allowlist the filterable fields
explicitly too (`['name', 'category', 'createdBy']`), so `tenantId` is
rejected with a `400` before it reaches the repository.

Docs: [Mongoose queries](https://mongoosejs.com/docs/api/query.html)

**Mitigated — row-level security**

```sql
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON invoices
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

```js
await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', req.tenantId])
```

Docs: [PostgreSQL row security policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) · [node-postgres](https://node-postgres.com/features/queries)

**Bypasses to check**

- Tenant read from anything the caller controls: header, query, body, subdomain
  taken from the `Host` header, or a JWT claim that isn't verified.
- A query that filters by ID only, on the assumption that IDs are unique and
  unguessable (UUIDs leak through exports, webhooks and error messages).
- Aggregations, `populate()`, `JOIN`s, counts, search indexes and report queries
  that drop the tenant filter the simple finder has.
- Bulk and admin paths: `updateMany`, `deleteMany`, CSV export, background jobs
  that iterate all rows.
- Caches keyed without the tenant, so one tenant's response is served to another.
- **Check then change:** membership verified for the tenant in the session,
  then the write uses `req.body.tenantId`.
- **Scope then override:** the tenant key is set first and caller filters are
  merged after it (`{ tenantId, ...filters }`, `Object.assign`), with the
  filter allowlist built from the model (`schema.paths`,
  `metadata.columns`, `PartialType(Entity)`). Send `?tenantId=<other>` on a
  list or search route in your own tenant.
- Cross-tenant references accepted as input: moving a record into another
  tenant's project, or inviting by an ID that belongs elsewhere.

**What to grep for**

- `tenantId`, `orgId`, `workspaceId`, `accountId`, `x-tenant`
- `find(`, `findOne(`, `aggregate(`, `updateMany(`, `deleteMany(`, `populate(`
- `req.headers[`, `req.query.`, `req.body.` next to a tenant field
- `...filters`, `...req.query`, `Object.assign(` in a query object;
  `schema.paths`, `metadata.columns` used as an allowlist
