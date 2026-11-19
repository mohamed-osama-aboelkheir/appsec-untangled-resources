**Mitigation options**

| Option | When it fits | Docs |
|---|---|---|
| Check the type of every value before it goes into a filter | Always; stops operator objects from JSON bodies | [`isinstance`](https://docs.python.org/3/library/functions.html#isinstance) |
| A schema (pydantic, marshmallow) for the request | APIs with structured bodies | [pydantic](https://docs.pydantic.dev/) |
| `re.escape` and an anchor for `$regex` | Search boxes | [`re.escape`](https://docs.python.org/3/library/re.html#re.escape) |
| Convert IDs with `ObjectId` / `int` | Every ID from a URL or body | [`bson.ObjectId`](https://pymongo.readthedocs.io/en/stable/api/bson/objectid.html) |

Flask's `request.form` and `request.args` only hold strings, so they can't
carry operators. **`request.json` can**, because JSON objects become Python
dicts.

**Vulnerable — a JSON object where a string was expected**

```python
@api.post('/auth/login')
def login():
    data = request.get_json()
    user = db.users.find_one({'username': data['username'], 'password': data['password']})
    # {"username": "admin", "password": {"$ne": ""}} logs in as admin
```

**Vulnerable — a regex from input**

```python
db.repos.find({'name': {'$regex': request.args['q']}})   # q = ".*" lists everything; (a+)+$ is a ReDoS
```

**Vulnerable — `$where` or `$function` with input**

```python
db.items.find({'$where': f"this.owner == '{request.args['owner']}'"})
```

**Mitigated — strings only, password checked after the lookup**

```python
data = request.get_json(silent=True) or {}
username, password = data.get('username'), data.get('password')
if not isinstance(username, str) or not isinstance(password, str):
    return jsonify(error='Invalid credentials'), 401
user = db.users.find_one({'username_lower': username.lower()})
if not user or not bcrypt.checkpw(password.encode(), user['password_hash'].encode()):
    return jsonify(error='Invalid credentials'), 401
```

Docs: [PyMongo `find_one`](https://pymongo.readthedocs.io/en/stable/api/pymongo/collection.html#pymongo.collection.Collection.find_one)

**Mitigated — escaped, anchored search**

```python
q = request.args.get('q', '').strip()[:64]
criteria = {'visibility': 'public'}
if q:
    criteria['name_lower'] = {'$regex': '^' + re.escape(q.lower())}
```

**Mitigated — IDs converted, invalid ones rejected**

```python
def to_object_id(value):
    return ObjectId(value) if isinstance(value, str) and ObjectId.is_valid(value) else None
```

Docs: [`ObjectId.is_valid`](https://pymongo.readthedocs.io/en/stable/api/bson/objectid.html#bson.objectid.ObjectId.is_valid)

**Bypasses to check**

- `str(value)` used as a fix on dicts: it turns `{"$ne": ""}` into the literal text `"{'$ne': ''}"`. That is safe, but it hides missing validation. Prefer an explicit type check.
- Update documents built from input (`{'$set': data}`) where `data` holds `$`-keys or dotted paths.
- Aggregation stages built from input (`$lookup`, `$match` from a query string).
- Lists where a scalar was expected, such as `{"id": ["a", "b"]}` with `$in` logic downstream.

**What to grep for**

- `request.json`, `get_json(`, `find(`, `find_one(`, `update_one(`, `aggregate(`
- `$where`, `$function`, `$regex`, `$expr`, `$ne`, `$gt`, `re.escape(`
- `ObjectId(`, `is_valid(`, `isinstance(`
