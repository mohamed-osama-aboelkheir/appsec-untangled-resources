# Windows

A window is a hidden entry point. It isn't on the user's path, so it doesn't
show up in the stories, but someone can still get in through it. Windows are
found by **de-abstracting** every box in the architecture diagram: a box called
"API" is really a container image, a task role, a deploy pipeline and a shell
you can exec into.

For each box, ask:

1. **What is it really?** The service, the runtime, the code and the packages
   inside it.
2. **Who else can reach it?** Other services, other AWS principals, admins,
   third parties, anyone on the internet.
3. **Who else can write to it or read from it?** Queues, buckets, databases and
   logs usually have more writers and readers than the diagram shows.
4. **What credentials live in it or near it?** Roles, keys, tokens, secrets in
   environment variables, the metadata endpoint.

The checklists below cover the usual component types. Each window gets the same
bucket 1 questions as a door, but the "caller" is often a cloud principal, a
pipeline or a third party rather than a user.

## Compute: containers, serverless functions, VMs

- **Credentials**: the task or execution role, reachable from inside through
  the metadata endpoint (`169.254.169.254`, `169.254.170.2`) or environment
  variables; secrets passed as environment variables.
- **Code**: the image registry or deployment package; who can push or update
  it; base images, layers and dependencies from third parties.
- **Access paths**: exec or SSH into the running unit (ECS Exec, `kubectl exec`,
  SSM); direct network reach that bypasses the load balancer or WAF; who can
  invoke a function directly.
- **Data**: temporary disk, logs, crash dumps.
- Typical threats: a principal with exec rights gets a shell with the role's
  credentials; a principal with push rights deploys their own code; SSRF or a
  file read in the app reaches the role's credentials.

## Queues, topics and event buses

- **Who else can send**: anyone with `SendMessage` or `Publish` rights can
  create work the consumer trusts. A forged "order paid" message is a free
  ticket.
- **Who else can read**: dead-letter queues keep personal data for days;
  redrive replays messages.
- Typical mitigations: a resource policy that allows only the producer's role;
  a consumer that re-checks state in the database or verifies a signed message;
  idempotent processing.

## Object storage: buckets and file shares

- **Public or not**: block public access, bucket policy, access points,
  CloudFront origin access.
- **Who can write**: anyone who can write to a website bucket serves JavaScript
  to every user.
- **Who can read or list**: predictable keys, `ListBucket`, presigned URLs
  (bearer credentials that get forwarded and logged).
- Typical mitigations: least-privilege policy per role, no listing, short-lived
  presigned URLs created only after an authorization check, versioning.

## Databases and caches

- Network reach (security groups, public endpoints), database users and how
  their credentials are stored and rotated, other services that share the
  database, snapshots and backups that can be shared or restored elsewhere,
  admin consoles.
- Typical mitigations: private subnets, a security group per caller,
  least-privilege database users, encrypted snapshots that can't be made public.

## Identity provider: Cognito, Auth0, Entra ID, Okta, Keycloak

- Self sign-up, **user-writable attributes** (a user setting their own
  `custom:role`), how groups and roles are assigned, app clients and their
  callback URLs, which tokens the API accepts (issuer, audience, token type),
  hooks and triggers.
- Typical mitigations: roles only from admin-assigned groups, never from
  attributes users can write; full token verification; exact callback URLs.

## DNS, CDN, load balancer and WAF

- Who can change DNS records or the registrar account; dangling records that
  allow subdomain takeover; CDN origins and behaviours; response headers such
  as CSP; load balancer rules and health-check paths; access logs that store
  query strings.

## Secrets and keys

- Where each secret lives (secret manager, environment, repository, CI
  variables), who can read it, how it's rotated, and what it can do if leaked.
  Signing keys (QR codes, unsubscribe links, webhooks) are windows of their own.

## SaaS and OAuth integrations

**SaaS integrations are windows and must be in scope.** De-abstract each SaaS
tool you use (CRM, support desk, chat, payments, email) and list every
connected app holding an OAuth token or API key into it.

- What each token can do (scopes), where the third party stores it, IP
  restrictions, which data in the SaaS is sensitive (secrets pasted into support
  cases), alerts on bulk exports.
- Your own model can't stop the third party being breached. It can limit the
  blast radius: narrow scopes, IP allowlists, no secrets in the SaaS, alerts on
  bulk exports, a way to revoke tokens fast.
- The same applies to the payment provider's dashboard users, API keys and
  webhook signing secrets.

## Code repository, CI/CD and infrastructure as code

- Who can merge and deploy, branch protection, the roles the pipeline assumes
  (OIDC trust conditions), third-party actions and plugins, secrets in CI
  variables, infrastructure state files (Terraform state holds secrets).
- Deploy rights are every other window at once.

## Admin tools and internal UIs

- Admin pages served from the public app or bundle, support impersonation,
  feature-flag consoles, internal dashboards, database GUIs.
- Typical mitigations: a separate origin behind SSO and MFA, function-level
  authorization on every admin route, audit logs.

## Exported files and reports

- CSV exports, PDFs, backups and reports leave the system. Who else gets the
  file, where it's stored, whether a downstream tool trusts it (a door list
  imported from a spreadsheet).

## Email, SMS and notification providers

- Who can send as your domain (`ses:SendEmail`, provider API keys), SPF, DKIM
  and DMARC, bounce and complaint handling, sending limits.

## Schedulers and scheduled jobs

- Who can create or edit schedules that target your functions, what the job
  trusts in its input, which role it runs as.

## Mobile and desktop apps, devices

- The shipped binary (embedded secrets, API keys), tokens stored on the device,
  offline caches with personal data, lost or shared devices.

## Logs and monitoring

- Who can read logs, and what's in them: personal data, tokens, presigned
  URLs, QR payloads. Who can delete or change them (repudiation).
