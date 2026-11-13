**Mitigation options**

| Option | When it fits | Docs |
|---|---|---|
| Pass input as data, never as template source | Almost always | [Nunjucks API](https://mozilla.github.io/nunjucks/api.html) |
| Fixed template files chosen from an allowlist | The page or partial itself must vary | [Nunjucks loaders](https://mozilla.github.io/nunjucks/api.html#loader) |
| A different engine built for untrusted templates | Users genuinely need to write templates | [LiquidJS](https://liquidjs.com/) · [mustache.js](https://github.com/janl/mustache.js) |

Nunjucks compiles templates to JavaScript and has no sandbox. Its docs say
plainly that it isn't safe to run user-defined templates or to put user content
into a template's source. Template code can reach the JavaScript `Function`
constructor through any function it can see: the built-in globals `range`,
`cycler` and `joiner`, any function in the context, or even a string literal's
`constructor`. So injected template syntax is remote code execution, not just a
leak of the template variables. Autoescape doesn't help: it escapes output,
after the injected code has already run.

**Vulnerable — user input compiled as a template**

```js
router.post('/preview', requireAuth, (req, res) => {
  res.send(env.renderString(req.body.template, { user: req.user }))
})
```

**Vulnerable — user input concatenated into a template**

```js
const subject = env.renderString(`Welcome, ${user.name}!`, { company })
```

Only part of the string comes from the user, which makes it easy to miss.
`renderString` treats the whole string as source, so a name containing
`{{ … }}` runs.

**Vulnerable — two-stage rendering**

```js
const body = env.renderString(emailTemplate, { name: user.name }) // name is data: safe
const html = env.renderString(body, { company })                   // body is source: not safe
```

The first render correctly treats `name` as data. The second compiles the
first one's output, and `name` is now part of it.

**Vulnerable — user input chooses the template**

```js
res.render(req.query.page, { user: req.user })
```

```html
{% include section %}
```

`res.render`, `{% include %}`, `{% extends %}` and `{% import %}` all accept a
name from data. `FileSystemLoader` blocks `../` out of the views folder, but
its check is a plain prefix match (`resolved.indexOf(base) === 0`). So
`../views-private/x.html` still loads when a sibling folder's name starts with
the views folder's name.

**Mitigated — input is data**

```html
{# views/preview.html #}
<h1>{{ title }}</h1>
<div>{{ body }}</div>
```

```js
res.render('preview.html', { title: req.body.title, body: req.body.body })
```

```js
const subject = env.renderString('Welcome, {{ name }}!', { name: user.name, company })
```

The template source is a file or a constant; user text only ever arrives as a
context value, which Nunjucks prints and never evaluates.

Docs: [`renderString`](https://mozilla.github.io/nunjucks/api.html#renderstring) · [`res.render`](https://expressjs.com/en/5x/api.html#res.render)

**Mitigated — allowlist the template name**

```js
const PAGES = new Map([
  ['about', 'pages/about.html'],
  ['pricing', 'pages/pricing.html'],
])
res.render(PAGES.get(req.query.page) ?? 'pages/about.html', { user: req.user })
```

Map the input to a fixed path rather than checking it and then using it, so
nothing the user sent ever reaches the loader. Do the same for any variable
passed to `{% include %}`.

Docs: [Nunjucks `include`](https://mozilla.github.io/nunjucks/templating.html#include)

**Mitigated — user-authored templates in an engine built for them**

```js
const { Liquid } = require('liquidjs')
const liquid = new Liquid({ ownPropertyOnly: true, strictFilters: true })

const output = await liquid.parseAndRender(userTemplate, {
  name: customer.name,
  total: formatMoney(invoice.total),
}, { renderLimit: 1000 })
```

Liquid templates can read the values you pass and call the filters you
register, but can't call arbitrary functions. `ownPropertyOnly` stops lookups
from walking up the prototype chain. Pass plain data, never objects with
methods, and set render limits so a template can't loop forever. Mustache is
the simpler choice when templates only need variable substitution.

Docs: [LiquidJS options](https://liquidjs.com/tutorials/options.html) · [mustache.js](https://github.com/janl/mustache.js)

**Bypasses to check**

- **Check then change:** the user text is checked for `{{` or `{%`, then
  decoded, trimmed, or concatenated with another fragment before
  `renderString`. Blocklists also miss `{#`, custom tag delimiters set in
  `tags: { variableStart: … }`, and whitespace-control forms like `{{-` and `{%-`.
- Any compile-from-string API: `renderString`, `nunjucks.compile`,
  `new nunjucks.Template(src)`, `env.getTemplate` with a custom loader that
  returns user text as source (a database- or CMS-backed loader).
- Two-stage rendering: the output of one render (or a stored, already-rendered
  string) fed back in as source, such as email templates, notification text,
  or "preview".
- Template names from input reaching `res.render`, `{% include %}`,
  `{% extends %}` or `{% import %}`, including the loader's prefix-match gap
  with sibling folders, and multiple search paths.
- "Sandboxes" that aren't: Node's `vm` module and stripping `constructor` from
  the context. Template code can still reach `Function` through built-ins like
  `range` or a string literal's `constructor`.
- Objects with methods in the render context (models, services, `req`, `app`).
  Even without SSTI they widen what an injected template can call.

**What to grep for**

- `renderString(`, `nunjucks.compile(`, `new nunjucks.Template(`, `new Template(`
- `res.render(` or `env.render(` with a variable as the first argument
- `{% include`, `{% extends`, `{% import`, `{% from` followed by a variable
- `getSource(` in custom loaders, `tags:` in `nunjucks.configure`
- `vm.`, `new Function(`, `eval(`
