# Path traversal

## When is it relevant

A new or changed code path that builds a file system path, or an archive entry path, from input. Examples are file downloads and uploads, static serving, template or plugin loading, backups and exports, and extracting zip or tar files.

## Attack

The attacker uses `../` sequences to reach files outside the intended folder. Variants include URL-encoded sequences, absolute paths and backslashes on Windows. They can read configuration, keys and source code, or overwrite files, which can lead to code execution. Archive entries named `../../app.js` do the same during extraction ("zip slip").

## Mitigation

- Don't use input as a path. Map an ID to a stored file name, and generate upload file names on the server.
- If you must use input, resolve it against the base folder and confirm the result stays inside it. Use `fs.realpath` when symlinks are possible.
- Use `res.sendFile(name, { root })`, which rejects paths that escape the root.

## Examples

=== "Node.js (JS)"

    --8<-- "examples/path-traversal/node.md"

## Resources

- [OWASP Input Validation Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html)
- [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
- [PortSwigger: Path traversal](https://portswigger.net/web-security/file-path-traversal)
- [CWE-22: Path Traversal](https://cwe.mitre.org/data/definitions/22.html)
