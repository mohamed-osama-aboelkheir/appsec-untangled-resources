**Mitigation options**

| Option | When it fits | Docs |
|---|---|---|
| Use a library instead of a process | Best option: archives, images, git have libraries | [`tarfile`](https://docs.python.org/3/library/tarfile.html), [`shutil`](https://docs.python.org/3/library/shutil.html), [Pillow](https://pillow.readthedocs.io/), [pygit2](https://www.pygit2.org/) |
| `subprocess.run([...])` with a list and no `shell=True` | You must run a program; stops shell injection only | [`subprocess`](https://docs.python.org/3/library/subprocess.html#security-considerations) |
| Allowlist pattern that can't start with `-` | Every input that becomes an argument | [`re.fullmatch`](https://docs.python.org/3/library/re.html#re.fullmatch) |
| `--` / `--end-of-options` before input | The tool honours the end-of-options marker | [gitcli](https://git-scm.com/docs/gitcli) |
| `shlex.quote` | Only when a shell string is unavoidable (a remote `ssh` command) | [`shlex.quote`](https://docs.python.org/3/library/shlex.html#shlex.quote) |

**Vulnerable — shell string built from input**

```python
@app.post('/ping')
def ping():
    host = request.form['host']
    out = subprocess.check_output(f'ping -c 1 {host}', shell=True)   # host = "x; id"
    return out
```

`os.system`, `os.popen`, `subprocess.*(…, shell=True)` and `commands.getoutput`
all hand the string to `/bin/sh`.

**Vulnerable — list form, dangerous option (argument injection)**

```python
@app.post('/mirror')
def mirror():
    # no shell, so ";id" does nothing, but url = "--upload-pack=touch /tmp/pwned" runs a program
    subprocess.run(['git', 'ls-remote', request.form['url']], capture_output=True)
```

The list form is the documented safe pattern for shell injection, and it is
still vulnerable here. git reads the value as an option, and `--upload-pack`
names a program for git to run for a local or SSH remote. The value is often
stored first and used later, by a job or by another user's action.

**Vulnerable — one sibling validated, the other not**

```python
def copy_tag(source, target):
    if not TAG.fullmatch(source):
        raise ValueError('invalid source tag')
    # target is only checked for being a non-empty string
    subprocess.run(['git', 'tag', target, source])
```

**Vulnerable — `shlex.split` on input**

```python
subprocess.run(['convert', *shlex.split(request.form['args']), 'out.png'])   # args can add any option
```

**Mitigated — validate, end the options, prefix the ref**

```python
REF = re.compile(r'[A-Za-z0-9][A-Za-z0-9._/-]{0,254}')

def fetch_branch(work, branch):
    if not REF.fullmatch(branch) or '..' in branch:
        raise ValueError('invalid branch')
    return subprocess.run(
        ['git', '-C', work, 'fetch', '--end-of-options', 'origin', f'refs/heads/{branch}'],
        capture_output=True, text=True, timeout=60,
        env={'PATH': os.environ['PATH'], 'HOME': '/nonexistent'},   # not os.environ: keeps SECRET_KEY out
    )
```

- The pattern can't start with `-`.
- `--end-of-options` stops git option parsing.
- The `refs/heads/` prefix means the value can never look like an option.
- Validate again where the value is used, not only where it is stored.

Docs: [`subprocess.run`](https://docs.python.org/3/library/subprocess.html#subprocess.run) · [gitcli](https://git-scm.com/docs/gitcli)

**Mitigated — no process at all**

```python
with tarfile.open('backup.tgz', 'w:gz') as tar:
    tar.add(safe_dir, arcname='.')
```

Docs: [`tarfile`](https://docs.python.org/3/library/tarfile.html)

**Bypasses to check**

- **The list form treated as the whole fix.** Look for every list argument that comes from input and check it can't start with `-`.
- **Check then change:** the value is validated, then `.strip()`ed or URL-decoded, or saved and read back from a database without the same check.
- `shell=True` with a list. On POSIX the first item becomes the shell script, and the other items become the shell's `$0`, `$1` and so on.
- `env=dict(os.environ)` passes `SECRET_KEY`, database URLs and cloud credentials to every child, and so to any injected command.
- Returning `stderr` to the client turns a blind injection into one whose output can be read.
- `GitPython` and similar wrappers that build command lines for you. GitPython's `repo.git.<cmd>(value)` and `clone_from(url)` take options too; see CVE-2022-24439.

**What to grep for**

- `subprocess.`, `shell=True`, `os.system(`, `os.popen(`, `os.exec`, `os.spawn`, `pty.spawn`
- `check_output(`, `Popen(`, `run(`, `shlex.split(`, `shlex.quote(`
- `git.Repo`, `repo.git.`, `clone_from(`, `sh.` (the `sh` package), `plumbum`
- `'git'`, `'tar'`, `'ssh'`, `'rsync'`, `'--'`, `'--end-of-options'`
