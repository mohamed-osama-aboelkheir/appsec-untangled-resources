**Mitigation options**

| Option | When it fits | Docs |
|---|---|---|
| Use a library instead of a process | Best option: git, images, archives | [Rugged](https://github.com/libgit2/rugged), [ruby-vips](https://github.com/libvips/ruby-vips), [rubyzip](https://github.com/rubyzip/rubyzip) |
| `system`/`spawn`/`Open3` with **separate arguments** | You must run a program; no shell, stops shell injection only | [`Kernel#system`](https://docs.ruby-lang.org/en/master/Kernel.html#method-i-system), [`Open3`](https://docs.ruby-lang.org/en/master/Open3.html) |
| Allowlist pattern that can't start with `-`, and `--` | Every input that becomes an argument | [`Regexp`](https://docs.ruby-lang.org/en/master/Regexp.html) |

**Vulnerable — one string, so a shell**

```ruby
system("convert uploads/#{params[:file]} thumbs/out.png")   # file = "a.png; id"
`git log #{params[:ref]}`
```

`system`, backticks, `%x()`, `exec`, `IO.popen` and `Open3.*` with a **single
string** use `/bin/sh` when the string has shell metacharacters.

**Vulnerable — `Kernel#open` with input**

```ruby
open(params[:url]).read    # url = "|id" runs a command
```

**Vulnerable — separate arguments, dangerous option**

```ruby
Open3.capture3('git', 'ls-remote', params[:url])   # url = "--upload-pack=touch /tmp/pwned"
```

Separate arguments skip the shell, but git still reads the value as an option.

**Mitigated — validate, end the options, fixed prefix**

```ruby
REF = /\A[A-Za-z0-9][A-Za-z0-9._\/-]{0,254}\z/

def fetch_branch(work, branch)
  raise ArgumentError, 'invalid branch' unless REF.match?(branch) && !branch.include?('..')
  Open3.capture3({ 'PATH' => ENV.fetch('PATH') }, 'git', '-C', work, 'fetch', '--end-of-options',
                 'origin', "refs/heads/#{branch}", unsetenv_others: true)
end
```

Use `\A` and `\z`, not `^` and `$`. In Ruby `^`/`$` match at line breaks, so
`"main\n--upload-pack=…"` passes a `^…$` check.

Docs: [`Open3.capture3`](https://docs.ruby-lang.org/en/master/Open3.html#method-c-capture3) · [`Process.spawn` options](https://docs.ruby-lang.org/en/master/Process.html#method-c-spawn)

**Mitigated — no process at all**

```ruby
repo = Rugged::Repository.new(work)
repo.fetch('origin', ["refs/heads/#{branch}"])
```

Docs: [Rugged](https://github.com/libgit2/rugged)

**Bypasses to check**

- `^…$` instead of `\A…\z` in the allowlist, as explained above.
- `Kernel#open`, `IO.read`, `IO.readlines` and `URI.open` from open-uri with input that starts with `|`.
- `system(*params[:args])` lets the caller add any arguments, or choose the program.
- **Check then change:** the value is validated, then `strip`ped or decoded, or read back from the database.

**What to grep for**

- `system(`, `exec(`, `spawn(`, `` ` ``, `%x(`, `IO.popen(`, `Open3.`, `Kernel.open(`, `open(`
- `Shellwords.escape`, `.shellescape`, `PTY.spawn`
- `'git'`, `'--'`, `'--end-of-options'`
