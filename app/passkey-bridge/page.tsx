export const metadata = {
  title: 'Latch',
  robots: { index: false, follow: false },
};

// Reserved for the browser extension's passkey ceremony bridge — see
// Discussion #32 and docs/passkey-sync-and-recovery-findings.md in
// latch-mobile. Not wired up yet.
export default function PasskeyBridgePage() {
  return null;
}
