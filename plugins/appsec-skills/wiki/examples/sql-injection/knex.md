**Mitigation options**

| Option | When it fits | Docs |
|---|---|---|
| Builder methods (`where`, `whereIn`) | Almost everything, including dynamic filters | [Knex query builder](https://knexjs.org/guide/query-builder.html) |
| `knex.raw` with bindings (`?`) | SQL the builder can't express | [Knex raw](https://knexjs.org/guide/raw.html) |
| Allowlist for identifiers | `orderBy` columns, table names | [Knex query builder](https://knexjs.org/guide/query-builder.html) |

**Vulnerable — interpolation inside a raw fragment**

```js
await knex('users').whereRaw(`email = '${req.body.email}'`)
```

**Vulnerable — sort column straight from the request**

```js
await knex('products')
  .where({ category: req.query.category })      // this part is bound
  .orderByRaw(req.query.sort)                   // this part is not
```

The bound `where` makes the query look safe; `orderByRaw` takes raw SQL.

**Mitigated — builder methods**

```js
await knex('users').where({ email: req.body.email })

await knex('products')
  .where({ category: req.query.category })
  .whereIn('id', ids)                            // array bound for you
```

**Mitigated — raw with bindings**

```js
await knex.raw('select * from users where email = ?', [req.body.email])

// named bindings, and :name: for an identifier Knex will quote
await knex.raw('select * from :table: where email = :email', {
  table: 'users',
  email: req.body.email,
})
```

`?` and `:name` bind values; `:name:` is the identifier form, and Knex quotes it
rather than pasting it in.

Docs: [Knex raw bindings](https://knexjs.org/guide/raw.html)

**Mitigated — allowlist the sort column**

```js
const SORTABLE = { name: 'name', price: 'price', newest: 'created_at' }

await knex('products')
  .where({ category: req.query.category })
  .orderBy(SORTABLE[req.query.sort] ?? 'name', req.query.dir === 'desc' ? 'desc' : 'asc')
```

`orderBy` takes an identifier, not SQL, so a value from the allowlist is safe
where `orderByRaw` would not be.

**Bypasses to check**

- Any `*Raw` method with a template literal: `whereRaw`, `orderByRaw`,
  `havingRaw`, `joinRaw`, `selectRaw`, `knex.raw`.
- A bound `where` next to an unbound `orderByRaw` in the same chain — the safe
  half hides the unsafe one.
- `knex.raw` used **inside** a builder call, which reintroduces raw SQL into an
  otherwise safe chain.
- Objects passed to `where` built from `req.query` wholesale, letting the caller
  choose which columns are filtered.
- **Check then change:** the value is validated, then the raw request value is
  interpolated into the fragment.
- Migrations and seeds, which commonly use `knex.raw` with string building.
- `orderBy` given a user-supplied string that contains a direction
  (`"price desc"`), depending on version behaviour — pass column and direction
  as separate arguments.

**What to grep for**

- `whereRaw`, `orderByRaw`, `havingRaw`, `joinRaw`, `knex.raw`
- `` `${ `` inside any of the above
- `.where(req.query`, `.where(req.body`
