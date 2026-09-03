// Fails the build if either passkey proof file is missing, isn't valid
// JSON, or doesn't list the apps it's supposed to. These two files are what
// makes passkey sign-in work for every Latch client — a build that ships
// without them (or with them malformed) silently breaks that for everyone
// on this domain. See docs/passkey-domain-transition.md in latch-mobile.
import { readFileSync } from 'node:fs';

const REQUIRED = [
  {
    path: 'public/.well-known/assetlinks.json',
    check: (json) => {
      const pkgs = json.map((e) => e?.target?.package_name);
      for (const pkg of ['app.getlatch.app', 'qa.getlatch.app']) {
        if (!pkgs.includes(pkg)) throw new Error(`missing android package: ${pkg}`);
      }
    },
  },
  {
    path: 'public/.well-known/apple-app-site-association',
    check: (json) => {
      const apps = json?.webcredentials?.apps ?? [];
      for (const app of ['P5QF5H77W5.co.getlatch.latchapp', 'P5QF5H77W5.qa.getlatch.app']) {
        if (!apps.includes(app)) throw new Error(`missing webcredentials app: ${app}`);
      }
    },
  },
];

let failed = false;
for (const { path, check } of REQUIRED) {
  try {
    const json = JSON.parse(readFileSync(path, 'utf8'));
    check(json);
    console.log(`ok: ${path}`);
  } catch (err) {
    failed = true;
    console.error(`FAILED: ${path} — ${err.message}`);
  }
}

if (failed) {
  console.error(
    '\nOne or both passkey proof files are missing or wrong. This would break ' +
      'passkey sign-in for every existing Latch user. Refusing to build.',
  );
  process.exit(1);
}
