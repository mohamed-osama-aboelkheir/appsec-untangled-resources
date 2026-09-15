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
pass `tenantId` in `q` and override it.

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
- Cross-tenant references accepted as input: moving a record into another
  tenant's project, or inviting by an ID that belongs elsewhere.

**What to grep for**

- `tenantId`, `orgId`, `workspaceId`, `accountId`, `x-tenant`
- `find(`, `findOne(`, `aggregate(`, `updateMany(`, `deleteMany(`, `populate(`
- `req.headers[`, `req.query.`, `req.body.` next to a tenant field
