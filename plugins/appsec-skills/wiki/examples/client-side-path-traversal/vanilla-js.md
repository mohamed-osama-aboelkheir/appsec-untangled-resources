**Mitigation options**

| Option | When it fits | Docs |
|---|---|---|
| Encode at one shared URL builder | Always; this is the class-killing fix | [MDN `encodeURIComponent`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent) |
| Validate the identifier on ingest | Aliases, slugs and handles with a narrow grammar | [Zod](https://zod.dev/) |
| Mint identifiers server-side | The client has no reason to choose the value | [Node `crypto`](https://nodejs.org/api/crypto.html) |

**Vulnerable — a user-chosen alias interpolated into the path**

```js
// public/api.js — one shared builder, every value dropped straight into the path
const req = (path, method = 'GET') =>
  fetch(path, { method, credentials: 'same-origin' }).then((r) => r.json())

export const getPost    = (ref)    => req(`/api/posts/${ref}`)
export const likePost   = (ref)    => req(`/api/me/likes/${ref}`,       'POST')
export const hidePost   = (ref)    => req(`/api/me/hidden/${ref}`,      'POST')
export const followUser = (handle) => req(`/api/me/following/${handle}`, 'POST')
```

```js
// the server stores whatever alias the author picked
router.post('/api/posts', requireAuth, async (req, res) => {
  const post = await Post.create({
    alias: req.body.alias,                  // "../likes/<id>" is accepted
    body: req.body.body,
    authorId: req.user.id,
  })
  res.status(201).json(post)
})
```

An author picks the alias `../likes/<id>`. A victim clicks "Not interested" on
that post, so the page calls `hidePost("../likes/<id>")` and fetches
`/api/me/hidden/../likes/<id>`. The browser collapses that to
`POST /api/me/likes/<id>` before sending it, and the victim silently likes the
attacker's post. The injected value is the **last** segment, so nothing trails
it and the retarget is clean.

**Vulnerable — a GET sink whose response is rendered**

```js
const profile = await req(`/api/users/${handle}`)     // handle: "../me/settings"
render(profile)                                        // renders someone else's data
```

**Mitigated — encode at the builder**

```js
const req = (path, method = 'GET') =>
  fetch(path, { method, credentials: 'same-origin' }).then((r) => r.json())

const seg = (value) => encodeURIComponent(String(value))

export const getPost    = (ref)    => req(`/api/posts/${seg(ref)}`)
export const likePost   = (ref)    => req(`/api/me/likes/${seg(ref)}`,       'POST')
export const hidePost   = (ref)    => req(`/api/me/hidden/${seg(ref)}`,      'POST')
export const followUser = (handle) => req(`/api/me/following/${seg(handle)}`, 'POST')
```

`encodeURIComponent('../likes/x')` becomes `..%2Flikes%2Fx`, which the browser
does not collapse: it arrives as one segment that matches no post. Nothing is
rejected, so there is no compatibility risk — which is why this is the fix to
insist on.

Docs: [MDN `encodeURIComponent`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent)

**Mitigated — validate the alias on ingest**

```js
const NewPost = z.object({
  alias: z.string().regex(/^[a-z0-9-]{1,64}$/),   // no dots, no slashes
  body: z.string().min(1).max(280),
  visibility: z.enum(['public', 'private']),
}).strict()

router.post('/api/posts', requireAuth, async (req, res) => {
  const parsed = NewPost.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid alias' })
  const post = await Post.create({ ...parsed.data, authorId: req.user.id })
  res.status(201).json(post)
})
```

Docs: [Zod](https://zod.dev/)

**Mitigated — mint the identifier server-side**

```js
const post = await Post.create({
  alias: `${slugify(parsed.data.title).slice(0, 48)}-${crypto.randomUUID().slice(0, 8)}`,
  body: parsed.data.body,
  authorId: req.user.id,
})
```

Docs: [`crypto.randomUUID`](https://nodejs.org/api/crypto.html)

**Bypasses to check**

- One call site that hand-builds a URL while the rest go through the encoded
  builder — a single `fetch(`/api/me/hidden/${ref}`)` is enough.
- `encodeURI` instead of `encodeURIComponent`: it does **not** encode `/`, so
  the traversal survives.
- **Check then change:** the segment is encoded and then `decodeURIComponent` is
  applied, or the URL is rebuilt from `url.pathname` after encoding.
- Values that came from your own API treated as safe (stored CSPT) — the alias,
  filename or handle in a JSON response is attacker-authored content.
- Path segments taken from the current location: `location.pathname.split('/')`,
  router params (`useParams`, `route.params`), or the hash.
- Reverse proxies and gateways that normalise `%2F` back to `/` before routing,
  which undoes the encoding after the browser did the right thing.
- Backends that accept both an internal id and a user-chosen alias on the same
  route, widening what a traversal can address.
- Assuming CSRF defences cover it: the request is same-origin and sent by your
  own page, so `SameSite`, the Origin check and the CSRF token all pass.
- Only state-changing sinks reviewed; a `GET` sink whose response is rendered
  leaks data just as effectively.

**What to grep for**

- `` fetch(` ``, `` axios.get(` ``, `` axios.post(` ``, `${` inside a `/api/...` string
- `encodeURIComponent`, `encodeURI`, `decodeURIComponent`
- `alias`, `slug`, `handle`, `ref`, `permalink`, `filename` used as a path segment
- `location.pathname`, `useParams`, `route.params`, `window.location.hash`
- Express routes that take a user-chosen value: `:alias`, `:slug`, `:handle`
