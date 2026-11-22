**Mitigation options**

| Option | When it fits | Docs |
|---|---|---|
| Use a library instead of a process | Best option: git, archives and images have Java libraries | [JGit](https://www.eclipse.org/jgit/), [Apache Commons Compress](https://commons.apache.org/proper/commons-compress/) |
| `ProcessBuilder` with a `List<String>` | You must run a program; stops shell injection only | [`ProcessBuilder`](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/ProcessBuilder.html) |
| Allowlist pattern that can't start with `-` | Every input that becomes an argument | [`Pattern`](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/regex/Pattern.html) |
| `--` / `--end-of-options` before input | The tool honours the end-of-options marker | [gitcli](https://git-scm.com/docs/gitcli) |

**Vulnerable — a shell started explicitly**

```java
new ProcessBuilder("sh", "-c", "convert uploads/" + fileName + " thumbs/out.png").start();
// fileName = "a.png; id > /tmp/x"
```

**Vulnerable — `Runtime.exec(String)` with input**

```java
Runtime.getRuntime().exec("git log " + ref);
```

`Runtime.exec(String)` doesn't start a shell. It splits the string on whitespace
with `StringTokenizer`, so `;` and `|` do nothing. But spaces in the input
become **new arguments**, and that is argument injection:
`ref = "--output=/app/static/x.jsp HEAD"` writes a file.

**Vulnerable — list form, dangerous option**

```java
List<String> cmd = List.of("git", "ls-remote", repoUrl);   // repoUrl = "--upload-pack=touch /tmp/pwned"
new ProcessBuilder(cmd).start();
```

No shell and no splitting, and it is still exploitable, because git reads the
value as an option.

**Mitigated — validate, end the options, fixed prefix**

```java
private static final Pattern REF = Pattern.compile("[A-Za-z0-9][A-Za-z0-9._/-]{0,254}");

Process fetch(Path work, String branch) throws IOException {
    if (!REF.matcher(branch).matches() || branch.contains("..")) throw new IllegalArgumentException("invalid branch");
    ProcessBuilder pb = new ProcessBuilder("git", "-C", work.toString(), "fetch",
            "--end-of-options", "origin", "refs/heads/" + branch);
    pb.environment().keySet().retainAll(Set.of("PATH", "HOME"));   // drop the app's secrets
    pb.redirectErrorStream(true);
    return pb.start();
}
```

Docs: [`ProcessBuilder.environment()`](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/ProcessBuilder.html#environment()) · [gitcli](https://git-scm.com/docs/gitcli)

**Mitigated — no process at all**

```java
try (Git git = Git.open(work.toFile())) {
    git.fetch().setRemote("origin").setRefSpecs(new RefSpec("refs/heads/" + branch)).call();
}
```

Docs: [JGit `FetchCommand`](https://download.eclipse.org/jgit/site/latest/apidocs/org/eclipse/jgit/api/FetchCommand.html)

**Bypasses to check**

- `Runtime.exec(String)` treated as safe because there is no shell. Whitespace still creates new arguments.
- On Windows, `ProcessBuilder` joins the arguments into one command line, and the program parses it again. `.bat` and `.cmd` files run through `cmd.exe`, which allows `&` and `|`. See CVE-2024-1874 (PHP) and the BatBadBut issue for the same class.
- **Check then change:** the value is validated, then trimmed, decoded or loaded back from the database.
- Arguments built with `String.split(" ")` from input, and `CommandLine.parse()` (Apache Commons Exec) on input.

**What to grep for**

- `Runtime.getRuntime().exec(`, `new ProcessBuilder(`, `.command(`, `"sh", "-c"`, `"cmd", "/c"`
- `CommandLine.parse(`, `DefaultExecutor`, `zt-exec`, `ProcessExecutor`
- `"git"`, `"tar"`, `"ssh"`, `"--"`, `"--end-of-options"`
