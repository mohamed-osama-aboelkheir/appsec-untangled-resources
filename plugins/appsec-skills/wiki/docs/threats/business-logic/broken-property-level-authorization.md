# Broken property-level authorization (mass assignment and overexposure)

## When is it relevant

A new or changed entry point that creates or updates a record from request body fields, or returns records, where some fields must not be set or seen by that caller. Examples: role, owner, tenant, price, status, verification flags, secrets.

## Attack

The attacker adds fields the UI never sends, such as `"role": "admin"`, `"companyId": "…"` or `"isVerified": true`. The server spreads the body into the database. Or the response serializes the whole record, exposing password hashes, tokens or internal flags.

## Mitigation

- Validate the body against a schema that allowlists writable fields for this caller and rejects unknown keys.
- Set ownership, tenant and privileged fields on the server, never from the body.
- Build responses from an explicit list of fields.

## Examples

=== "Express (JS)"

    --8<-- "examples/broken-property-level-authorization/express.md"

## Resources

- [OWASP Mass Assignment Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Mass_Assignment_Cheat_Sheet.html)
- [OWASP Input Validation Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html)
- [CWE-915: Improperly Controlled Modification of Dynamically-Determined Object Attributes](https://cwe.mitre.org/data/definitions/915.html)
