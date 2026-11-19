**Mitigation options**

| Option | When it fits | Docs |
|---|---|---|
| Tenant ID from the session, added to every query | Shared collections or tables with a `tenant_id` field | [Flask `g`](https://flask.palletsprojects.com/en/stable/appcontext/#storing-data) |
| A store layer whose methods all require the tenant | Many routes; makes an unscoped query hard to write | [Flask application structure](https://flask.palletsprojects.com/en/stable/patterns/packages/) |
| SQLAlchemy `with_loader_criteria` / PostgreSQL row-level security | SQL databases; the filter applies to every query | [`with_loader_criteria`](https://docs.sqlalchemy.org/en/20/orm/queryguide/api.html#sqlalchemy.orm.with_loader_criteria), [PostgreSQL RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) |

**Vulnerable — tenant taken from the request**

```python
@app.get('/api/invoices')
@require_token
def invoices():
    org = request.args['org_id']                   # any org the caller names
    return jsonify([serialize(i) for i in db.invoices.find({'org_id': org})])
```

**Vulnerable — the tenant is checked, then a bulk query drops it**

```python
org = require_member(g.user, org_slug)
ids = request.args.getlist('id')
return jsonify([serialize(i) for i in db.invoices.find({'_id': {'$in': [ObjectId(x) for x in ids]}})])
```

**Mitigated — every store method takes the tenant**

```python
class InvoiceStore:
    def __init__(self, db): self.col = db.invoices

    def list(self, org_id, ids=None):
        criteria = {'org_id': org_id}
        if ids:
            criteria['_id'] = {'$in': [o for o in map(to_object_id, ids) if o]}
        return [serialize(d) for d in self.col.find(criteria)]

@app.get('/api/orgs/<slug>/invoices')
@require_token
def invoices(slug):
    org = require_member(g.user, slug)             # 404 unless the caller belongs to it
    return jsonify(invoice_store.list(org['id'], request.args.getlist('id')))
```

Docs: [PyMongo `find`](https://pymongo.readthedocs.io/en/stable/api/pymongo/collection.html#pymongo.collection.Collection.find)

**Bypasses to check**

- Aggregation pipelines, `count_documents`, `distinct` and exports that build their own filter.
- Background jobs and webhooks that run outside a request and so have no `g.user`. They must carry the tenant explicitly.
- Cache keys without the tenant, such as `cache.get(f'invoice:{id}')`.
- Files stored under paths that don't include the tenant.

**What to grep for**

- `org_id`, `tenant_id`, `account_id`, `request.args.get('org`, `getlist(`
- `find(`, `aggregate(`, `count_documents(`, `distinct(`, `$in`
