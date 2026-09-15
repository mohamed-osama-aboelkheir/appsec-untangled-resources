**Mitigation options**

| Option | When it fits | Docs |
|---|---|---|
| Parameterised query (`$1`, `$2`) | Every value that comes from a request | [node-postgres queries](https://node-postgres.com/features/queries) |
| Allowlist for identifiers | Column names, table names, sort direction | — |

Parameters bind **values**. Table names, column names and sort direction can
never be parameterised, so those need an allowlist.

**Vulnerable — value interpolated**

```js
const { rows } = await db.query(
  `SELECT * FROM products WHERE category = '${req.query.category}'`,
)
```

**Vulnerable — parameterised value, interpolated identifier**

```js
const { rows } = await db.query(
  `SELECT * FROM products WHERE category = $1 ORDER BY ${req.query.sort}`,
  [req.query.category],
)
```

This is the common near-miss: it looks safe because it uses `$1`.

**Mitigated — parameterised query**

```js
const { rows } = await db.query(
  'SELECT * FROM products WHERE category = $1',
  [req.query.category],
)
```

Docs: [node-postgres parameterised queries](https://node-postgres.com/features/queries)

**Mitigated — allowlist the identifier**

```js
const SORTABLE = { name: 'name', price: 'price', newest: 'created_at' }
const DIRECTION = { asc: 'ASC', desc: 'DESC' }

const column = SORTABLE[req.query.sort] ?? 'name'
const direction = DIRECTION[String(req.query.dir).toLowerCase()] ?? 'ASC'

const { rows } = await db.query(
  `SELECT * FROM products WHERE category = $1 ORDER BY ${column} ${direction}`,
  [req.query.category],
)
```

The interpolated text comes from the map's values, never from the request, so
user input selects a key rather than supplying SQL.

**Mitigated — an `IN` list without string building**

```js
const ids = z.array(z.string().uuid()).max(100).parse(req.body.ids)
const { rows } = await db.query(
  'SELECT * FROM products WHERE id = ANY($1::uuid[])',   // one parameter, whole array
  [ids],
)
```

**Bypasses to check**

- An `IN (...)` list built by joining values, or `LIMIT`/`OFFSET` pasted in
  rather than bound.
- `LIKE` patterns built from input: `%` and `_` change the result set, and a
  leading `%` can be a denial of service on a large table.
- **Second order:** input stored safely, then read back and concatenated into a
  later query — a report, a migration, a background job.
- Hand-rolled escaping (`replace(/'/g, "''")`) instead of binding.
- **Check then change:** the value is validated, then a different variable (the
  raw body, or a re-parsed copy) reaches the query.
- Placeholder numbering and the values array drifting apart when the query is
  assembled conditionally.
- `client.query` calls inside helpers, migrations and seed scripts, which often
  skip the conventions the route handlers follow.

**What to grep for**

- `` db.query(` ``, `client.query(`, `pool.query(`
- `${` inside a SQL string, `+ req.`, `.join(',')` near a query
- `ORDER BY`, `LIMIT`, `OFFSET`, `TABLE` next to a variable
