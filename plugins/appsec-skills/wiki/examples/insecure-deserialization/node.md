**Mitigation options**

| Option | When it fits | Docs |
|---|---|---|
| `JSON.parse` + schema validation | Best option: JSON carries no types or functions | [Zod](https://zod.dev/), [Ajv](https://ajv.js.org/) |
| `js-yaml` 4 `load` (safe by default) | YAML input | [js-yaml](https://github.com/nodeca/js-yaml) |
| Signed or encrypted cookies | State round-tripped through the client | [cookie-signature](https://github.com/tj/node-cookie-signature), [iron-session](https://github.com/vvo/iron-session) |

**Vulnerable — `node-serialize` (or `funcster`, `serialize-to-js`)**

```js
const serialize = require('node-serialize')
app.get('/profile', (req, res) => {
  const prefs = serialize.unserialize(Buffer.from(req.cookies.prefs, 'base64').toString())
  res.json(prefs)
})
```

`node-serialize` revives functions with `eval`. A value ending in `()` is called
while it is being decoded, which gives code execution (CVE-2017-5941).

**Vulnerable — YAML with the unsafe schema**

```js
yaml.load(body)                                    // js-yaml 3.x: !!js/function runs code
yaml.load(body, { schema: yaml.DEFAULT_FULL_SCHEMA })
```

**Vulnerable — JSON merged into an object**

```js
const settings = merge({}, JSON.parse(req.body.settings))   // {"__proto__": {"isAdmin": true}}
```

`JSON.parse` itself is safe, but a deep merge or `Object.assign` of the result
is prototype pollution.

**Mitigated — JSON + schema**

```js
const Prefs = z.object({ theme: z.enum(['light', 'dark']), pageSize: z.number().int().min(10).max(100) }).strict()
const prefs = Prefs.parse(JSON.parse(req.cookies.prefs ?? '{}'))
```

Docs: [Zod](https://zod.dev/)

**Mitigated — safe YAML**

```js
const yaml = require('js-yaml')          // v4: load() uses the safe default schema
const doc = yaml.load(body)
```

Docs: [js-yaml migration notes](https://github.com/nodeca/js-yaml/blob/master/migrate_v3_to_v4.md)

**Bypasses to check**

- js-yaml pinned to 3.x, where `load` is unsafe and `safeLoad` is the safe one.
- `v8.deserialize` or `vm` used to "revive" objects, and `eval`/`new Function` on stored JSON-like strings.
- Merging decoded input into objects (prototype pollution) and class-transformer `plainToInstance` into classes with side effects.
- Signed cookies whose secret is a default value or hard-coded.

**What to grep for**

- `unserialize(`, `node-serialize`, `funcster`, `serialize-to-js`, `cryo`
- `yaml.load(`, `DEFAULT_FULL_SCHEMA`, `js-yaml@3`, `v8.deserialize(`
- `eval(`, `new Function(`, `plainToInstance(`, `merge(`, `Object.assign(`
