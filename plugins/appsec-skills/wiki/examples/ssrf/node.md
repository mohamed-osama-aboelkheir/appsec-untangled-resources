**Mitigation options**

| Option | When it fits | Docs |
|---|---|---|
| Allowlist of hosts | You call a known set of third parties | [OWASP SSRF](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html) |
| Resolve the host, reject private ranges, pin the IP | Users supply arbitrary URLs (webhooks, imports) | [Node `dns`](https://nodejs.org/api/dns.html) |
| Egress proxy or separate network | Infrastructure can enforce it for every caller | [OWASP SSRF](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html) |

**Vulnerable — fetch whatever the user asks for**

```js
router.post('/import', requireAuth, async (req, res) => {
  const { data } = await axios.get(req.body.url)     // http://169.254.169.254/... 
  res.json({ imported: data.length })
})
```

**Vulnerable — host checked, then followed anywhere**

```js
const url = new URL(req.body.url)
if (!url.hostname.endsWith('example.com')) return res.sendStatus(400)
const { data } = await axios.get(url.href)           // redirects are followed by default
```

`evil.example.com` passes `endsWith`, and a `302` to `http://127.0.0.1:6379`
is followed after the check.

**Mitigated — allowlist**

```js
const ALLOWED = new Set(['api.partner.com', 'cdn.partner.com'])

const url = new URL(req.body.url)
if (url.protocol !== 'https:' || !ALLOWED.has(url.hostname)) {
  return res.status(400).json({ error: 'URL not allowed' })
}
const { data } = await axios.get(url.href, { maxRedirects: 0, timeout: 5000 })
```

Compare the host with `===`/`Set.has`, never `endsWith` or `includes`.

Docs: [axios request config](https://axios-http.com/docs/intro)

**Mitigated — resolve, filter, and pin**

```js
import { lookup } from 'node:dns/promises'
import ipaddr from 'ipaddr.js'

async function safeAddress(hostname) {
  const { address } = await lookup(hostname)            // resolve once
  const parsed = ipaddr.parse(address)
  if (parsed.range() !== 'unicast') throw new Error('private address')
  return address
}

const url = new URL(req.body.url)
if (!['http:', 'https:'].includes(url.protocol)) return res.sendStatus(400)

const address = await safeAddress(url.hostname)
const { data } = await axios.get(url.href, {
  maxRedirects: 0,
  timeout: 5000,
  lookup: (_h, _o, cb) => cb(null, address, 4),   // connect to the IP we checked
})
```

Passing the resolved address back into the request closes the DNS-rebinding gap
where the name resolves to a public IP during the check and to `127.0.0.1` for
the actual connection.

Docs: [Node `dns.lookup`](https://nodejs.org/api/dns.html) · [ipaddr.js](https://github.com/whitequark/ipaddr.js) · [axios request config](https://axios-http.com/docs/intro)

**Bypasses to check**

- Redirects: `maxRedirects` left at the default, or followed manually without
  re-checking each hop.
- **Check then change:** the URL is validated, then rebuilt, re-parsed, or
  string-concatenated (`${base}${path}`) before the request.
- Address encodings that still reach the loopback or link-local range:
  `127.1`, `0`, `0x7f.1`, `2130706433`, `[::1]`, `[::ffff:127.0.0.1]`,
  `localtest.me` and other public names that resolve to private space.
- Cloud metadata: `169.254.169.254`, `metadata.google.internal`, and
  `100.100.100.200`.
- Non-HTTP schemes: `file://`, `gopher://`, `ftp://`, `dict://` — allow only
  `http:` and `https:`.
- Credentials in the authority (`https://api.partner.com@evil.com/`) fooling a
  naive `startsWith` on the URL string rather than on `url.hostname`.
- The response returned to the caller (status, body, timing, redirect location)
  turning a blind SSRF into a readable one.
- Parsers that fetch on your behalf: PDF and image renderers, SVG, XML external
  entities, webhooks, "preview this link", RSS import.

**What to grep for**

- `axios.get(`, `fetch(`, `got(`, `http.request(`, `request(`
- `new URL(`, `url.hostname`, `endsWith(`, `includes(`, `startsWith(`
- `maxRedirects`, `followRedirect`, `webhookUrl`, `callbackUrl`, `imageUrl`
