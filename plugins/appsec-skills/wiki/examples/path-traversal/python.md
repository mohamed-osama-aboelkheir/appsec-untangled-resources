**Mitigation options**

| Option | When it fits | Docs |
|---|---|---|
| Look the file up by ID | Best option: the filesystem path never comes from input | [PyMongo](https://pymongo.readthedocs.io/), [SQLAlchemy](https://docs.sqlalchemy.org/) |
| `send_from_directory` / `werkzeug.utils.safe_join` | Serving a file from a fixed folder | [`send_from_directory`](https://flask.palletsprojects.com/en/stable/api/#flask.send_from_directory), [`safe_join`](https://werkzeug.palletsprojects.com/en/stable/utils/#werkzeug.utils.safe_join) |
| `Path.resolve()` + `is_relative_to` | Nested folders you must keep | [`pathlib`](https://docs.python.org/3/library/pathlib.html#pathlib.PurePath.is_relative_to) |
| `secure_filename` for upload names | Keeping a user's file name for display | [`secure_filename`](https://werkzeug.palletsprojects.com/en/stable/utils/#werkzeug.utils.secure_filename) |

**Vulnerable — join with user input**

```python
@app.get('/files/<path:name>')
def download(name):
    return send_file(os.path.join(UPLOAD_DIR, name))   # ../../etc/passwd
```

`os.path.join(UPLOAD_DIR, '/etc/passwd')` also returns `/etc/passwd`: an
absolute second argument throws the first one away.

**Vulnerable — a prefix check without a separator, or before normalising**

```python
target = os.path.abspath(os.path.join(UPLOAD_DIR, name))
if not target.startswith(UPLOAD_DIR):           # /srv/uploads-evil passes
    abort(400)
```

**Vulnerable — archive extraction**

```python
tarfile.open(upload).extractall(dest)           # members named ../../app.py, or links pointing outside
```

**Mitigated — serve from a fixed folder**

```python
@app.get('/files/<path:name>')
def download(name):
    return send_from_directory(UPLOAD_DIR, name)    # uses safe_join; 404 if it escapes
```

Docs: [`send_from_directory`](https://flask.palletsprojects.com/en/stable/api/#flask.send_from_directory)

**Mitigated — resolve and compare**

```python
root = Path(UPLOAD_DIR).resolve()
target = (root / name).resolve()
if not target.is_relative_to(root):
    abort(404)
```

Docs: [`Path.resolve`](https://docs.python.org/3/library/pathlib.html#pathlib.Path.resolve)

**Mitigated — safe extraction**

```python
with tarfile.open(upload) as tar:
    tar.extractall(dest, filter='data')         # Python 3.12+: blocks absolute paths, .., links outside
```

Docs: [tarfile extraction filters](https://docs.python.org/3/library/tarfile.html#tarfile-extraction-filter)

**Bypasses to check**

- `os.path.join` with an absolute second argument, as shown above.
- `secure_filename` used for paths with folders: it flattens them, so `a/b.txt` becomes `a_b.txt`. That's safe, but files can collide.
- Paths that aren't files: git tree paths (`<sha>:<path>`), S3 keys and ZIP entry names have their own traversal rules.
- **Check then change:** the path is validated, then URL-decoded, or has an extension appended before use.
- Symlinks inside the base folder, and case-insensitive filesystems.

**What to grep for**

- `os.path.join(`, `open(`, `send_file(`, `send_from_directory(`, `safe_join(`, `Path(`
- `extractall(`, `extract(`, `shutil.unpack_archive(`, `secure_filename(`
- `<path:`, `request.args.get('file`, `request.files[`
