**Mitigation options**

| Option | When it fits | Docs |
|---|---|---|
| Use a library or extension instead of a process | Best option: images, archives, mail | [Imagick](https://www.php.net/manual/en/book.imagick.php), [`ZipArchive`](https://www.php.net/manual/en/class.ziparchive.php), [Symfony Mailer](https://symfony.com/doc/current/mailer.html) |
| `proc_open` with an **array** command (PHP 7.4+) or Symfony `Process` with an array | You must run a program; no shell, stops shell injection only | [`proc_open`](https://www.php.net/manual/en/function.proc-open.php), [Symfony Process](https://symfony.com/doc/current/components/process.html) |
| `escapeshellarg` on every value | Only when a shell string is unavoidable | [`escapeshellarg`](https://www.php.net/manual/en/function.escapeshellarg.php) |
| Allowlist pattern that can't start with `-`, and `--` | Every input that becomes an argument | [`preg_match`](https://www.php.net/manual/en/function.preg-match.php) |

**Vulnerable — shell string built from input**

```php
$out = shell_exec("ping -c 1 " . $_GET['host']);    // host = "x; id"
```

`exec`, `system`, `passthru`, `shell_exec`, backticks and `popen` all go
through `/bin/sh`.

**Vulnerable — `escapeshellarg`, dangerous option**

```php
exec('git ls-remote ' . escapeshellarg($_POST['url']));   // url = "--upload-pack=touch /tmp/pwned"
```

`escapeshellarg` wraps the value in single quotes. That stops the shell, but
the quoted string still reaches git as one argument, and git reads it as an
option. `escapeshellcmd` is weaker still, because it leaves spaces alone so
the input can add arguments.

**Vulnerable — `mail()` fifth parameter**

```php
mail($to, $subject, $body, [], '-f' . $_POST['from']);
// from = "x@y.z -OQueueDirectory=/tmp -X/var/www/html/shell.php"
```

The fifth argument is passed to `sendmail` as extra options. `-X` writes a log
file wherever you point it, and that is enough to plant a web shell.

**Mitigated — array command, validate, end the options**

```php
if (!preg_match('~\A[A-Za-z0-9][A-Za-z0-9._/-]{0,254}\z~', $branch) || str_contains($branch, '..')) {
    throw new InvalidArgumentException('invalid branch');
}
$process = new Symfony\Component\Process\Process(
    ['git', '-C', $work, 'fetch', '--end-of-options', 'origin', "refs/heads/$branch"],
    env: ['PATH' => getenv('PATH')],
    timeout: 60,
);
$process->run();
```

Docs: [Symfony Process](https://symfony.com/doc/current/components/process.html) · [gitcli](https://git-scm.com/docs/gitcli)

**Mitigated — no `mail()` options from input**

```php
$email = (new Symfony\Component\Mime\Email())->from('noreply@example.com')->replyTo($validatedFrom)->to($to);
$mailer->send($email);
```

Docs: [Symfony Mailer](https://symfony.com/doc/current/mailer.html)

**Bypasses to check**

- `escapeshellarg` treated as the full fix: it stops the shell, not options.
- `escapeshellcmd` on a whole command line, which still allows extra arguments.
- On Windows, `escapeshellarg` and `proc_open` with `.bat` files had bypasses: CVE-2024-1874 and CVE-2024-5585. Check the PHP version.
- **Check then change:** the value is validated, then `trim`med or `urldecode`d, or read back from the database.
- Laravel's `Process::run("…{$input}")` with a string is a shell command. The array form is not.

**What to grep for**

- `exec(`, `system(`, `passthru(`, `shell_exec(`, backticks, `popen(`, `proc_open(`
- `escapeshellarg(`, `escapeshellcmd(`, `mail(`, `mb_send_mail(`
- `Symfony\Component\Process`, `Process::fromShellCommandline(`, `Process::run(`
