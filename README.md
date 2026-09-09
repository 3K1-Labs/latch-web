# latch-web

Hosts `uselatch.app`: the Latch landing page, and the passkey relying-party
proof files every Latch client (mobile, web, extension) depends on.

## `public/.well-known/`

`assetlinks.json` and `apple-app-site-association` are what let Android and
iOS trust this domain for passkeys. They must always return **HTTP 200
directly** (no redirect) as `application/json`, with no auth in front of
them. `scripts/check-well-known.mjs` runs before every build and fails it if
either file is missing or doesn't list the expected app identifiers — see
`CODEOWNERS`.

Content is copied verbatim from the values already live at
`michaelesenwa.me`; do not hand-edit the certificate fingerprints or app IDs
without checking against `latch-mobile`'s
`docs/passkey-sync-and-recovery-findings.md`.

## `/passkey-bridge`

Reserved for the browser extension's passkey ceremony bridge. Not wired up
yet — see Discussion #32 in the org.

## Development

```bash
bun install
bun run dev
```

`bun run build` runs the `.well-known` integrity check first and fails loudly
if it doesn't pass.

## Native waitlist backend

The waitlist API uses Neon Postgres through Drizzle and sends double-opt-in
confirmation email through Resend. The homepage posts signups to the native API,
and the confirmation landing page requires an explicit action before confirming
the subscription.

### Server environment

Configure these values in the local shell or deployment environment. Never
prefix them with `NEXT_PUBLIC_` or commit real values.

```text
DATABASE_URL=postgresql://runtime-user:password@host/database?sslmode=require
DATABASE_MIGRATION_URL=postgresql://migration-user:password@host/database?sslmode=require
RESEND_API_KEY=re_example
WAITLIST_PUBLIC_ORIGIN=https://uselatch.app
WAITLIST_FROM_EMAIL=Latch <updates@uselatch.app>
WAITLIST_REPLY_TO=hello@uselatch.app
WAITLIST_UNSUBSCRIBE_SECRET=generate-at-least-32-random-bytes
WAITLIST_CONSENT_VERSION=road-to-mainnet-v1
```

`WAITLIST_REPLY_TO` is optional. `WAITLIST_PUBLIC_ORIGIN` must use HTTPS except
for `http://localhost` during local development. Generate the unsubscribe
secret with a cryptographically secure tool, for example `openssl rand -base64
32`.

For production deliverability, use the public `https://uselatch.app` origin and
a Resend-verified sender on the same `uselatch.app` domain. A real email sent
from another domain with a localhost confirmation link is useful for functional
testing, but mailbox providers may classify that domain/link mismatch as spam.

Use a pooled, least-privileged Neon connection for `DATABASE_URL`. Keep the
owner or migration connection separate in `DATABASE_MIGRATION_URL` and apply
migrations explicitly rather than during a Next.js build:

```bash
bun run db:generate
bun run db:migrate
```

The checked-in SQL under `drizzle/` is the deployable migration artifact.

### API contract

All three endpoints accept JSON only and limit the request body to 1 KiB:

```text
POST /api/waitlist              { "email": "person@example.com" }
POST /api/waitlist/confirm      { "token": "confirmation-token" }
POST /api/waitlist/unsubscribe  { "token": "signed-unsubscribe-token" }
```

No endpoint mutates subscriber state on `GET`. The future confirmation and
unsubscribe pages must require an explicit user action before calling the
corresponding `POST` endpoint.

Configure a Vercel WAF fixed-window rate limit for `POST /api/waitlist` before
launch. The application independently enforces a 15-minute confirmation resend
cooldown and a maximum of three confirmation attempts per email in a fixed
24-hour window beginning with the first attempt.

Every syntactically valid signup request returns HTTP `202` with the same body,
regardless of subscriber state or an internal database/email-provider failure.
This prevents the public response from becoming an email-enumeration signal. A
provider failure whose delivery result is ambiguous or retryable keeps the
current token reservation and cooldown, so an immediate retry cannot issue a
new token. Deterministic provider rejections release the reservation for a safe
retry, while the fixed-window attempt cap continues to apply.
