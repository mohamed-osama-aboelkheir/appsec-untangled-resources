**Mitigation options**

| Option | When it fits | Docs |
|---|---|---|
| A role decorator next to `login_required` | A few fixed roles | [Flask view decorators](https://flask.palletsprojects.com/en/stable/patterns/viewdecorators/) |
| A blueprint `before_request` that requires a role | A whole area (`/admin`) shares one rule | [`Blueprint.before_request`](https://flask.palletsprojects.com/en/stable/api/#flask.Blueprint.before_request) |
| Per-resource roles checked in the loader (`need='admin'`) | Roles that differ per project or repository | [`flask.abort`](https://flask.palletsprojects.com/en/stable/api/#flask.abort) |

**Vulnerable — the UI hides the button, the route doesn't check**

```python
@app.post('/projects/<pid>/members/<uid>/remove')
@login_required
def remove_member(pid, uid):          # any logged-in member can call it
    db.projects.update_one({'_id': ObjectId(pid)}, {'$pull': {'members': {'user_id': uid}}})
    return redirect(url_for('members', pid=pid))
```

**Vulnerable — the role check runs on GET only**

```python
@app.route('/settings', methods=['GET', 'POST'])
def settings():
    if request.method == 'GET':
        require_admin()
        return render_template('settings.html')
    save_settings(request.form)        # POST skips the check
```

**Vulnerable — the web route checks, the API sibling doesn't**

```python
@bp.post('/<owner>/<name>/branches/delete')
def delete_branch_web(owner, name):
    repo = load_repo(owner, name, need='write'); ...

@api.delete('/repos/<rid>/branches/<branch>')
@require_token
def delete_branch_api(rid, branch):
    repo = repos.find_by_id(rid); git.delete_branch(rid, branch)   # no write check
```

**Mitigated — check the role on the server, per route**

```python
def require_role(*roles):
    def deco(view):
        @wraps(view)
        def wrapped(*a, **kw):
            if not g.user or g.user['role'] not in roles:
                abort(403)
            return view(*a, **kw)
        return wrapped
    return deco

@admin_bp.before_request
def _admin_only():                 # runs before every view in the blueprint, including ones added later
    if not g.user:
        return redirect(url_for('auth.login', next=request.path))
    if g.user['role'] != 'admin':
        abort(403)
```

Docs: [Flask view decorators](https://flask.palletsprojects.com/en/stable/patterns/viewdecorators/) · [`Blueprint.before_request`](https://flask.palletsprojects.com/en/stable/api/#flask.Blueprint.before_request)

**Mitigated — roles you can grant are capped**

```python
COLLABORATOR_ROLES = ('read', 'write')          # 'admin' can't be granted through this route
if request.form.get('role') not in COLLABORATOR_ROLES:
    abort(400)
```

**Bypasses to check**

- Decorator order. In Flask the decorator closest to the function runs first, so `@login_required` placed above `@app.route` is never applied.
- `methods=['GET', 'POST']` views whose check covers only one branch.
- API and web blueprints that duplicate an action. Check that both sides check the role.
- Role values taken from the form when granting roles, such as `role=admin` or `role=owner`.

**What to grep for**

- `@login_required`, `before_request`, `abort(403)`, `role`, `is_admin`, `need=`
- `methods=[`, `request.method ==`, `@api.`, `@bp.`
