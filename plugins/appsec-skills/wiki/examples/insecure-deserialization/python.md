**Mitigation options**

| Option | When it fits | Docs |
|---|---|---|
| JSON into explicit types (`json`, pydantic, dataclasses) | Best option: any data that crosses a trust boundary | [`json`](https://docs.python.org/3/library/json.html), [pydantic](https://docs.pydantic.dev/) |
| `yaml.safe_load` | YAML config or uploads | [PyYAML](https://pyyaml.org/wiki/PyYAMLDocumentation) |
| HMAC-signed blobs (`itsdangerous`, `hmac`) | You must round-trip state through the client | [itsdangerous](https://itsdangerous.palletsprojects.com/) |
| `Unpickler.find_class` allowlist | Legacy pickle you can't remove yet; a mitigation, not a fix | [Restricting globals](https://docs.python.org/3/library/pickle.html#restricting-globals) |

**Vulnerable — pickle from a cookie**

```python
@app.get('/cart')
def cart():
    items = pickle.loads(base64.b64decode(request.cookies['cart']))
    return render_template('cart.html', items=items)
```

`pickle` calls `__reduce__` on the way in, so a client-built object can return
`(os.system, ('id',))` and run it. The
[`pickle` docs](https://docs.python.org/3/library/pickle.html) say it plainly:
never unpickle data you don't trust.

**Vulnerable — the "safe-looking" wrappers**

```python
yaml.load(request.data, Loader=yaml.Loader)        # yaml.Loader / UnsafeLoader build any Python object
jsonpickle.decode(request.data)                   # JSON on the outside, pickle semantics inside
pd.read_pickle(uploaded_file)                     # pandas, joblib, torch.load(…) on model uploads
shelve.open(path)                                 # pickle underneath
```

**Vulnerable — a cache that anyone on the network can write to**

```python
session = pickle.loads(redis.get(f'session:{sid}'))    # unauthenticated Redis = attacker-writable
```

**Mitigated — JSON into a schema**

```python
class CartItem(BaseModel):
    sku: constr(pattern=r'^[A-Z0-9-]{1,32}$')
    qty: conint(ge=1, le=99)

items = TypeAdapter(list[CartItem]).validate_json(request.cookies.get('cart', '[]'))
```

JSON only produces dicts, lists, strings, numbers and booleans, so there is
nothing to call during decoding. pydantic then checks the shape.

Docs: [pydantic `TypeAdapter`](https://docs.pydantic.dev/latest/concepts/type_adapter/)

**Mitigated — sign before you trust it**

```python
s = URLSafeSerializer(app.config['SECRET_KEY'], salt='cart')
items = s.loads(request.cookies['cart'])          # raises BadSignature if tampered; JSON inside
```

`itsdangerous` verifies the HMAC first, and uses JSON, not pickle, by default.

Docs: [itsdangerous `URLSafeSerializer`](https://itsdangerous.palletsprojects.com/en/latest/url_safe/)

**Mitigated — `safe_load` for YAML**

```python
config = yaml.safe_load(uploaded.read())
```

Docs: [PyYAML `safe_load`](https://pyyaml.org/wiki/PyYAMLDocumentation)

**Bypasses to check**

- An HMAC checked **after** `pickle.loads`, or compared with `==` instead of `hmac.compare_digest`.
- A signing key that is hard-coded, shared with another service, or leaked through an error page. The same applies to Flask's `SECRET_KEY` when sessions use a pickle serializer.
- A `find_class` allowlist that permits `builtins`, `os`, `subprocess`, `functools.partial` or any module with a callable that runs code.
- `numpy.load(allow_pickle=True)`, `torch.load` without `weights_only=True`, and `joblib.load` on uploaded model files.
- Data written by another service, such as a worker or a queue, that a user can influence.

**What to grep for**

- `pickle.loads(`, `pickle.load(`, `cPickle`, `_pickle`, `dill.`, `shelve.`, `marshal.loads(`
- `yaml.load(`, `Loader=yaml.Loader`, `UnsafeLoader`, `FullLoader`, `yaml.unsafe_load(`
- `jsonpickle.decode(`, `pd.read_pickle(`, `joblib.load(`, `torch.load(`, `np.load(`, `allow_pickle=True`
