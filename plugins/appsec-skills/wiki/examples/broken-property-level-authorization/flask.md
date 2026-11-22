**Mitigation options**

| Option | When it fits | Docs |
|---|---|---|
| Read named fields from `request.form` / `request.json` | Small forms; the simplest allowlist | [`flask.Request`](https://flask.palletsprojects.com/en/stable/api/#flask.Request) |
| A schema (pydantic, marshmallow) for input and output | APIs; validates types and drops unknown fields | [pydantic](https://docs.pydantic.dev/), [marshmallow](https://marshmallow.readthedocs.io/) |
| An explicit response serializer | Every JSON response | [marshmallow `dump`](https://marshmallow.readthedocs.io/en/stable/quickstart.html#serializing-objects-dumping) |

**Vulnerable — the whole body becomes the update**

```python
@app.put('/api/users/me')
@require_token
def update_me():
    db.users.update_one({'_id': ObjectId(g.user['id'])}, {'$set': request.json})   # {"role": "admin"}
    return jsonify(ok=True)
```

**Vulnerable — the whole document goes back**

```python
return jsonify(serialize(db.users.find_one({'_id': oid})))    # includes password_hash, reset tokens
```

**Mitigated — named fields in, named fields out**

```python
@app.put('/api/repos/<rid>')
@require_token
def update_repo(rid):
    data = request.get_json(silent=True) or {}
    fields = {}
    if 'description' in data:
        if not isinstance(data['description'], str):
            return jsonify(error='Invalid description'), 400
        fields['description'] = data['description'].strip()[:280]
    if 'visibility' in data:
        if data['visibility'] not in ('public', 'private'):
            return jsonify(error='Invalid visibility'), 400
        fields['visibility'] = data['visibility']
    repos.update(rid, fields)                     # owner_id, members, stars can't be set here
    return jsonify(repo_json(repos.find_by_id(rid)))

def repo_json(r):
    return {'id': r['id'], 'name': r['name'], 'description': r.get('description', ''), 'visibility': r['visibility']}
```

Docs: [`Request.get_json`](https://flask.palletsprojects.com/en/stable/api/#flask.Request.get_json)

**Mitigated — a schema that forbids extra fields**

```python
class ProfileIn(BaseModel):
    model_config = ConfigDict(extra='forbid')
    full_name: constr(max_length=64) = ''
    bio: constr(max_length=280) = ''

data = ProfileIn.model_validate(request.get_json(silent=True) or {})
```

Docs: [pydantic `extra='forbid'`](https://docs.pydantic.dev/latest/api/config/#pydantic.config.ConfigDict.extra)

**Bypasses to check**

- `**request.json` or `**request.form` passed to a model constructor or to `$set`.
- Dotted keys in MongoDB updates (`{"profile.role": "admin"}`) and operators (`{"$set": …}`) that come from the client.
- Projections that exclude only `password_hash`, leaving new sensitive fields exposed as the schema grows.
- Admin-only fields accepted on a sibling route, for example a create route that takes `role` while the update route ignores it.

**What to grep for**

- `request.json`, `request.get_json(`, `request.form.to_dict(`, `**request.`
- `$set`, `update_one(`, `insert_one(`, `jsonify(`, `serialize(`, `password_hash`
