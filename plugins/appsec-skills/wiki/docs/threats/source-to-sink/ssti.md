# Server-side template injection (SSTI)

## When is it relevant

A new or changed code path where user-controlled text becomes part of a template's source, not just its data. Examples:
- compiling templates from strings with EJS, Pug, Handlebars, Nunjucks or Lodash `_.template`;
- email or notification templates that users can edit;
- expression engines.

It also applies when request objects are passed whole as render options.

## Attack

Template syntax in the input runs on the server. In EJS, for example, `<%= process.mainModule.require('child_process').execSync('id') %>` runs a shell command. That can expose secrets and environment variables or give full remote code execution. Passing `req.query` or `req.body` straight into `res.render` can also inject engine options.

## Mitigation

- Load templates from files or constants, and pass user input only as data.
- If users must author templates, use a logic-less engine (Mustache, or Handlebars without custom helpers) and render them in a sandbox.
- Pass render functions only the fields they need, never whole request objects.

## Examples

=== "EJS (JS)"

    --8<-- "examples/ssti/ejs.md"

## Resources

- [OWASP Injection Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Injection_Prevention_Cheat_Sheet.html)
- [PortSwigger: Server-side template injection](https://portswigger.net/web-security/server-side-template-injection)
- [CWE-1336: Improper Neutralization of Special Elements Used in a Template Engine](https://cwe.mitre.org/data/definitions/1336.html)
