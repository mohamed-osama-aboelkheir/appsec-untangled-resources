# Command injection (including argument injection)

## When is it relevant

A new or changed code path that starts another program or a shell, with any part of the command line coming from input. That covers:
- `exec`, `system`, `popen`, backticks and other shell calls;
- calls that take an argument list, such as `spawn`, `subprocess.run([...])`, `ProcessBuilder`, `Process.Start` and `exec.Command`;
- wrappers around tools like `git`, `ffmpeg`, `ImageMagick`, `tar`, `curl`, `ssh`, `rsync` and `sendmail`.

The input can be a file name, a branch or tag name, a URL, a host name, an email address, or any value stored earlier and used later by a job.

## Attack

There are two forms, and only the first needs a shell.

- **Shell injection.** The command is one string that a shell parses. Metacharacters in the input start a second command: `;`, `|`, `&&`, `$(…)`, backticks, and newlines.
- **Argument (option) injection.** The program gets a proper argument list, so no shell is involved, but a value that starts with `-` is read **as an option** instead of as data. Many tools have options that run a program or write a file:
  - `git fetch --upload-pack=<cmd>` and `git -c core.sshCommand=<cmd>`
  - `tar --checkpoint-action=exec=<cmd>` and `tar --to-command=<cmd>`
  - `ssh -oProxyCommand=<cmd>`, `rsync -e <cmd>` and `zip -TT <cmd>`
  - `find -exec`, `curl -o <path>` and `wget --use-askpass=<cmd>`
  - `sendmail -X <logfile>`, reached through PHP's `mail()` fifth parameter

  The usual "safe" pattern (an argument array, no shell) does **not** stop this.
  - GNU-style parsers also accept options **after** positional arguments, so putting the value last is not enough.
  - Stored values are the common case: a name saved by one request and used later, by a background job or by another user's action.

Either form gives code execution as the application's user, which usually exposes every secret in its environment.

## Mitigation

- Don't start a process when a library or API can do the job: use a git library, an image library or the language's archive module.
- Never build a shell command from input. Pass a fixed program and an argument list, with the shell turned off. That stops shell injection only.
- Stop argument injection on every value that comes from input:
  - Validate it against an allowlist pattern that **cannot start with `-`**, such as a ref name or a numeric ID.
  - Put it after an end-of-options marker that the tool honours: `--`, or `--end-of-options` for git 2.24 and later.
  - Where the syntax allows, put it behind a fixed prefix, such as `refs/heads/<name>` or `./<file>`.
- Validate every argument, not just the first. Check each sibling call: a value that is validated in one place is often passed raw in another.
- Validate values again when they are read back from storage. Don't rely only on the check when they were saved.
- Run the process with a minimal environment, without the app's secrets, as a low-privilege user, with a timeout. Don't return its stderr to the client.

## Test

- **Point-in-time:** for every process call, send shell metacharacters (`;id`, `$(id)`, a newline) and option-shaped values (`--help`, `-o/tmp/x`, and the tool's own dangerous option). Do this for every input, including values stored and used later. Nothing may run, and nothing may change the tool's behaviour.
- **Continuous:** a unit test on each wrapper that passes `-x` and `--foo=bar` and expects a rejection. Add a SAST rule for shell calls with input, and for argument lists built from input with no `--` or validation.

## Examples

=== "Node.js (JS)"

    --8<-- "examples/command-injection/node.md"

=== "Python (Py)"

    --8<-- "examples/command-injection/python.md"

=== "Java (Java)"

    --8<-- "examples/command-injection/java.md"

=== ".NET (.NET)"

    --8<-- "examples/command-injection/dotnet.md"

=== "PHP (PHP)"

    --8<-- "examples/command-injection/php.md"

=== "Ruby (Ruby)"

    --8<-- "examples/command-injection/ruby.md"

=== "Go (Go)"

    --8<-- "examples/command-injection/go.md"

## Resources

- [OWASP OS Command Injection Defense Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/OS_Command_Injection_Defense_Cheat_Sheet.html)
- [PortSwigger: OS command injection](https://portswigger.net/web-security/os-command-injection)
- [Sonar: Argument injection vectors](https://sonarsource.github.io/argument-injection-vectors/), a catalogue of dangerous options per tool
- [GTFOBins](https://gtfobins.github.io/), the options of common binaries that run commands or write files
- [CWE-78: OS Command Injection](https://cwe.mitre.org/data/definitions/78.html)
- [CWE-88: Argument Injection](https://cwe.mitre.org/data/definitions/88.html)
