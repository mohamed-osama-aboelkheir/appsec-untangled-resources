**Mitigation options**

| Option | When it fits | Docs |
|---|---|---|
| Look the path up by ID | Best option: the filesystem path never comes from input | [Mongoose queries](https://mongoosejs.com/docs/api/query.html) |
| `path.basename` into a fixed directory | Flat directories of user files | [Node `path`](https://nodejs.org/api/path.html) |
| `path.resolve` + prefix check | Nested directories you must preserve | [Node `path`](https://nodejs.org/api/path.html) |
| `res.sendFile` with `root` | Serving a file straight back | [Express API](https://expressjs.com/en/5x/api.html) |

**Vulnerable — join with user input**

```js
router.get('/files/:name', requireAuth, (req, res) => {
  res.sendFile(path.join(UPLOAD_DIR, req.params.name))   // ../../etc/passwd
})
```

**Vulnerable — prefix check without a separator**

```js
const target = path.resolve(UPLOAD_DIR, req.query.name)
if (!target.startsWith(UPLOAD_DIR)) return res.sendStatus(400)
```

`/srv/uploads-evil/secret` starts with `/srv/uploads` and passes.

**Mitigated — look it up by ID**

```js
const file = await File.findOne({ _id: req.params.id, ownerId: req.user.id })
if (!file) return res.sendStatus(404)
res.sendFile(file.storagePath, { root: UPLOAD_DIR })
```

**Mitigated — basename into a fixed directory**

```js
const name = path.basename(req.params.name)          // strips any directory part
if (!/^[\w.-]+$/.test(name)) return res.sendStatus(400)
res.sendFile(name, { root: UPLOAD_DIR })
```

`res.sendFile` with `root` refuses paths that escape the root, so it is doing a
second check for you.

Docs: [`res.sendFile`](https://expressjs.com/en/5x/api.html) · [`path.basename`](https://nodejs.org/api/path.html)

**Mitigated — resolve and compare with a separator**

```js
const root = path.resolve(UPLOAD_DIR) + path.sep
const target = path.resolve(UPLOAD_DIR, req.query.name)
if (!target.startsWith(root)) return res.sendStatus(400)
await fs.promises.readFile(target)
```

Docs: [`path.resolve`](https://nodejs.org/api/path.html)

**Bypasses to check**

- `path.join(dir, input)` where the input is absolute — on POSIX
  `path.join('/srv', '/etc/passwd')` stays inside, but `path.resolve` would not;
  check which one is used and what it receives.
- Encodings decoded after the check: `%2e%2e%2f`, `..%252f`, `..\` on Windows,
  and Express decoding route params for you.
- **Check then change:** the name is validated, then an extension is appended
  or the path is rebuilt — `name + '.pdf'` defeated by a null byte in older
  runtimes, or by a name that already ends in `.pdf/../../`.
- Symlinks inside the upload directory pointing out of it, and archive
  extraction that honours `../` entries in the archive (zip slip).
- Case-insensitive filesystems (macOS, Windows) making an allowlist comparison
  pass unexpectedly.
- Write paths as well as read: upload filename, export destination, log path,
  template name.
- The filename echoed back into a response or a `Content-Disposition` header
  without quoting.

**What to grep for**

- `path.join(`, `path.resolve(`, `__dirname`, `startsWith(`
- `fs.readFile`, `fs.createReadStream`, `res.sendFile(`, `res.download(`
- `req.params`, `req.query`, `file.originalname`, `unzip`, `extract`
