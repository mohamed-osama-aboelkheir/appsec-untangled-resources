**Mitigation options**

| Option | When it fits | Docs |
|---|---|---|
| Allowlist of destinations | Few known targets | [OWASP redirects](https://cheatsheetseries.owasp.org/cheatsheets/Unvalidated_Redirects_and_Forwards_Cheat_Sheet.html) |
| Accept a relative path only | "Return to where you were" after login | [Express API](https://expressjs.com/en/5x/api.html) |
| Parse and compare the host | Redirects between your own domains | [Express API](https://expressjs.com/en/5x/api.html) |

**Vulnerable — redirect to whatever arrives**

```js
router.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect(req.query.next || '/dashboard')
  res.render('login', { next: req.query.next })
})
```

**Vulnerable — "must start with a slash"**

```js
const next = req.query.next || '/'
if (!next.startsWith('/')) return res.redirect('/')
res.redirect(next)                     // //evil.com and /\evil.com still escape
```

`//evil.com` is a protocol-relative URL and `/\evil.com` is treated as one by
several browsers — both start with `/`.

**Mitigated — allowlist**

```js
const DESTINATIONS = { dashboard: '/dashboard', billing: '/billing', help: '/help' }
res.redirect(DESTINATIONS[req.query.next] ?? '/dashboard')
```

**Mitigated — relative path only**

```js
function safeNext(value) {
  if (typeof value !== 'string') return '/dashboard'
  // exactly one leading slash, no backslashes, no scheme
  if (!/^\/(?!\/)[\w\-./?=&%]*$/.test(value)) return '/dashboard'
  return value
}

res.redirect(safeNext(req.query.next))
```

**Mitigated — compare the resolved host**

```js
const ALLOWED_HOSTS = new Set(['app.example.com', 'docs.example.com'])

const target = new URL(req.query.next, 'https://app.example.com')
const ok = target.protocol === 'https:' && ALLOWED_HOSTS.has(target.host)
res.redirect(ok ? target.href : '/dashboard')
```

Resolving against your own base first means a relative path stays relative and
an absolute URL is judged on its real host.

Docs: [`res.redirect`](https://expressjs.com/en/5x/api.html) · [WHATWG `URL`](https://nodejs.org/api/url.html)

**Bypasses to check**

- `//evil.com`, `/\evil.com`, `\/\/evil.com`, `https:/\evil.com`.
- Userinfo tricks: `https://app.example.com@evil.com/` — the host is
  `evil.com`; a `startsWith('https://app.example.com')` check passes.
- Suffix matching: `endsWith('example.com')` allows `evil-example.com` and
  `example.com.evil.com`.
- **Check then change:** the value is validated, then decoded
  (`decodeURIComponent`) or concatenated with a prefix before the redirect.
- Double encoding (`%252f%252f`) and unicode look-alikes decoded downstream.
- The redirect happening somewhere other than `res.redirect`: a `Location`
  header set by hand, an HTML meta refresh, or `window.location` in a template.
- OAuth and SSO `redirect_uri`/`state`, logout `returnTo`, and any
  `?url=`/`?target=`/`?continue=` parameter.
- Open redirect used as a step in SSRF or to leak a token in the `Referer`.

**What to grep for**

- `res.redirect(`, `res.location(`, `Location`, `meta http-equiv="refresh"`
- `req.query.next`, `returnTo`, `redirect_uri`, `continue`, `callback`
- `startsWith('/')`, `endsWith(`, `includes(`
