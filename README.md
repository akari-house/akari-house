# AKARI House

AKARI House is a curated Web3 relationship and GTM network for founders, creators, and investors. This repository uses dedicated GitHub and Cloudflare resources, storage, secrets, and deployment workflows.

## Current MVP scope

This release contains the Inari Arrival, spatial Hall and rooms, Blossom Journey, Archive and case studies, Membership Desk, email-verified authentication, reviewed membership, multi-role accounts, personal profiles, server-enforced visibility, private R2 profile photos, member discovery, mutual connections, Founder projects, Creator follows, Investor interest, curated events, notifications, Telegram linking, moderation and administrator review desks, the launch operations command centre, account export and closure controls, controlled Investor diligence, IIO execution, Google Sheets review, campaign ownership and reminders, Creator work-link submission, delivery moderation, settlement, disputes, final reporting, operational resilience records and the commercial launch-gate console.

AI matching, direct messaging, articles and authenticated cross-platform social synchronisation remain outside the current MVP.

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

The production application is available at [`akarihouse.com`](https://akarihouse.com/).

Production deployments use only the AKARI Cloudflare account, D1 database, R2 bucket, Worker name and GitHub repository. Apply reviewed D1 migrations before deploying application code that depends on them.

The checked-in production hostname values are:

```text
APP_URL=https://akarihouse.com
TURNSTILE_HOSTNAME=akarihouse.com
```

`APP_URL` includes the protocol. `TURNSTILE_HOSTNAME` contains only the hostname.

### Release order

1. Confirm the public variables `APP_URL`, `TURNSTILE_SITE_KEY` and `TURNSTILE_HOSTNAME` for the AKARI Worker.
2. Confirm `TURNSTILE_SECRET_KEY`, `RESEND_API_KEY` and `MEMBERSHIP_FROM_EMAIL` through Cloudflare secret management. Never place their values in this repository.
3. Export a remote D1 backup and review pending migrations.
4. Apply remote migrations before deploying code that depends on them.
5. Confirm the intended administrators and scoped permissions.
6. Run a preview smoke test covering registration, email verification, application review, approval, login, profile visibility, password recovery and logout.
7. Deploy the Worker, repeat the smoke test on production, check Workers logs and retain the previous Worker version for rollback.
8. Complete `/admin/launch-gate` with evidence from real production-role journeys before broad commercial launch.

The application intentionally fails closed when production Turnstile configuration is missing. Registration email delivery must also be verified before inviting applicants.

### Scheduled jobs

Cloudflare has two cron triggers with intentionally separated workloads:

- `*/5 * * * *`: campaign reminders and Telegram notification delivery.
- `0 3 * * *`: daily social metrics, account retention and operational resilience maintenance.

Do not run the daily retention and resilience jobs on the five-minute trigger.

### Operational health

`GET /health` verifies the D1 binding, R2 binding and presence of all required production configuration without returning secret values. A ready deployment returns HTTP 200; an incomplete deployment returns HTTP 503. Wrangler also declares the required secret names so future full-backend deployments cannot silently omit them.

Superadmins can use:

- `/admin/operations` for launch queues, production configuration and audit activity.
- `/admin/resilience` for backup, recovery and incident evidence.
- `/admin/campaign-operations` for campaign ownership, escalation and reminder operations.
- `/admin/launch-gate` for the commercial real-role evidence matrix.

The launch-gate console records evidence; it does not replace actually executing the production-role, permission, storage, accessibility and recovery tests.
