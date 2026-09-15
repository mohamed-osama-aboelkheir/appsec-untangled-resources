**Mitigation options**

| Option | When it fits | Docs |
|---|---|---|
| `express-session` + a server-side store | Cookie-based web apps; lets you revoke a session server-side | [express-session](https://expressjs.com/en/resources/middleware/session.html) |
| JWT (`jsonwebtoken`) | Stateless APIs and service-to-service calls; revocation needs extra work | [node-jsonwebtoken](https://github.com/auth0/node-jsonwebtoken) |
| Passport strategies | Delegated login (OIDC, SAML, social) on top of either of the above | [Passport sessions](https://www.passportjs.org/concepts/authentication/sessions/) |

**Vulnerable — session that survives login**

```js
app.use(session({
  secret: 'dev-secret',            // hardcoded, shared across environments
  resave: false,
  saveUninitialized: true,         // issues a cookie to anonymous visitors
  cookie: { maxAge: 86400000 },    // no httpOnly, no secure, no sameSite
}))

app.post('/login', async (req, res) => {
  const user = await User.findOne({ email: req.body.email })
  if (!user || user.password !== hash(req.body.password)) {
    return res.status(401).json({ error: 'Invalid credentials' })
  }
  req.session.userId = user._id    // same session ID as before login
  res.json({ ok: true })
})
```

The session ID is never rotated, so an ID an attacker planted in the victim's
browser before login becomes an authenticated session (session fixation).

**Vulnerable — JWT that is read but not verified**

```js
const payload = jwt.decode(req.headers.authorization.slice(7))
req.user = payload                 // no signature check at all
```

**Mitigated — express-session**

```js
app.set('trust proxy', 1)
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.MONGO_URL }),
  cookie: { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 3600000 },
}))

app.post('/login', async (req, res) => {
  const user = await User.findOne({ email: req.body.email })
  const ok = user && await bcrypt.compare(req.body.password, user.passwordHash)
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' })

  req.session.regenerate((err) => {          // new session ID after login
    if (err) return res.status(500).end()
    req.session.userId = user.id
    req.session.save(() => res.json({ ok: true }))
  })
})

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.clearCookie('connect.sid').json({ ok: true }))
})
```

`bcrypt.compare` is constant-time, and the same `401` is returned whether the
email exists or not, so the response can't be used to enumerate accounts.

Docs: [express-session](https://expressjs.com/en/resources/middleware/session.html) · [`session.regenerate`](https://github.com/expressjs/session#sessionregenerate) · [connect-mongo](https://github.com/jdesboeufs/connect-mongo) · [bcrypt](https://github.com/kelektiv/node.bcrypt.js)

**Mitigated — JWT**

```js
function requireAuth(req, res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ')
  if (scheme !== 'Bearer' || !token) return res.sendStatus(401)
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256'],       // pin it: never trust the header's alg
      issuer: 'api.example.com',
      audience: 'example-web',
      maxAge: '1h',
    })
    next()
  } catch {
    return res.sendStatus(401)
  }
}
```

Docs: [jsonwebtoken](https://github.com/auth0/node-jsonwebtoken)

**Bypasses to check**

- `jwt.decode()` used anywhere in the auth path — it parses without verifying.
- `jwt.verify()` without `algorithms` — an attacker may switch `alg` to `none`
  or to `HS256` signed with a public RSA key the server trusts.
- No `req.session.regenerate()` on login (fixation), or logout that only clears
  `req.session.userId` without `destroy()`, leaving the old ID valid.
- Identity taken from a client-supplied field (`req.body.userId`,
  `X-User-Id`) rather than from the verified session or token.
- Password compared with `===` against a hash, or with a non-constant-time
  helper; different responses or timings for "no such user" vs "wrong password".
- `saveUninitialized: true` plus a login that writes into the pre-existing
  session object.
- Rate limiting applied only to `/login` while `/register`, password reset or
  token refresh reach the same credential check.

**What to grep for**

- `jwt.decode(`, `jwt.verify(`, `algorithms`, `ignoreExpiration`
- `session(`, `saveUninitialized`, `regenerate(`, `destroy(`, `cookie:`
- `bcrypt.compare`, `createHash(`, `=== user.password`
