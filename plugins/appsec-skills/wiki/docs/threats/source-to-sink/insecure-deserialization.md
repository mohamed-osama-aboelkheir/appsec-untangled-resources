# Insecure deserialization

## When is it relevant

A new or changed code path that turns bytes from outside the process back into objects with a format that can name its own types. Examples:
- Python `pickle`, `yaml.load`, `jsonpickle`;
- Java `ObjectInputStream`, XStream, Jackson with default typing, SnakeYAML;
- .NET `BinaryFormatter`, Json.NET with `TypeNameHandling`;
- PHP `unserialize` and `phar://`;
- Ruby `Marshal.load` and `YAML.unsafe_load`;
- Node `node-serialize`, or `js-yaml` 3 with `load`.

The bytes can come from a request body, a cookie, a hidden form field, a file upload, a cache (Redis, memcached), a message queue, or a database column another component writes.

## Attack

The attacker sends a serialized object instead of data. While it is being decoded, the library creates objects and calls their methods: constructors, `__reduce__`, `readObject`, `__wakeup` or `__destruct`, setters. Gadget chains in the app's own dependencies turn those calls into code execution, file writes or SSRF. Public tools build the payload for you: ysoserial for Java, ysoserial.net for .NET and PHPGGC for PHP. Even a format with no gadgets can be abused to set fields the code trusts, or to exhaust memory. Signing the data stops it only while the key stays secret.

## Mitigation

- Don't deserialize untrusted data with a format that carries types. Use JSON or protobuf into explicit data classes, and validate the result.
- If a native format is unavoidable:
  - Sign the data with an HMAC and verify the signature **before** decoding, with a key the client never sees.
  - Restrict the classes that may be decoded with an allowlist: Java `ObjectInputFilter`, a Python `Unpickler.find_class` override, PHP `allowed_classes`.
- Use the safe loader of each library: `yaml.safe_load`, `YAML.safe_load`, SnakeYAML `SafeConstructor`, Jackson without default typing, Json.NET `TypeNameHandling.None`.
- Treat caches, queues and shared databases as untrusted unless only your service can write to them.
- Keep gadget-rich libraries up to date. Watch for deserialization advisories in commons-collections, Jackson, XStream, Json.NET and Psych.

## Test

- **Point-in-time:** find every decode call and trace where its bytes come from. For each one reachable from outside, send a harmless gadget payload built for the stack's libraries, such as a DNS lookup or a sleep, and check that it's refused before any object is created.
- **Continuous:** a SAST rule for the dangerous decode calls. Add a unit test that the class allowlist or the signature check rejects an unexpected type or a tampered blob.

## Examples

=== "Node.js (JS)"

    --8<-- "examples/insecure-deserialization/node.md"

=== "Python (Py)"

    --8<-- "examples/insecure-deserialization/python.md"

=== "Java (Java)"

    --8<-- "examples/insecure-deserialization/java.md"

=== ".NET (.NET)"

    --8<-- "examples/insecure-deserialization/dotnet.md"

=== "PHP (PHP)"

    --8<-- "examples/insecure-deserialization/php.md"

=== "Ruby (Ruby)"

    --8<-- "examples/insecure-deserialization/ruby.md"

=== "Go (Go)"

    --8<-- "examples/insecure-deserialization/go.md"

## Resources

- [OWASP Deserialization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Deserialization_Cheat_Sheet.html)
- [PortSwigger: Insecure deserialization](https://portswigger.net/web-security/deserialization)
- [CWE-502: Deserialization of Untrusted Data](https://cwe.mitre.org/data/definitions/502.html)
