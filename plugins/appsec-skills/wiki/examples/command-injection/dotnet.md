**Mitigation options**

| Option | When it fits | Docs |
|---|---|---|
| Use a library instead of a process | Best option: git, archives and images have .NET libraries | [LibGit2Sharp](https://github.com/libgit2/libgit2sharp), [`System.IO.Compression`](https://learn.microsoft.com/en-us/dotnet/api/system.io.compression) |
| `ProcessStartInfo.ArgumentList` with `UseShellExecute = false` | You must run a program; stops shell injection only | [`ArgumentList`](https://learn.microsoft.com/en-us/dotnet/api/system.diagnostics.processstartinfo.argumentlist) |
| Allowlist pattern that can't start with `-` | Every input that becomes an argument | [`Regex`](https://learn.microsoft.com/en-us/dotnet/api/system.text.regularexpressions.regex) |
| `--` / `--end-of-options` before input | The tool honours the end-of-options marker | [gitcli](https://git-scm.com/docs/gitcli) |

**Vulnerable — a shell built from input**

```csharp
Process.Start("/bin/sh", $"-c \"ffmpeg -i uploads/{fileName} out.mp4\"");   // fileName = "x; id"
```

**Vulnerable — `Arguments` string built from input**

```csharp
var psi = new ProcessStartInfo("git", $"log {reference}") { UseShellExecute = false };
Process.Start(psi);
```

`Arguments` is one string that is split into arguments, so spaces and quotes in
the input add new arguments, and those can be options.

**Vulnerable — `ArgumentList`, dangerous option**

```csharp
var psi = new ProcessStartInfo("git") { UseShellExecute = false };
psi.ArgumentList.Add("ls-remote");
psi.ArgumentList.Add(repoUrl);          // repoUrl = "--upload-pack=touch /tmp/pwned"
Process.Start(psi);
```

`ArgumentList` quotes each item correctly, so this is the safe pattern for
splitting. git still reads the item as an option.

**Mitigated — validate, end the options, fixed prefix**

```csharp
private static readonly Regex Ref = new(@"^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$", RegexOptions.Compiled);

Process Fetch(string work, string branch)
{
    if (!Ref.IsMatch(branch) || branch.Contains("..")) throw new ArgumentException("invalid branch");
    var psi = new ProcessStartInfo("git") { UseShellExecute = false, RedirectStandardError = true };
    foreach (var a in new[] { "-C", work, "fetch", "--end-of-options", "origin", $"refs/heads/{branch}" })
        psi.ArgumentList.Add(a);
    psi.Environment.Clear();
    psi.Environment["PATH"] = Environment.GetEnvironmentVariable("PATH");
    return Process.Start(psi)!;
}
```

Docs: [`ProcessStartInfo.Environment`](https://learn.microsoft.com/en-us/dotnet/api/system.diagnostics.processstartinfo.environment) · [gitcli](https://git-scm.com/docs/gitcli)

**Mitigated — no process at all**

```csharp
using var repo = new Repository(work);
Commands.Fetch(repo, "origin", new[] { $"refs/heads/{branch}" }, new FetchOptions(), null);
```

Docs: [LibGit2Sharp](https://github.com/libgit2/libgit2sharp/wiki)

**Bypasses to check**

- `UseShellExecute = true`. It is the default on .NET Framework, and on Windows it opens the file with its associated program.
- `.bat` and `.cmd` targets on Windows run through `cmd.exe`, even with `ArgumentList` (the BatBadBut class of bugs).
- **Check then change:** the value is validated, then trimmed or decoded, or read back later without the same check.
- Wrappers such as CliWrap, where `.WithArguments(string)` splits a string but `.WithArguments(string[])` doesn't. Check which overload is used.

**What to grep for**

- `Process.Start(`, `ProcessStartInfo`, `.Arguments =`, `ArgumentList`, `UseShellExecute`
- `"/bin/sh"`, `"cmd.exe"`, `"/c"`, `Cli.Wrap(`, `.WithArguments(`
- `"git"`, `"--"`, `"--end-of-options"`
