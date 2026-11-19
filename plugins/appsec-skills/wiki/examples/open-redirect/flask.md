**Mitigation options**

| Option | When it fits | Docs |
|---|---|---|
| Redirect to a route name (`url_for`) | Default; the destination is never input | [`url_for`](https://flask.palletsprojects.com/en/stable/api/#flask.url_for) |
| Same-site path check on `next` | Login flows that return the user to where they were | [`urllib.parse.urlsplit`](https://docs.python.org/3/library/urllib.parse.html#urllib.parse.urlsplit) |
| An allowlist of hosts | Redirects to partner sites or other apps you own | [`urlsplit`](https://docs.python.org/3/library/urllib.parse.html#urllib.parse.urlsplit) |

**Vulnerable — redirect to whatever `next` says**

```python
@app.post('/login')
def login():
    ...
    return redirect(request.args.get('next', '/'))       # next=https://evil.example
```

**Vulnerable — a prefix check**

```python
nxt = request.args.get('next', '/')
if nxt.startswith('/'):
    return redirect(nxt)          # //evil.example and /\evil.example both pass
```

Browsers treat `//host` as protocol-relative, and many treat `\` like `/`.

**Mitigated — only same-site paths**

```python
def safe_next(target, fallback='/'):
    if not isinstance(target, str) or not target.startswith('/') or target.startswith('//') or '\\' in target:
        return fallback
    parts = urlsplit(target)
    if parts.scheme or parts.netloc:
        return fallback
    return target

return redirect(safe_next(request.values.get('next')))
```

Docs: [`urlsplit`](https://docs.python.org/3/library/urllib.parse.html#urllib.parse.urlsplit) · [`flask.redirect`](https://flask.palletsprojects.com/en/stable/api/#flask.redirect)

**Bypasses to check**

- Tabs and newlines: `urlsplit` strips them (as browsers do), so validate the value you actually redirect to.
- `next` read from both the form and the query (`request.values`). Check that both paths go through the helper.
- Redirect targets in `Referer` headers, OAuth `redirect_uri`, or logout `return_to`.
- **Check then change:** the value is validated, then URL-decoded or joined with a base before redirecting.

**What to grep for**

- `redirect(`, `request.args.get('next'`, `request.values.get(`, `next=`, `return_to`, `request.referrer`
