**Mitigation options**

| Option | When it fits | Docs |
|---|---|---|
| Autoescape on for the whole environment (the default) | Every server-rendered page | [Nunjucks `configure`](https://mozilla.github.io/nunjucks/api.html#configure) |
| Sanitise, then mark safe | Rich text that must keep markup | [DOMPurify](https://github.com/cure53/DOMPurify) |
| Pass data to scripts through a `data-` attribute | Page scripts that need server data | [Nunjucks `dump`](https://mozilla.github.io/nunjucks/templating.html#dump) |
| Content Security Policy | Defence in depth, never the only control | [Helmet](https://helmetjs.github.io/) |

Nunjucks escapes `& " ' < > \` in every `{{ }}` when `autoescape` is on, and it
is on unless someone turns it off. So the review question is less "is this
value escaped?" and more "where was escaping switched off or opted out of?".
That can happen in the environment config, a `| safe` filter, a `SafeString`
built in route code, or a custom filter or extension. Nunjucks has no
`{% autoescape %}` block tag, so it can't be switched off per template.

**Vulnerable — autoescape turned off for the whole app**

```js
nunjucks.configure('views', {
  autoescape: false,
  express: app,
})
```

```html
<td>{{ emp.name }}</td>
<input name="title" value="{{ emp.title }}">
```

One line in `app.js` makes every `{{ }}` in every template raw, in both text
and attribute contexts. The templates themselves look normal, so reading only
the views (or only a PR that touches a view) won't show it.

**Vulnerable — opting out per value**

```html
<div class="bio">{{ user.bio | safe }}</div>
```

```js
res.render('profile.html', { bio: new nunjucks.runtime.SafeString(user.bio) })
```

`| safe`, `markSafe()` and `SafeString` all say "this is already HTML". Moving
the opt-out into route code hides it from anyone reading the template.

**Vulnerable — custom filter that returns safe markup around raw input**

```js
env.addFilter('highlight', (text, term) =>
  new nunjucks.runtime.SafeString(text.replace(term, `<mark>${term}</mark>`)))
```

A filter's plain-string return value is escaped. A `SafeString` return value is
not, including any user text it wraps.

**Vulnerable — escaped, but in the wrong context**

```html
<a href="{{ profile.website }}">Website</a>
<a class={{ user.theme }}>Profile</a>
<button onclick="track('{{ query }}')">Search</button>
<script>const user = {{ user | dump | safe }};</script>
```

Autoescape is HTML escaping, and it fails here, even when it's on:

- `javascript:alert(1)` contains no character it escapes.
- An unquoted attribute ends at the first space.
- Inside an event handler, the browser decodes `&#39;` back to `'` before the
  JavaScript runs.
- `dump` without `| safe` produces broken JSON (`&quot;`), so developers add
  `| safe`, and then `</script>` in any string closes the script element.

**Mitigated — keep autoescape on**

```js
nunjucks.configure('views', {
  autoescape: true,
  express: app,
})
```

```html
<td>{{ emp.name }}</td>
<input name="title" value="{{ emp.title }}">
```

Text and double-quoted attribute values are safe with no further work. Leave
`autoescape` out entirely to get the same default, but writing it down stops a
later "fix" from turning it off.

Docs: [Nunjucks autoescaping](https://mozilla.github.io/nunjucks/templating.html#autoescaping) · [Nunjucks `configure`](https://mozilla.github.io/nunjucks/api.html#configure)

**Mitigated — sanitise rich text before marking it safe**

```js
const window = new JSDOM('').window
const purify = DOMPurify(window)

env.addFilter('richtext', (html) =>
  new nunjucks.runtime.SafeString(purify.sanitize(String(html ?? ''), {
    ALLOWED_TAGS: ['p', 'b', 'i', 'em', 'strong', 'a', 'ul', 'ol', 'li', 'code'],
    ALLOWED_ATTR: ['href'],
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|#)/i,
  })))
```

```html
<div class="bio">{{ user.bio | richtext }}</div>
```

Make the sanitiser the only path to `SafeString` for user content, so a
reviewer can grep for `| safe` and expect no hits on user data.

Docs: [DOMPurify configuration](https://github.com/cure53/DOMPurify) · [jsdom](https://github.com/jsdom/jsdom) · [Nunjucks custom filters](https://mozilla.github.io/nunjucks/api.html#custom-filters)

**Mitigated — safe URL, quoted attributes and script data**

```js
env.addFilter('safeUrl', (value) => {
  try {
    const url = new URL(value, 'https://example.com')
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '#'
  } catch { return '#' }
})
```

```html
<a href="{{ profile.website | safeUrl }}">Website</a>
<a class="{{ user.theme }}">Profile</a>
<button data-query="{{ query }}" class="track">Search</button>
<div id="bootstrap" data-user="{{ user | dump }}"></div>
<script src="/js/page.js"></script>
```

```js
// /js/page.js
const user = JSON.parse(document.getElementById('bootstrap').dataset.user)
```

The browser decodes the escaped attribute back into the exact JSON, and the
JSON never sits inside a `<script>` element. Event handlers read the value from
`data-` attributes instead of having it pasted into inline JavaScript, which
also lets a CSP drop `'unsafe-inline'`.

Docs: [Nunjucks `dump`](https://mozilla.github.io/nunjucks/templating.html#dump) · [MDN `dataset`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/dataset)

**Bypasses to check**

- **The switch, not the template.** `autoescape: false` in
  `nunjucks.configure(...)` or `new nunjucks.Environment(loader, {...})`, or
  `env.opts.autoescape = false` set later. Check every environment: an app can
  create one for pages and another for emails, with different settings.
- `| safe`, `markSafe()`, `new SafeString()` anywhere in the route, service or
  helper code that builds render data, not only in `views/`.
- Custom filters, globals and extensions that return `SafeString`, or
  extensions registered with `autoescape: false`.
- Context mismatch even with autoescape on: unquoted attributes, `href`/`src`/
  `formaction` with `javascript:` or `data:`, `on*` handlers, `style`, and
  values inside `<script>` (`dump | safe`, or a value pasted into a JS string).
- **Check then change:** a value is escaped or sanitised in code, then the
  template prints it with `| safe`, or a filter later truncates (`| truncate`),
  replaces or concatenates it. Truncating sanitised HTML can leave a tag open.
- Stored XSS crossing privilege levels: fields a low-privilege user writes that
  an admin page renders. HttpOnly cookies and CSRF tokens don't help there,
  because the script runs on the app's own origin and can read the token from
  the page.
- Nunjucks before 3.2.4 didn't escape `\`, so two values on one line inside a
  JavaScript string could combine into a breakout (CVE-2023-2142). Check the
  version in the lockfile.

**What to grep for**

- `autoescape`, `nunjucks.configure(`, `new nunjucks.Environment(`, `opts.autoescape`
- `| safe`, `markSafe(`, `SafeString(`
- `addFilter(`, `addGlobal(`, `addExtension(`
- `href="{{`, `src="{{`, `=\{\{` (unquoted attribute), `on[a-z]+="[^"]*\{\{`
- `| dump` inside `<script>`, `<script>` blocks containing `{{`
