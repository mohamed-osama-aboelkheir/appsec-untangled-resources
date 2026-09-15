# SQL injection

## When is it relevant

A new or changed code path that builds a SQL query from input: request data, files, messages, or data another user stored. This includes raw queries, query-builder `raw` or `whereRaw` fragments, sort columns or directions, and ORM methods that accept SQL strings.

## Attack

The input changes the structure of the query instead of being treated as a value. That lets the attacker bypass filters, read other tables with `UNION`, change data, or sometimes run commands. Identifiers such as column names and sort order can't be parameterized, so they're often missed.

## Mitigation

- Pass values as parameters or bindings, never by concatenating strings, including inside raw fragments.
- Allowlist identifiers: sort columns, directions and table names.
- Connect with a least-privilege database user.

## Examples

=== "node-postgres (JS)"

    --8<-- "examples/sql-injection/pg.md"

=== "Knex (JS)"

    --8<-- "examples/sql-injection/knex.md"

=== "Prisma (JS)"

    --8<-- "examples/sql-injection/prisma.md"

## Resources

- [OWASP SQL Injection Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html)
- [OWASP Injection Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Injection_Prevention_Cheat_Sheet.html)
- [PortSwigger: SQL injection](https://portswigger.net/web-security/sql-injection)
- [CWE-89: SQL Injection](https://cwe.mitre.org/data/definitions/89.html)
