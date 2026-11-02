# Doors

A door is an obvious entry point: a place where the system *expects* input from
someone outside it. Doors are found by walking the stories and asking, at every
step, "where does the actor hand us something?"

## Where to look

- **API routes**: every method and path in the router or the OpenAPI spec,
  including admin, internal and health routes that sit on the public listener.
- **UI pages and forms**: URL paths and query parameters the front end reads
  (`?next=`, `?order=`), forms, rich-text editors, file pickers.
- **Sign-in**: sign-up, login, password reset, MFA, OAuth and SSO callbacks
  (`code`, `state`, redirect targets), magic links, invitation links.
- **Webhooks and callbacks**: payment providers, Git hosting, chat apps. They
  are public URLs with no user login.
- **File uploads and imports**: images, CSV and spreadsheet imports,
  "import from URL".
- **Real-time channels**: WebSocket and Socket.IO events, GraphQL operations
  and subscriptions.
- **Things the system hands out that come back**: QR codes, unsubscribe links,
  signed URLs, tokens in emails. Anyone can print a QR code or edit a link.
- **Command-line tools and SDKs** the users run against the API.

## What to write for each door

- **Who is meant to use it**: anonymous, any signed-in user, the owner of the
  resource, a role, a third party such as a payment provider.
- **Input we accept**: path, query, body fields, headers, cookies, files.
- **Action**: what it does in business terms ("refunds an order", "exports the
  attendee list") and how sensitive that is.
- **Authentication**: what proves who the caller is (session cookie, bearer
  token, API key, webhook signature), or nothing.
- **Stories**: where it appears, as `S3 · step 2`.

## Group them

Group routes for the same resource that share the same middleware and the same
rule. Keep apart routes with a different rule: a public read beside owner-only
writes, a route mounted outside the authentication middleware, an admin action
on a user route. See [grouping](index.md#group-them).

## Threats at a door (bucket 1)

Ask the three questions, using the
[business-logic pages](../threats/business-logic/index.md):

- **AuthN**: can it be reached without logging in, or with a token that
  shouldn't work? → [Broken authentication](../threats/business-logic/broken-authentication.md)
- **AuthZ**:
    - Can someone act on a record that isn't theirs by naming its ID? →
      [Object-level](../threats/business-logic/broken-object-level-authorization.md)
    - Can a role call an operation it shouldn't? →
      [Function-level](../threats/business-logic/broken-function-level-authorization.md)
    - Can someone set or read a field they shouldn't? →
      [Property-level](../threats/business-logic/broken-property-level-authorization.md)
    - Can one tenant reach another's data? →
      [Tenant isolation](../threats/business-logic/broken-tenant-isolation.md)
- **What else must hold?** CSRF, prices, quantities, races, replay, limits →
  [CSRF](../threats/business-logic/csrf.md) and
  [What else must hold](business-rules.md).

Every input the door accepts is also a **source** for the holes it reaches.
