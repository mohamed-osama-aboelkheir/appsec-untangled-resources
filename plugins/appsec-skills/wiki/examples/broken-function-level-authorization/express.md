**Mitigation options**

| Option | When it fits | Docs |
|---|---|---|
| Router-level middleware | A whole area is one privilege level (`/admin/*`) | [Express routing](https://expressjs.com/en/guide/routing.html) |
| Per-route middleware | Mixed privileges inside one router; explicit per endpoint | [Express routing](https://expressjs.com/en/guide/routing.html) |
| Policy/ability layer | Rules are data, reused by API and UI | [CASL](https://casl.js.org/v6/en/) |

**Vulnerable — the check the UI does, the API doesn't**

```js
router.get('/admin/users', requireAuth, async (req, res) => {
  res.json(await User.find())          // any logged-in user reaches this
})
```

**Vulnerable — one sibling forgotten**

```js
router.get('/courses/:id',    requireAuth, requireTeacher, getCourse)
router.put('/courses/:id',    requireAuth, requireTeacher, updateCourse)
router.delete('/courses/:id', requireAuth,                 deleteCourse)  // gap
```

**Mitigated — router-level middleware**

```js
const admin = express.Router()
admin.use(requireAuth, requireRole('admin'))   // applies to every route below

admin.get('/users', async (req, res) => res.json(await User.find()))
admin.delete('/users/:id', async (req, res) => { /* ... */ })

app.use('/admin', admin)
```

Mounting the middleware on the router means a new route added later is covered
by default, which is why a forgotten sibling is less likely than with per-route
checks.

**Mitigated — per-route middleware**

```js
function requireRole(...allowed) {
  return (req, res, next) => {
    const role = req.user?.role                 // from the session, not the body
    if (!allowed.includes(role)) return res.sendStatus(403)
    next()
  }
}

router.delete('/courses/:id', requireAuth, requireRole('teacher', 'admin'), deleteCourse)
```

**Mitigated — policy layer**

```js
const ability = defineAbilityFor(req.user)
if (ability.cannot('delete', course)) return res.sendStatus(403)
```

Docs: [CASL](https://casl.js.org/v6/en/)

**Bypasses to check**

- **Check then change the value.** The guard and the use read the role
  differently:

  ```js
  if (req.body.role === 'admin') return res.sendStatus(403)   // reject admins
  await User.create({ ...req.body, role: req.body.role.toLowerCase() })
  ```

  `"Admin"`, `" admin"` and `"ADMİN"` (dotted capital I, which lowercases to
  `i̇`) all pass the guard, and trimming or `normalize('NFKC')` afterwards can
  turn the stored value back into `admin`. Normalise **once, before** the check,
  then use that same normalised value.
- Role read from the request (`req.body.role`, `X-Role`) or from an unverified
  JWT claim instead of from the server-side session.
- Middleware registered after the route it is meant to protect, or
  `app.use(requireAuth)` placed below `app.use('/api', routes)`.
- Method not covered: a guard on `router.get` while `router.post`, `patch` or
  `delete` on the same path is unguarded; `router.all` vs one verb.
- Path shape differences that skip a mount: trailing slash, `%2e%2e`, double
  slashes, or case (`/Admin/users`) when the guard is mounted on `/admin`.
- Internal or "service" routes that skip auth because they are assumed to be
  unreachable from the internet.
- The check returns but doesn't stop: `if (!ok) res.sendStatus(403)` without
  `return`, so the handler keeps running.

**What to grep for**

- `requireAuth`, `requireRole`, `isAdmin`, `req.user.role`, `req.session.role`
- `router.use(`, `app.use(`, `router.all(`
- `next()` called unconditionally inside a guard
