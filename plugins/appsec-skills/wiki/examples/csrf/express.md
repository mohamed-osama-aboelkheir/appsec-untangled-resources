**Mitigation options**

| Option | When it fits | Docs |
|---|---|---|
| `SameSite` on the session cookie | Always; the cheapest baseline | [express-session](https://expressjs.com/en/resources/middleware/session.html) |
| Double-submit token middleware (`csrf-csrf`) | Form apps, and anywhere you need `SameSite=None` | [csrf-csrf](https://github.com/Psifi-Solutions/csrf-csrf) |
| Synchronizer token in the session | You already have a server-side session and want no extra dependency | [express-session](https://expressjs.com/en/resources/middleware/session.html) |
| Custom header + strict CORS | JSON APIs called by your own front end | [OWASP CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html) |

`csurf` was the usual answer for years. It is **deprecated and archived** — do
not add it to new code, and flag it in review ([expressjs/csurf](https://github.com/expressjs/csurf)).

**Vulnerable — cookie session, no SameSite, state-changing POST**

```js
app.use(session({ secret: process.env.SESSION_SECRET, cookie: { httpOnly: true } }))
// cookie.sameSite is undefined -> the browser default varies by browser and version

app.post('/account/email', requireAuth, async (req, res) => {
  await User.updateOne({ _id: req.user.id }, { email: req.body.email })
  res.redirect('/account')
})
```

Any site can auto-submit a form to this endpoint and the browser attaches the
session cookie.

**Vulnerable — state change on GET**

```js
app.get('/account/delete', requireAuth, deleteAccount)   // an <img> tag triggers it
```

**Vulnerable — token issued but never bound or compared**

```js
app.use((req, res, next) => {
  res.locals.csrfToken = req.session.csrfToken ??= crypto.randomUUID()
  next()
})

app.post('/account/email', requireAuth, async (req, res) => {
  // the form renders the token, but nothing checks it on the way back in
  await User.updateOne({ _id: req.user.id }, { email: req.body.email })
  res.redirect('/account')
})
```

**Mitigated — SameSite**

```js
app.use(session({
  secret: process.env.SESSION_SECRET,
  cookie: { httpOnly: true, secure: true, sameSite: 'lax' },
}))
```

`lax` still sends the cookie on top-level GET navigations, so it only protects
you if no GET route changes state. Use `strict` when you don't need inbound
links to arrive authenticated.

**Mitigated — double-submit token middleware (`csrf-csrf` v4)**

```js
import { doubleCsrf } from 'csrf-csrf'

const { doubleCsrfProtection, generateCsrfToken, invalidCsrfTokenError } = doubleCsrf({
  getSecret: () => process.env.CSRF_SECRET,          // required
  getSessionIdentifier: (req) => req.session.id,     // required: binds token to session
  cookieOptions: { sameSite: 'lax', secure: true, path: '/' },
  // forms post the token in a field; the default reads the x-csrf-token header
  getCsrfTokenFromRequest: (req) => req.body?._csrf ?? req.get('x-csrf-token'),
})

// order matters: session and cookies must be parsed before the CSRF middleware
app.use(session({ /* ... */ }))
app.use(cookieParser())
app.use(express.urlencoded({ extended: false }))

// protect every state-changing request app-wide (GET/HEAD/OPTIONS are skipped)
app.use(doubleCsrfProtection)

app.get('/account', requireAuth, (req, res) => {
  res.render('account', { csrfToken: generateCsrfToken(req, res) })
})

app.post('/account/email', requireAuth, async (req, res) => {
  await User.updateOne({ _id: req.user.id }, { email: req.body.email })
  res.redirect('/account')
})

app.use((err, req, res, next) => {
  if (err === invalidCsrfTokenError) return res.status(403).render('error', { message: 'Invalid CSRF token' })
  next(err)
})
```

```erb
<form method="post" action="/account/email">
  <input type="hidden" name="_csrf" value="<%= csrfToken %>">
  <input type="email" name="email" required>
  <button type="submit">Save</button>
</form>
```

`getSessionIdentifier` is what makes this a real defence: the token is an HMAC
over the session ID, so a token minted for the attacker's own session is
rejected when replayed against the victim's.

Docs: [csrf-csrf](https://github.com/Psifi-Solutions/csrf-csrf) · [cookie-parser](https://github.com/expressjs/cookie-parser) · [express-session](https://expressjs.com/en/resources/middleware/session.html)

**Mitigated — synchronizer token middleware of your own**

```js
import crypto from 'node:crypto'

const IGNORED = new Set(['GET', 'HEAD', 'OPTIONS'])

export function csrfTokens(req, res, next) {
  if (!req.session) return next(new Error('csrfTokens requires a session'))
  req.session.csrfSecret ??= crypto.randomBytes(32).toString('base64url')
  res.locals.csrfToken = req.session.csrfSecret        // available to every view
  next()
}

export function requireCsrfToken(req, res, next) {
  if (IGNORED.has(req.method)) return next()

  const expected = Buffer.from(req.session?.csrfSecret ?? '', 'utf8')
  const supplied = Buffer.from(req.body?._csrf ?? req.get('x-csrf-token') ?? '', 'utf8')

  if (expected.length === 0 || expected.length !== supplied.length ||
      !crypto.timingSafeEqual(expected, supplied)) {
    return res.status(403).render('error', { message: 'Invalid CSRF token' })
  }
  next()
}

app.use(csrfTokens)
app.use(requireCsrfToken)
```

The secret lives in the session, so it is per-user and dies with the session.
`timingSafeEqual` needs equal-length buffers, which is why the length is checked
first rather than inside the comparison.

Docs: [`crypto.timingSafeEqual`](https://nodejs.org/api/crypto.html) · [express-session](https://expressjs.com/en/resources/middleware/session.html)

**Mitigated — custom header for a JSON API**

```js
app.use(cors({ origin: 'https://app.example.com', credentials: true }))

app.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()
  if (req.get('X-Requested-With') !== 'XMLHttpRequest') return res.sendStatus(403)
  next()
})
```

This works because a cross-origin request carrying a custom header needs a
preflight, which your CORS policy refuses. It fails if the endpoint also accepts
simple content types.

Docs: [cors](https://github.com/expressjs/cors)

**Bypasses to check**

- Token generated and rendered but never validated, validated only on some
  routes, or compared with `==` instead of a constant-time comparison.
- Token not bound to the session: a global or per-process value, or
  `getSessionIdentifier` returning a constant, lets an attacker use a token
  minted from their own session.
- The protection middleware mounted **after** the routes it should cover, or
  before `cookieParser`/`express.urlencoded`, so the token is never parsed.
- `ignoredMethods` widened, or a state-changing `GET` — both leave a write path
  with no token.
- Body parsed as `application/json` in the middleware but the route also accepts
  `text/plain` or `application/x-www-form-urlencoded`, which need no preflight.
- Method override: `?_method=POST` or `X-HTTP-Method-Override` turning a GET
  into a write.
- `sameSite: 'none'` without a token; or the `__Host-` cookie prefix used with
  a `domain` set or `path` other than `/`, so the cookie is silently rejected
  and the check falls back to something weaker.
- CORS that reflects `Origin` with `credentials: true`, or an allowlist matched
  with `startsWith`/`includes` so `https://app.example.com.evil.com` passes.
- Login CSRF: the login route itself has no token, letting an attacker log a
  victim into the attacker's account.
- Token rotated on every render but the old one still accepted indefinitely, or
  not rotated on privilege change (login, re-authentication).

**What to grep for**

- `sameSite`, `credentials: true`, `cors(`, `origin:`
- `csurf`, `doubleCsrf`, `doubleCsrfProtection`, `generateCsrfToken`,
  `getSessionIdentifier`, `_csrf`, `X-Requested-With`
- `timingSafeEqual`, `===` next to a token comparison
- `app.get(` on paths containing `delete`, `remove`, `update`, `approve`
