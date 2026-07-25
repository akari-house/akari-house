# AKARI House production launch audit

This checklist is the final operational gate before invited pilot members are admitted.

## GitHub production environment

1. Create or review the `production` GitHub environment.
2. Require at least one named reviewer before workflow execution.
3. Add the secret `AKARI_SMOKE_SESSION_COOKIE`.
4. The secret must contain a short-lived production Superadmin `akari_session` cookie.
5. Rotate the secret after every launch review and immediately after team changes.
6. Run **Launch Gate Production** manually and retain its JSON artifact for 90 days.

The workflow never creates production identities and cannot access local fixture routes. It checks that fixture endpoints return `404`, validates `/health`, verifies unauthenticated access boundaries and uses the approved cookie only for `/app` and `/admin/launch-gate`.

## Cloudflare production verification

- `APP_URL=https://akarihouse.com`
- `TURNSTILE_HOSTNAME=akarihouse.com`
- Turnstile site and secret keys belong to the production widget.
- D1 binding points only to `akari-house-db`.
- R2 binding points only to `akari-house-media`.
- Required email, Google OAuth and encryption secrets are present.
- Both cron triggers are active and assigned to the intended Worker.
- Workers observability and source maps are enabled.
- `/health` returns HTTP `200`, `status=ready` and the expected release identifier.

## Data and recovery

1. Export an encrypted D1 backup.
2. Run the isolated recovery drill.
3. Confirm critical table counts and `PRAGMA integrity_check`.
4. Confirm temporary recovery infrastructure is removed.
5. Record the workflow run and evidence inside `/admin/resilience`.
6. Keep a known-good previous Worker version available for rollback.

## Communication and external integrations

- Send a real registration verification email to an internal address.
- Complete one password reset and confirm old sessions stop working.
- Confirm Telegram webhook delivery and a real notification.
- Confirm Google OAuth callback and one reviewed Sheet export.
- Confirm rate limiting and Turnstile rejection from an unapproved hostname.

## Launch-gate review

Import the reviewed preview and production JSON reports into `/admin/launch-gate`. A production approval becomes stale after a newer successful production run or after 30 days. Stale evidence blocks launch readiness until reviewed again.
