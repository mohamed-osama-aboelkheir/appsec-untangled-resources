**Mitigation options**

| Option | When it fits | Docs |
|---|---|---|
| Flask-WTF `CSRFProtect` | Any form app with cookie sessions; protects every POST, PUT, PATCH and DELETE | [Flask-WTF CSRF](https://flask-wtf.readthedocs.io/en/stable/csrf/) |
| `SESSION_COOKIE_SAMESITE='Lax'` | Always; the cheap baseline | [Flask config](https://flask.palletsprojects.com/en/stable/config/#SESSION_COOKIE_SAMESITE) |
| Bearer tokens only, for the API | JSON APIs that never read the session cookie | [OWASP CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html) |

**What `CSRFProtect` does on a request.** It generates a random token, keeps
it in the signed session, and renders a signed copy into each form through
`{{ csrf_token() }}`. On every unsafe method, a `before_request` hook reads
`csrf_token` from the form (or the `X-CSRFToken` header). It checks the
signature and expiry, and checks that the token matches the one in the
caller's session. If it doesn't, the request gets a `400`. A page on another
site can make the browser send the cookie, but it can't read the token, so its
forged POST fails.

**Vulnerable — no CSRF protection, state change on POST**

```python
@app.post('/settings/email')
@login_required
def change_email():
    users.update_email(g.user['id'], request.form['email'])
    return redirect('/settings')
```

**Vulnerable — the API is exempt but also reads the cookie**

```python
csrf.exempt(api_bp)

@api_bp.post('/transfer')
def transfer():
    user = users.find_by_id(session['user_id'])      # cookie auth on an exempt blueprint
```

**Vulnerable — state change on GET**

```python
@app.get('/repos/<rid>/delete')     # an <img src> on any site deletes it
```

**Mitigated — global CSRFProtect, token in every form**

```python
csrf = CSRFProtect()
csrf.init_app(app)
app.config.update(SESSION_COOKIE_SAMESITE='Lax', SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SECURE=True)
```

```html
<form method="post" action="{{ url_for('settings.change_email') }}">
  <input type="hidden" name="csrf_token" value="{{ csrf_token() }}">
  ...
</form>
```

Docs: [Flask-WTF CSRF](https://flask-wtf.readthedocs.io/en/stable/csrf/)

**Mitigated — an exempt API that only accepts bearer tokens**

```python
csrf.exempt(api_bp)

@api_bp.before_request
def _no_cookies():
    g.user = None                 # never call load_session_user() for /api; require_token sets g.user
```

**Bypasses to check**

- `@csrf.exempt` on single views, and on blueprints that also read `session`.
- `WTF_CSRF_CHECK_DEFAULT = False` with only some views calling `csrf.protect()`.
- `WTF_CSRF_METHODS` narrowed so that `PUT` or `DELETE` aren't checked.
- CORS (Flask-CORS) with `supports_credentials=True` and a wildcard or reflected origin.
- `SESSION_COOKIE_SAMESITE=None` without a token.

**What to grep for**

- `CSRFProtect`, `csrf.exempt`, `WTF_CSRF_`, `csrf_token()`, `X-CSRFToken`
- `SESSION_COOKIE_SAMESITE`, `CORS(`, `supports_credentials`
- `methods=['GET'`, `@app.get(` on routes that write
