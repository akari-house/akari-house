# AKARI House

AKARI House is a curated Web3 relationship and GTM network for founders, creators, and investors. This repository uses dedicated GitHub and Cloudflare resources, storage, secrets, and deployment workflows.

## Foundation scope

This release contains the Inari Arrival, spatial Hall and rooms, Common Table demonstration, Blossom Journey, Archive structure, Membership Desk, authentication foundation, multi-role accounts, personal profiles, server-enforced visibility, an authenticated dashboard shell, and local Cloudflare D1/R2 bindings. Messaging, campaigns, articles, events, social synchronization, notifications, and AI matching are intentionally deferred.

## Local development

Requirements: Node.js 22.22 or newer.

```bash
npm install
npm run db:migrate:local
npm run dev
```

Copy `.dev.vars.example` to `.dev.vars` only when local secrets are required. Never commit `.dev.vars`.

## Quality checks

```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
```

## Cloudflare provisioning

`wrangler.jsonc` declares the `DB` D1 binding and `MEDIA` R2 binding without production resource IDs. Create dedicated AKARI resources in the AKARI Cloudflare account during the separate provisioning step, then let Cloudflare associate those resources with this Worker.

## Production

The dedicated AKARI Worker is available at
[`akari-house.spacematesxyz.workers.dev`](https://akari-house.spacematesxyz.workers.dev/).
Production deployments use only the AKARI Cloudflare account, D1 database, R2
bucket, Worker name, and GitHub repository. Apply reviewed D1 migrations before
deploying application code that depends on them.
