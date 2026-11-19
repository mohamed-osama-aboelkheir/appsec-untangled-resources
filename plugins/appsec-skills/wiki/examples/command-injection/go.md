**Mitigation options**

| Option | When it fits | Docs |
|---|---|---|
| Use a library instead of a process | Best option: git, archives, images | [go-git](https://github.com/go-git/go-git), [`archive/tar`](https://pkg.go.dev/archive/tar) |
| `exec.Command(name, args...)` | You must run a program; no shell, stops shell injection only | [`os/exec`](https://pkg.go.dev/os/exec) |
| Allowlist pattern that can't start with `-`, and `--` | Every input that becomes an argument | [`regexp`](https://pkg.go.dev/regexp) |

**Vulnerable — a shell built from input**

```go
out, _ := exec.Command("sh", "-c", "ping -c 1 "+r.FormValue("host")).Output()   // host = "x; id"
```

**Vulnerable — `exec.Command`, dangerous option**

```go
cmd := exec.Command("git", "ls-remote", r.FormValue("url"))   // url = "--upload-pack=touch /tmp/pwned"
cmd.Run()
```

`exec.Command` never uses a shell, which is why Go code is often called
"injection-safe". git still reads the value as an option.

**Vulnerable — arguments split from a string**

```go
args := strings.Fields(r.FormValue("opts"))   // the caller chooses any options
exec.Command("ffmpeg", append([]string{"-i", in}, args...)...).Run()
```

**Mitigated — validate, end the options, fixed prefix**

```go
var refRe = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$`)

func fetchBranch(ctx context.Context, work, branch string) error {
	if !refRe.MatchString(branch) || strings.Contains(branch, "..") {
		return errors.New("invalid branch")
	}
	cmd := exec.CommandContext(ctx, "git", "-C", work, "fetch", "--end-of-options", "origin", "refs/heads/"+branch)
	cmd.Env = []string{"PATH=" + os.Getenv("PATH")}   // nil would inherit every secret
	return cmd.Run()
}
```

Docs: [`exec.CommandContext`](https://pkg.go.dev/os/exec#CommandContext) · [`Cmd.Env`](https://pkg.go.dev/os/exec#Cmd) · [gitcli](https://git-scm.com/docs/gitcli)

**Mitigated — no process at all**

```go
repo, _ := git.PlainOpen(work)
err := repo.Fetch(&git.FetchOptions{RemoteName: "origin",
	RefSpecs: []config.RefSpec{config.RefSpec("refs/heads/" + branch + ":refs/remotes/origin/" + branch)}})
```

Docs: [go-git `FetchOptions`](https://pkg.go.dev/github.com/go-git/go-git/v5#FetchOptions)

**Bypasses to check**

- `exec.Command` treated as the full fix, with no check on values that become arguments.
- `cmd.Env` left `nil`, which passes the whole environment to the child.
- On Windows, before Go 1.19, `exec.Command("prog")` could run `prog.exe` from the current directory. Check the Go version (see the [`os/exec` security note](https://pkg.go.dev/os/exec#hdr-Executables_in_the_current_directory)).
- **Check then change:** the value is validated, then trimmed or decoded, or read back from the database.

**What to grep for**

- `exec.Command(`, `exec.CommandContext(`, `"sh", "-c"`, `"bash", "-c"`, `"cmd", "/C"`
- `syscall.Exec(`, `os.StartProcess(`, `strings.Fields(`, `cmd.Env`
- `"git"`, `"--"`, `"--end-of-options"`
