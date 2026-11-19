**Mitigation options**

| Option | When it fits | Docs |
|---|---|---|
| Scope the query by the caller (`{'_id': id, 'owner_id': g.user['id']}`) | Default choice; there is no unscoped read to forget | [PyMongo `find_one`](https://pymongo.readthedocs.io/en/stable/api/pymongo/collection.html#pymongo.collection.Collection.find_one), [SQLAlchemy `where`](https://docs.sqlalchemy.org/en/20/tutorial/data_select.html) |
| One loader helper per resource that checks access and aborts | Many routes share a parent (a project, a repository) | [`flask.abort`](https://flask.palletsprojects.com/en/stable/api/#flask.abort) |
| A policy library (Flask-Principal, Oso, Casbin) | Complex sharing rules | [Flask-Principal](https://pythonhosted.org/Flask-Principal/) |

**Vulnerable — load by ID, no owner check**

```python
@app.get('/api/notes/<note_id>')
@login_required
def get_note(note_id):
    note = db.notes.find_one({'_id': ObjectId(note_id)})
    return jsonify(serialize(note)) if note else ('', 404)
```

**Vulnerable — the parent is checked, the child is not**

```python
@app.get('/<owner>/<name>/issues/<int:number>')
def issue(owner, name, number):
    repo = load_repo(owner, name)                 # checks the caller can see this repo
    issue = db.issues.find_one({'number': number, 'repo_id': request.args.get('repo')})
    ...
```

The access check is for the repository in the URL, but the query uses a
`repo_id` from the query string.

**Mitigated — scoped query**

```python
@app.get('/api/notes/<note_id>')
@login_required
def get_note(note_id):
    oid = to_object_id(note_id)                   # None for invalid ids → 404, not 500
    note = oid and db.notes.find_one({'_id': oid, 'owner_id': g.user['id']})
    if not note:
        abort(404)
    return jsonify(serialize(note))
```

Docs: [PyMongo `find_one`](https://pymongo.readthedocs.io/en/stable/api/pymongo/collection.html#pymongo.collection.Collection.find_one) · [`bson.ObjectId.is_valid`](https://pymongo.readthedocs.io/en/stable/api/bson/objectid.html)

**Mitigated — one loader for a parent, child queries keyed by the loaded parent**

```python
def load_repo(owner, name, need='read'):
    repo = repos.find_by_owner_and_name(owner, name)
    if not repo or not can_view(repo, current_user_id()):
        abort(404)                                # private and missing look the same
    if need == 'write' and not can_write(repo, current_user_id()):
        abort(403)
    return repo

issue = db.issues.find_one({'repo_id': repo['id'], 'number': number})
```

**Bypasses to check**

- Routes for the same object that use different loaders. The JSON API often has its own copy of the check.
- A `404` for missing objects and a `403` for other users' objects. That tells the caller which IDs exist.
- Child IDs taken from the body or query string instead of from the object that was loaded.
- `ObjectId(value)` raising on bad input. It's a crash, not a check.
- Bulk and list endpoints (`?ids=`, exports) that skip the per-object check.

**What to grep for**

- `find_one(`, `find(`, `update_one(`, `delete_one(`, `.query.get(`, `session.get(`
- `<id>`, `<int:`, `request.args.get(`, `request.json`, `ObjectId(`
- `abort(403)`, `abort(404)`, `owner_id`, `g.user`
