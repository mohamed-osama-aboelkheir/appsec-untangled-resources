# What else must hold?

AuthN and AuthZ answer "who is calling, and may they touch this resource?".
The third bucket 1 question is everything else the business relies on. These
are the threats scanners never find, because only the design says what
"correct" means.

Ask each question at every door and window where it fits. Each item gives the
question, what usually goes wrong, the mitigation, and a test.

## Money and amounts

- **Question:** does the client send anything the server should decide: price,
  total, discount, currency, fee?
- **Goes wrong:** the server trusts a price or total from the body.
- **Mitigation:** the client sends only IDs and quantities; the server computes
  totals from its own data and builds the payment request itself.
- **Test:** send a modified price and check the charged amount comes from the
  database.

## Quantities and limits

- **Question:** what are the valid ranges? Negative, zero or huge quantities,
  more items than allowed per order, more invites than the plan allows?
- **Mitigation:** validate ranges on the server, including per-user and
  per-plan limits.
- **Test:** unit tests at and beyond each bound.

## State and order of steps

- **Question:** can a step be skipped, repeated or done in the wrong state?
  Paying for an unpublished event, publishing without review, marking an order
  paid because the browser reached the success page.
- **Mitigation:** each action checks the current state on the server; only the
  trusted party moves state forward (a verified webhook, not the browser).
- **Test:** call each step out of order and check it's refused.

## Race conditions

- **Question:** what happens if the same request arrives twice at the same
  moment? Overselling the last seat, using one ticket at two gates, redeeming a
  coupon twice, a balance going negative.
- **Mitigation:** one atomic conditional write (`UPDATE … WHERE remaining >= ?`),
  a unique constraint, or a lock, instead of check-then-act.
- **Test:** a concurrency test with many parallel requests.

## Replay and idempotency

- **Question:** what if a message, webhook or request is delivered again?
- **Mitigation:** an idempotency key or the provider's event ID stored and
  checked; timestamp tolerance on signed messages; unique constraints on what
  it creates.
- **Test:** send the same event twice and check it has one effect.

## Webhooks and callbacks from third parties

- **Question:** how does this endpoint know the request really came from the
  provider, and that it's about the right object and amount?
- **Mitigation:** verify the signature on the raw body with the provider's
  library; look up the object by your own reference and compare amount,
  currency and status.
- **Test:** an unsigned or wrongly signed request returns `400`; a mismatched
  amount is rejected.

## Tokens, codes and links you issue

- **Question:** can someone guess, change or reuse a QR code, invite link,
  unsubscribe link or reset token?
- **Mitigation:** random identifiers plus a signature or MAC bound to what they
  grant; expiry; single use where it matters; constant-time comparison.
- **Test:** a tampered or reused token is rejected.

## Abuse, rate limits and resource exhaustion

- **Question:** what can a bot do with many requests or many free accounts?
  Hold every seat, enumerate emails, brute-force codes, send expensive emails
  or SMS, start costly jobs such as PDF rendering.
- **Mitigation:** rate limits per user, IP and account; reservation expiry;
  quotas on expensive actions; generic error messages.
- **Test:** a load test or WAF rule test; reservations are released.

## Side effects sent in our name

- **Question:** can a user make the system email, message or call someone
  else, with content they control?
- **Mitigation:** recipients limited to people tied to the resource; volume
  limits; content escaped or sanitized.
- **Test:** try to send to an address outside the resource.

## Repudiation

- **Question:** if someone exports data, changes a price or checks a ticket in,
  can we tell who did it, later?
- **Mitigation:** structured audit logs with the user ID and the object,
  retained where the actor can't edit them.
- **Test:** perform the action and find its log entry.

## Data in responses and side channels

- **Question:** do responses, errors, logs or exports reveal more than the
  caller should see? Internal IDs, other users' emails, "this email is
  registered".
- **Mitigation:** explicit response fields; generic errors; redaction in logs.
  See [property-level authorization](../threats/business-logic/broken-property-level-authorization.md).
