**Mitigation options**

| Option | When it fits | Docs |
|---|---|---|
| Pass input as data, never as template source | Almost always | [EJS](https://ejs.co/) |
| Fixed template files chosen from an allowlist | The template itself must vary | [Express API](https://expressjs.com/en/5x/api.html) |
| Logic-less engine for user-authored templates | Users genuinely need to write templates | [OWASP injection](https://cheatsheetseries.owasp.org/cheatsheets/Injection_Prevention_Cheat_Sheet.html) |

In Express, template injection is usually remote code execution, not just
information disclosure: EJS, Pug and Handlebars compile to JavaScript.

**Vulnerable — user input compiled as a template**

```js
router.post('/preview', requireAuth, (req, res) => {
  const html = ejs.render(req.body.template, { user: req.user })
  res.send(html)
})
```

**Vulnerable — user input chooses the template**

```js
res.render(req.query.page, { user: req.user })     // also path traversal
```

**Vulnerable — user input reaches the options object**

```js
ejs.render(template, data, req.body.options)
```

EJS has had remote code execution through options such as `outputFunctionName`
and `filename` (for example CVE-2022-29078), so the options argument must never
come from a request.

**Mitigated — input is data**

```erb
<!-- views/preview.ejs -->
<h1><%= title %></h1>
<div><%= body %></div>
```

```js
res.render('preview', { title: req.body.title, body: req.body.body })
```

**Mitigated — allowlist the template name**

```js
const PAGES = new Set(['about', 'pricing', 'contact'])
const page = PAGES.has(req.query.page) ? req.query.page : 'about'
res.render(page, { user: req.user })
```

Docs: [`res.render`](https://expressjs.com/en/5x/api.html)

**Mitigated — logic-less engine for user templates**

```js
const output = Mustache.render(userTemplate, {
  name: customer.name,
  total: formatMoney(invoice.total),
})
```

Mustache has no expression evaluation, so a template can reference the values
you pass and nothing else. Render it in a worker with a timeout if the templates
are untrusted.

Docs: [mustache.js](https://github.com/janl/mustache.js)

**Bypasses to check**

- **Check then change:** the template string is validated or escaped, then
  concatenated with another fragment before compiling.
- Any compile-from-string API, even when only part of the string is user input:
  a subject line, an email signature, a report header.
- `lodash.template`, `nunjucks.renderString`, `handlebars.compile`,
  `pug.compile`, `new Function`, `vm.runInNewContext`.
- Sandboxes that are not sandboxes: `vm` in Node shares the process and is not
  a security boundary.
- Escaping applied to the rendered output rather than to the template source —
  by then the code has already run.
- The template name reaching `res.render` from input, which combines template
  selection with path traversal into the views directory.

**What to grep for**

- `ejs.render(`, `ejs.compile(`, `renderString(`, `Handlebars.compile(`,
  `pug.compile(`, `_.template(`
- `res.render(` with a variable as the first argument
- `new Function(`, `eval(`, `vm.`
