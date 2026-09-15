**Mitigation options**

| Option | When it fits | Docs |
|---|---|---|
| Cast and validate types before querying | Always; stops operator objects at the edge | [Zod](https://zod.dev/) |
| Compare with `$eq` explicitly | Raw driver queries | [Mongoose queries](https://mongoosejs.com/docs/api/query.html) |
| Strip `$`-prefixed keys | Defence in depth across many routes | [express-mongo-sanitize](https://github.com/fiznool/express-mongo-sanitize) |

**Vulnerable — operator object where a string was expected**

```js
router.post('/login', async (req, res) => {
  const user = await User.findOne({
    email: req.body.email,
    password: req.body.password,     // {"$ne": null} matches the first user
  })
  if (!user) return res.sendStatus(401)
  req.session.userId = user._id
  res.json({ ok: true })
})
```

`{"email": {"$gt": ""}, "password": {"$ne": null}}` logs in as whoever comes
first.

**Vulnerable — query string builds an object**

```js
// GET /items?id[$ne]=000000000000000000000000
const item = await Item.findOne({ _id: req.query.id, ownerId: req.user.id })
```

Express's query parser turns `id[$ne]=...` into a nested object before your code
sees it.

**Vulnerable — server-side JavaScript**

```js
await Item.find({ $where: `this.name === '${req.query.name}'` })
```

**Mitigated — validate and cast**

```js
const Credentials = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
}).strict()

const parsed = Credentials.safeParse(req.body)
if (!parsed.success) return res.sendStatus(400)

const user = await User.findOne({ email: parsed.data.email })
const ok = user && await bcrypt.compare(parsed.data.password, user.passwordHash)
if (!ok) return res.sendStatus(401)
```

The password is never part of the query: it is compared as a string after the
user is loaded, so an operator object has nothing to act on.

Docs: [Zod](https://zod.dev/) · [bcrypt](https://github.com/kelektiv/node.bcrypt.js)

**Mitigated — force equality**

```js
const item = await Item.findOne({
  _id: { $eq: String(req.query.id) },
  ownerId: { $eq: req.user.id },
})
```

Docs: [Mongoose queries](https://mongoosejs.com/docs/api/query.html)

**Mitigated — strip operators globally**

```js
app.use(mongoSanitize({ replaceWith: '_' }))   // removes keys starting with $ or .
```

Docs: [express-mongo-sanitize](https://github.com/fiznool/express-mongo-sanitize)

**Bypasses to check**

- A sanitizer mounted **after** the routes, or after a body parser that already
  handed the object to a handler.
- On **Express 5**, `req.query` is a getter and cannot be reassigned, so
  middleware that rewrites it may silently do nothing — check it actually runs
  ([Express 5 API](https://expressjs.com/en/5x/api.html)).
- `String(x)` on an object yields `"[object Object]"`, which looks safe but
  turns a match into a miss; arrays (`id=1&id=2`) stringify to `"1,2"`.
- `$regex` built from input: catastrophic backtracking, or `.*` matching every
  record; an anchored `^` alone doesn't fix it.
- Operators inside `$lookup`, `$match`, `aggregate` pipelines, `updateOne`
  update documents (`{"$set": {"role": "admin"}}`), and `$expr`.
- **Check then change:** the value is validated as a string, then the raw body
  value is used in the query.
- Mongoose casting hides the problem on typed paths but not on `Mixed`,
  `Object`, or `.lean()` raw driver calls.

**What to grep for**

- `findOne(`, `find(`, `updateOne(`, `aggregate(`, `$where`, `$regex`, `$expr`
- `req.body` or `req.query` placed directly into a filter object
- `mongoSanitize`, `sanitizeFilter`, `strictQuery`
