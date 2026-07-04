# Orbit home deploy handoff

## Target

- Site: `https://atom.buildwithoracle.com/`
- Source repo: `thebuilderofmoebius9/atom-landing`
- Target branch: `main`
- Desired live commit: `aefde7f` or newer
- Expected home H1: `จักรวาลหลักฐานของอะตอม`

## Proof from Atom machine

- `npm run build` passed.
- Public safety sweep found no real secrets.
- The only `AUTH_KEY=` hits are documented placeholders: `AUTH_KEY=<private-key-from-env>`.
- Wrangler asset upload succeeded for `atom-landing`.
- Direct publish failed because this machine's Cloudflare login could not see the `buildwithoracle.com` zone.

## Required deploy action

Use a Cloudflare account that owns the `buildwithoracle.com` zone, then deploy this worker/assets project with the route:

```text
atom.buildwithoracle.com/*
```

After deploy, verify:

```bash
curl -fsSL https://atom.buildwithoracle.com/ | rg 'จักรวาลหลักฐาน|build '
```

The current stale production page still reports `build f000cb7`; it should change to the Orbit home page.
