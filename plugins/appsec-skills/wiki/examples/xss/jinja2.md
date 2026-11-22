**Mitigation options**

| Option | When it fits | Docs |
|---|---|---|
| Jinja2 autoescaping (on by default in Flask for `.html`, `.htm`, `.xml`, `.xhtml`, `.svg`) | Always; `{{ value }}` is HTML-escaped | [Flask templating](https://flask.palletsprojects.com/en/stable/templating/#jinja-setup), [Jinja autoescaping](https://jinja.palletsprojects.com/en/stable/api/#autoescaping) |
| A Markdown renderer with raw HTML off, plus link checks | Rich text from users | [markdown-it-py](https://markdown-it-py.readthedocs.io/), [Python-Markdown](https://python-markdown.github.io/) |
| An HTML sanitizer (nh3, bleach) | When users must be allowed some HTML | [nh3](https://nh3.readthedocs.io/), [bleach](https://bleach.readthedocs.io/) (deprecated) |
| A strict CSP | Defense in depth for any slip | [MDN CSP](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP) |

**Vulnerable — `|safe` or `Markup()` on user text**

```jinja
<div class="bio">{{ user.bio|safe }}</div>
```

```python
return render_template('page.html', body=Markup(request.form['body']))
```

`|safe` and `Markup` tell Jinja the text is already HTML, so it's printed as-is.

**Vulnerable — autoescape off for a whole block or file**

```jinja
{% autoescape false %}{{ comment.body }}{% endautoescape %}
```

Flask autoescapes `render_template_string` and templates ending in `.html`,
`.htm`, `.xml`, `.xhtml` and `.svg`. A template with another extension, such
as `.j2` or `.txt` served as HTML, is **not** autoescaped, and neither is a
plain `jinja2.Environment()` created without `autoescape=`.

**Vulnerable — Markdown with HTML allowed, then marked safe**

```python
md = MarkdownIt('commonmark')                       # 'commonmark' allows raw HTML blocks
Markup(md.render(text))                              # <img src=x onerror=…> passes through
```

**Vulnerable — escaped, but in the wrong context**

```jinja
<a href="{{ user.website }}">site</a>                 {# javascript:alert(1) is not escaped away #}
<script>var name = "{{ user.name }}";</script>        {# HTML escaping is not JS escaping #}
<div onclick="go('{{ item.id }}')">                   {# event handler: JS context #}
```

**Mitigated — autoescape, `|tojson` for scripts, schemes checked for URLs**

```jinja
<p>{{ comment.body }}</p>
<script type="application/json" id="data">{{ payload|tojson }}</script>
{% if user.website.startswith(('https://', 'http://')) %}<a href="{{ user.website }}" rel="nofollow noopener">site</a>{% endif %}
```

`|tojson` escapes `<`, `>`, `&` and `'` so the value can't close the script
tag.

Docs: [Jinja `tojson`](https://jinja.palletsprojects.com/en/stable/templates/#jinja-filters.tojson)

**Mitigated — Markdown with raw HTML disabled**

```python
_md = MarkdownIt('js-default')        # CommonMark + tables, html=False, validateLink blocks javascript:/vbscript:/data:
def render_markdown(text):
    return Markup(_md.render(text or ''))
```

Docs: [markdown-it-py presets](https://markdown-it-py.readthedocs.io/en/latest/using.html)

**Mitigated — sanitize when HTML is a feature**

```python
clean = nh3.clean(user_html, tags={'b', 'i', 'a', 'p', 'ul', 'li'}, url_schemes={'https', 'mailto'})
```

Docs: [nh3](https://nh3.readthedocs.io/)

**Bypasses to check**

- `|safe`, `Markup(`, `{% autoescape false %}` and `Environment(autoescape=False)` anywhere in the code.
- `select_autoescape()` with a custom extension list that misses the templates actually used, or a bare `Environment()` (autoescape is off by default outside Flask).
- Syntax highlighters and Markdown output wrapped in `Markup`. Confirm the library escapes code and disables HTML.
- Values put in `href`, `src` and `style`, or inside `<script>` and event handlers.
- Raw file endpoints served as `text/html`, or without `X-Content-Type-Options: nosniff`.

**What to grep for**

- `|safe`, `Markup(`, `autoescape`, `render_template_string(`, `select_autoescape`
- `MarkdownIt(`, `markdown.markdown(`, `bleach.`, `nh3.`, `highlight(`
- `href="{{`, `src="{{`, `<script>`, `onclick="`
