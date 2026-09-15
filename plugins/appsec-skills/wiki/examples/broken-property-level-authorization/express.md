**Mitigation options**

| Option | When it fits | Docs |
|---|---|---|
| Allowlist the fields you accept | Default choice; the shape is explicit in the handler | [Express routing](https://expressjs.com/en/guide/routing.html) |
| Schema validation with unknown keys rejected | Bigger payloads, shared between routes | [Zod](https://zod.dev/) |
| Mongoose `strict` + explicit `select` | Mongoose already models the document | [Mongoose schemas](https://mongoosejs.com/docs/guide.html) |

**Vulnerable — write side (mass assignment)**

```js
router.patch('/me', requireAuth, async (req, res) => {
  const user = await User.findByIdAndUpdate(req.user.id, req.body, { new: true })
  res.json(user)                    // {"role":"admin"} or {"credits":9999} lands here
})
```

**Vulnerable — read side (overexposure)**

```js
router.get('/users/:id', requireAuth, async (req, res) => {
  res.json(await User.findById(req.params.id))   // passwordHash, resetToken, email
})
```

**Mitigated — allowlist**

```js
const EDITABLE = ['displayName', 'bio', 'avatarUrl']

router.patch('/me', requireAuth, async (req, res) => {
  const update = {}
  for (const key of EDITABLE) {
    if (key in req.body) update[key] = req.body[key]
  }
  const user = await User.findByIdAndUpdate(req.user.id, update, { new: true })
  res.json({ id: user.id, displayName: user.displayName, bio: user.bio })
})
```

The response is built field by field too, so a column added to the model later
is not published by accident.

Docs: [Mongoose queries](https://mongoosejs.com/docs/api/query.html)

**Mitigated — schema validation**

```js
const ProfileUpdate = z.object({
  displayName: z.string().min(1).max(80),
  bio: z.string().max(500).optional(),
}).strict()                          // unknown keys are an error, not ignored

const parsed = ProfileUpdate.safeParse(req.body)
if (!parsed.success) return res.status(400).json({ error: 'Invalid body' })
await User.findByIdAndUpdate(req.user.id, parsed.data)
```

Docs: [Zod objects and `.strict()`](https://zod.dev/)

**Mitigated — Mongoose schema**

```js
const userSchema = new mongoose.Schema({
  displayName: String,
  role: { type: String, default: 'user', immutable: true },
  passwordHash: { type: String, select: false },   // never loaded unless asked
}, { strict: 'throw' })                            // unknown paths throw
```

Docs: [Mongoose schemas](https://mongoosejs.com/docs/guide.html)

**Bypasses to check**

- **Privileged field allowed through a second path.** The profile route
  allowlists fields, but registration (`new User(req.body)`), an import job, or
  an admin route reuses the raw body.
- `{ strict: true }` silently *drops* unknown keys rather than rejecting them,
  so a review can't tell from the response whether a field was honoured; dotted
  keys (`"profile.role"`) and `$set` payloads can still reach nested paths.
- Zod without `.strict()` (or `.passthrough()`) keeps unknown keys.
- Prototype pollution through `__proto__` or `constructor.prototype` when the
  body is merged with `Object.assign`, spread, or a deep-merge helper.
- **Check then change:** the body is validated, then re-read from the original
  `req.body` instead of from the validated result.
- Read side: `select('-passwordHash')` on one query but not on `populate()`,
  aggregation, or the list endpoint; a `toJSON` transform that a `.lean()` query
  bypasses.
- Errors that echo the whole document back in a message or log.

**What to grep for**

- `req.body` passed whole: `findByIdAndUpdate(`, `updateOne(`, `new User(`,
  `Object.assign(`, `{ ...req.body }`
- `strict`, `.strict()`, `passthrough(`, `select(`, `lean(`, `toJSON`
