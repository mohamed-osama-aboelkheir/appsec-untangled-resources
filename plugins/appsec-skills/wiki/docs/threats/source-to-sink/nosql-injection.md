# NoSQL injection

## When is it relevant

A new or changed code path that uses request input in a NoSQL query or update: MongoDB filters, `$where`, aggregation pipelines, ORM `where` objects, Elasticsearch or Redis commands. It's most likely when `req.body` or `req.query` values reach the query without a check that they're plain strings or numbers.

## Attack

Express parses `?password[$ne]=x` and JSON bodies into objects. A filter like `{ password: { $ne: null } }` then matches any record, which bypasses login checks. Other variants:

- `$regex` enumerates values one character at a time.
- `$where` or `$function` run JavaScript on the database.
- Update operators such as `$set` change fields the route never meant to touch.

## Mitigation

- Validate input types with a schema, or coerce values to strings before querying.
- Reject keys that start with `$` or contain `.`, for example with Mongoose `sanitizeFilter`.
- Build filters and updates from allowlisted fields. Never pass input to `$where`.

## Examples

=== "Mongoose (JS)"

    --8<-- "examples/nosql-injection/mongoose.md"

## Resources

- [OWASP NoSQL Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/NoSQL_Security_Cheat_Sheet.html)
- [PortSwigger: NoSQL injection](https://portswigger.net/web-security/nosql-injection)
- [CWE-943: Improper Neutralization of Special Elements in Data Query Logic](https://cwe.mitre.org/data/definitions/943.html)
