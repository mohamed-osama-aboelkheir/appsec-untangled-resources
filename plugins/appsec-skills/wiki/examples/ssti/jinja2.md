**Mitigation options**

| Option | When it fits | Docs |
|---|---|---|
| Templates from files only (`render_template`) | Default; input is only ever data | [`render_template`](https://flask.palletsprojects.com/en/stable/api/#flask.render_template) |
| `SandboxedEnvironment` for user-authored templates | Users must write templates (emails, notifications) | [Jinja sandbox](https://jinja.palletsprojects.com/en/stable/sandbox/) |
| A logic-less format (`str.format_map` with a fixed dict, or `string.Template`) | Simple placeholders such as `{name}` | [`string.Template`](https://docs.python.org/3/library/string.html#template-strings) |

**Vulnerable — user text inside the template source**

```python
@app.get('/hello')
def hello():
    return render_template_string(f"<h1>Hello {request.args['name']}</h1>")
    # name = {{ cycler.__init__.__globals__.os.popen('id').read() }}
```

The input becomes part of the template, so Jinja evaluates it. Through
`__globals__` and `__class__.__mro__`, that reaches `os` and runs commands.

**Vulnerable — "user-editable email templates" with the normal environment**

```python
tmpl = app.jinja_env.from_string(org['welcome_template'])
tmpl.render(user=user)
```

**Mitigated — the input is data, not the template**

```python
return render_template_string('<h1>Hello {{ name }}</h1>', name=request.args.get('name', ''))
```

Docs: [`render_template_string`](https://flask.palletsprojects.com/en/stable/api/#flask.render_template_string)

**Mitigated — a sandbox for user-authored templates**

```python
from jinja2.sandbox import ImmutableSandboxedEnvironment
env = ImmutableSandboxedEnvironment(autoescape=True)
out = env.from_string(org['welcome_template']).render(name=user['name'], org=org['name'])  # plain values only
```

The sandbox blocks access to underscore attributes and unsafe methods. Pass it
plain strings and numbers, never app objects, request objects or the
`config`.

Docs: [`ImmutableSandboxedEnvironment`](https://jinja.palletsprojects.com/en/stable/sandbox/#jinja2.sandbox.ImmutableSandboxedEnvironment)

**Bypasses to check**

- f-strings, `%` or `.format()` building the string passed to `render_template_string` or `from_string`.
- Sandboxed templates given rich objects (an ORM model, `request`, `config`, `g`). Their methods can leak secrets or change state.
- Old Jinja versions with sandbox escapes, such as CVE-2019-10906 and CVE-2016-10745. Check the version.
- `str.format(**user_input)`-style "templates" that allow `{0.__class__}` attribute access. Use `string.Template` instead.

**What to grep for**

- `render_template_string(`, `from_string(`, `Template(`, `Environment(`, `jinja_env`
- `SandboxedEnvironment`, `f"` or `.format(` near template calls, `__globals__`
