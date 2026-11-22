**Mitigation options**

| Option | When it fits | Docs |
|---|---|---|
| Flask's signed cookie session + a login decorator | Server-rendered apps; the session is signed, not encrypted | [Flask sessions](https://flask.palletsprojects.com/en/stable/quickstart/#sessions) |
| Flask-Login | The same, with `login_required`, "remember me" and user loading built in | [Flask-Login](https://flask-login.readthedocs.io/) |
| Server-side sessions (Flask-Session) | You need to revoke a session on the server | [Flask-Session](https://flask-session.readthedocs.io/) |
| JWT (`PyJWT`, Flask-JWT-Extended) | APIs used by non-browser clients; revocation needs extra work | [PyJWT](https://pyjwt.readthedocs.io/), [Flask-JWT-Extended](https://flask-jwt-extended.readthedocs.io/) |

**Vulnerable — weak secret, session kept across login**

```python
app.secret_key = 'dev'                       # anyone can sign their own session cookie

@app.post('/login')
def login():
    user = db.users.find_one({'email': request.form['email']})
    if user and user['password'] == hashlib.md5(request.form['password'].encode()).hexdigest():
        session['user_id'] = str(user['_id'])  # no session.clear(), no slow hash
        return redirect('/')
    return 'Invalid credentials', 401
```

Flask's session is a cookie **signed** with `SECRET_KEY`. Anyone who knows the
key can write `{"user_id": "<any id>"}` and sign it, with tools like
flask-unsign.

**Vulnerable — a route that forgot the decorator**

```python
@app.get('/admin/export')        # no @login_required, so anyone can call it
def export():
    return jsonify(list(db.users.find({}, {'password_hash': 0})))
```

**Vulnerable — JWT decoded without verification or without pinning the algorithm**

```python
payload = jwt.decode(token, options={'verify_signature': False})
payload = jwt.decode(token, key, algorithms=jwt.algorithms.get_default_algorithms())
```

**Mitigated — session with a strong key, bcrypt, and a fresh session on login**

```python
app.config.update(
    SECRET_KEY=os.environ['SECRET_KEY'],            # long, random, per environment
    SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SECURE=True, SESSION_COOKIE_SAMESITE='Lax',
)

@app.post('/login')
def login():
    user = users.find_by_email(request.form.get('email', ''))
    if not user or not bcrypt.checkpw(request.form.get('password', '').encode(), user['password_hash'].encode()):
        return render_template('login.html', error='Invalid credentials'), 401
    session.clear()                                 # drop anything set before login
    session['user_id'] = user['id']
    session['pw'] = user['password_hash'][-16:]     # changes when the password does
    return redirect(url_for('home'))

@app.before_request
def load_user():
    g.user = None
    if (uid := session.get('user_id')) and (u := users.find_by_id(uid)) and session.get('pw') == u['password_hash'][-16:]:
        g.user = u
    elif uid:
        session.clear()                             # password changed: sign this session out
```

Flask can't revoke a signed cookie on the server. Binding it to the password
hash is what makes a password change sign out the other sessions.

Docs: [Flask sessions](https://flask.palletsprojects.com/en/stable/api/#sessions) · [`SECRET_KEY`](https://flask.palletsprojects.com/en/stable/config/#SECRET_KEY) · [bcrypt](https://github.com/pyca/bcrypt)

**Mitigated — JWT for the API**

```python
def require_token(view):
    @wraps(view)
    def wrapped(*a, **kw):
        scheme, _, token = request.headers.get('Authorization', '').partition(' ')
        if scheme != 'Bearer' or not token:
            return jsonify(error='Authorization required'), 401
        try:
            claims = jwt.decode(token, current_app.config['JWT_SECRET'], algorithms=['HS256'],
                                options={'require': ['exp', 'sub', 'pwv']})
        except jwt.PyJWTError:
            return jsonify(error='Invalid token'), 401
        user = users.find_by_id(claims['sub'])
        if not user or claims['pwv'] != user['password_version']:   # revoked by a password change
            return jsonify(error='Invalid token'), 401
        g.user = user
        return view(*a, **kw)
    return wrapped
```

Docs: [PyJWT `decode`](https://pyjwt.readthedocs.io/en/stable/api.html#jwt.decode)

**Bypasses to check**

- `SECRET_KEY` hard-coded, committed in `.env.example`, or the same in every environment.
- A password change that ends the web session but not the API tokens, or the other way round.
- `jwt.decode` without `algorithms=[…]`, or with `verify_signature: False` anywhere in the auth path.
- Blueprints or `add_url_rule` routes registered without the decorator. Compare every view with its siblings.
- `request.headers['X-User-Id']`, or a user ID taken from the body, trusted as the identity.
- No rate limit on the login routes; see [Flask-Limiter](https://flask-limiter.readthedocs.io/).

**What to grep for**

- `secret_key`, `SECRET_KEY`, `session[`, `session.clear(`, `before_request`
- `login_required`, `@app.route`, `@bp.route`, `add_url_rule(`
- `jwt.decode(`, `verify_signature`, `algorithms`, `bcrypt.checkpw(`, `hashlib.md5`, `check_password_hash(`
