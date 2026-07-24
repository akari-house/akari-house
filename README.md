# AKARI House

AKARI House is a curated Web3 relationship and GTM network for founders, creators, and investors. This repository uses dedicated GitHub and Cloudflare resources, storage, secrets, and deployment workflows.

## Current MVP scope

This release contains the Inari Arrival, spatial Hall and rooms, Blossom
Journey, Archive and case studies, Membership Desk, email-verified
authentication, reviewed membership, multi-role accounts, personal profiles,
server-enforced visibility, private R2 profile photos, member discovery,
mutual connections, Founder projects, Creator follows, Investor interest,
curated events, notifications, Telegram linking, moderation and administrator
review desks, the launch operations command centre, IIO execution, Google
Sheets review, scheduled Ambassador campaigns, Creator work-link submission,
delivery moderation and proportional payout guidance. AI matching, direct
messaging, articles and authenticated cross-platform social synchronization
remain outside the current MVP.

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

### Release order

1. Set the public variables `APP_URL`, `TURNSTILE_SITE_KEY`, and
   `TURNSTILE_HOSTNAME` for the AKARI Worker.
2. Add `TURNSTILE_SECRET_KEY`, `RESEND_API_KEY`, and `MEMBERSHIP_FROM_EMAIL`
   with Cloudflare secret management. Never place their values in this
   repository.
3. Export a remote D1 backup and review pending migrations.
4. Apply remote migrations before deploying code that depends on them.
5. Grant the first administrator by inserting the exact, already verified AKARI
   user ID into `admin_users`. Do not seed an email address in a migration.
6. Run a preview smoke test covering registration, email verification,
   application review, approval, login, profile visibility, password recovery,
   and logout.
7. Deploy the Worker, repeat the smoke test on production, check Workers logs,
   and retain the previous Worker version for rollback.

The application intentionally fails closed when production Turnstile
configuration is missing. Registration email delivery must also be verified
before inviting applicants.

### Operational health

`GET /health` verifies the D1 binding, R2 binding, and presence of all required
production configuration without returning secret values. A ready deployment
returns HTTP 200; an incomplete deployment returns HTTP 503. Wrangler also
declares the required secret names so future full-backend deployments cannot
silently omit them.

Superadmins can use `/admin/operations` to review launch queues, production
configuration readiness and the latest audit activity without exposing secret
values.
