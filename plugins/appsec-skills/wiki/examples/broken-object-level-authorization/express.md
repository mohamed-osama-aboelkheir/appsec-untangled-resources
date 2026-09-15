**Mitigation options**

| Option | When it fits | Docs |
|---|---|---|
| Scope the query (`WHERE owner_id = ?`) | Default choice; the check can't be forgotten later | [node-postgres](https://node-postgres.com/features/queries), [Mongoose queries](https://mongoosejs.com/docs/api/query.html) |
| Load then check in the handler | You need the record anyway, or the rule is more than ownership | [Express routing](https://expressjs.com/en/guide/routing.html) |
| Check in the data-access layer | Many handlers share one repository function | [CASL](https://casl.js.org/v6/en/) |

**Vulnerable — authenticated, but not authorised**

```js
router.delete('/documents/:id', requireAuth, async (req, res) => {
  await db.query('DELETE FROM documents WHERE id = $1', [req.params.id])
  res.sendStatus(204)
})
```

**Vulnerable — child object checked through its parent only**

```js
router.get('/projects/:projectId/tasks/:taskId', requireAuth, async (req, res) => {
  const project = await Project.findOne({ _id: req.params.projectId, ownerId: req.user.id })
  if (!project) return res.sendStatus(404)
  res.json(await Task.findById(req.params.taskId))   // taskId never tied to project
})
```

**Mitigated — scope the query**

```js
router.delete('/documents/:id', requireAuth, async (req, res) => {
  const { rowCount } = await db.query(
    'DELETE FROM documents WHERE id = $1 AND owner_id = $2',
    [req.params.id, req.user.id],
  )
  if (rowCount === 0) return res.sendStatus(404)
  res.sendStatus(204)
})
```

The same `404` covers "doesn't exist" and "not yours", so the response doesn't
confirm that someone else's ID is real.

Docs: [node-postgres parameterised queries](https://node-postgres.com/features/queries)

**Mitigated — load then check**

```js
const doc = await Document.findById(req.params.id)
if (!doc) return res.sendStatus(404)
if (String(doc.ownerId) !== String(req.user.id)) return res.sendStatus(404)
await doc.deleteOne()
```

Docs: [Mongoose queries](https://mongoosejs.com/docs/api/query.html)

**Mitigated — data-access layer**

```js
// repositories/documents.js — handlers cannot reach the model directly
export function forUser(user) {
  return {
    find: (id) => Document.findOne({ _id: id, ownerId: user.id }),
    remove: (id) => Document.deleteOne({ _id: id, ownerId: user.id }),
  }
}
```

**Bypasses to check**

- **Check one ID, act on another.** Ownership verified for `req.params.id`
  while the write uses `req.body.id`, or a bulk route (`ids: []`) that checks
  only the first element.
- Nested and related IDs: child resources, `populate()`/`JOIN` targets,
  attachments, and "duplicate"/"export"/"share" routes reached from an object
  you do own.
- Ownership compared with `==` across types (`ObjectId` vs string), or
  `doc.ownerId === req.user.id` where one side is an object — always false or
  always true rather than a real comparison.
- The owner column taken from the request (`req.body.ownerId`) instead of the
  session.
- Read path scoped but the write path not, or vice versa.
- **Check then change:** the record is re-fetched without the scope after the
  check, or the ID is re-parsed (`parseInt`, `trim`) between check and use.
- `findByIdAndUpdate(req.params.id, ...)` with the ownership filter omitted
  because "the UI only shows your own documents".

**What to grep for**

- `findById(`, `findByIdAndUpdate(`, `findByIdAndDelete(`, `deleteOne(`
- `req.params.id`, `req.body.id`, `req.query.id`
- `WHERE id =`, `{ _id:` without an owner or tenant field alongside
