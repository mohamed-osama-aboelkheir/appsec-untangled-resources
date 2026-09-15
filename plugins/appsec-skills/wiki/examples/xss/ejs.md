**Mitigation options**

| Option | When it fits | Docs |
|---|---|---|
| Escape by default in the template | Server-rendered HTML | [EJS](https://ejs.co/) |
| Sanitise, then insert as HTML | Rich text that must keep markup | [DOMPurify](https://github.com/cure53/DOMPurify) |
| Return data, render in the client | JSON APIs with a JS front end | [OWASP XSS](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html) |
| Content Security Policy | Defence in depth, never the only control | [Helmet](https://helmetjs.github.io/) |

**Vulnerable — unescaped output in EJS**

```erb
<div class="comment"><%- comment.body %></div>
```

`<%-` writes raw HTML. `<%=` escapes.

**Vulnerable — HTML built by concatenation**

```js
res.send(`<h1>Results for ${req.query.q}</h1>`)
```

**Vulnerable — escaped, but in the wrong context**

```erb
<a href="<%= profile.website %>">Website</a>
<script>const user = <%- JSON.stringify(user) %>;</script>
```

HTML escaping does not make a URL safe (`javascript:alert(1)` survives it), and
`JSON.stringify` output inside `<script>` can be broken out of with `</script>`.

**Mitigated — escape by default**

```erb
<div class="comment"><%= comment.body %></div>
```

Docs: [EJS tags](https://ejs.co/)

**Mitigated — sanitise rich text**

```js
const window = new JSDOM('').window
const purify = DOMPurify(window)

const safeHtml = purify.sanitize(req.body.body, {
  ALLOWED_TAGS: ['p', 'b', 'i', 'em', 'strong', 'a', 'ul', 'ol', 'li', 'code'],
  ALLOWED_ATTR: ['href'],
  ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|#)/i,
})
await Comment.create({ body: safeHtml, authorId: req.user.id })
```

Sanitise on output, or on input **and** output; storing sanitised HTML alone
means a later change to the allowlist can't be applied retroactively.

Docs: [DOMPurify configuration](https://github.com/cure53/DOMPurify) · [jsdom](https://github.com/jsdom/jsdom)

**Mitigated — safe URL and safe script data**

```js
function safeUrl(value) {
  try {
    const url = new URL(value, 'https://example.com')
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '#'
  } catch { return '#' }
}
```

```erb
<a href="<%= safeUrl(profile.website) %>">Website</a>
<script type="application/json" id="bootstrap"><%- safeJson(user) %></script>
<script>const user = JSON.parse(document.getElementById('bootstrap').textContent)</script>
```

where `safeJson` replaces `<`, `>`, `&`, `U+2028` and `U+2029` with escapes.

**Bypasses to check**

- One `<%-` left among many `<%=`, or a helper that returns a pre-built HTML
  string which the template then prints escaped-looking but raw.
- Attribute context without quotes (`class=<%= x %>`), event handlers
  (`onclick="<%= x %>"`), and `style` — HTML escaping is not enough in any of
  these.
- `javascript:`, `data:` and `vbscript:` URLs in `href`, `src`, `formaction`;
  filtering only `javascript:` misses `java\tscript:` and case variants.
- Client-side sinks: `innerHTML`, `outerHTML`, `insertAdjacentHTML`,
  `document.write`, `eval`, `location = `, `dangerouslySetInnerHTML`.
- **Check then change:** input sanitised, then decoded, unescaped, truncated or
  concatenated afterwards — truncation can cut a tag open, and a second
  `decodeURIComponent` can revive an entity.
- Stored XSS through fields nobody thinks of as HTML: filenames, user agents,
  error messages, PDF or email templates.
- `res.send()` with a user-controlled string and no `Content-Type`, so a JSON
  response is sniffed as HTML.
- CSP weakened by `unsafe-inline` or a permissive `script-src`.

**What to grep for**

- `<%-`, `{{{`, `dangerouslySetInnerHTML`, `v-html`
- `innerHTML`, `insertAdjacentHTML`, `document.write`, `outerHTML`
- `res.send(` with backticks, `res.write(`, `Content-Type`
- `href="<%`, `src="<%`, `JSON.stringify` inside `<script>`
