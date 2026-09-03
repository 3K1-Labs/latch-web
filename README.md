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
