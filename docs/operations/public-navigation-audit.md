# AKARI House public navigation audit

## Purpose

Every destination exposed in the public header or footer must render a valid AKARI House page in production. A newly released feature must not return HTTP 500 when its database migration and Worker deployment arrive at different times.

This runbook and the automated route list must be updated whenever a public menu destination is added, renamed or removed.

## Public destinations

The production gate checks these routes for HTTP 200 and the AKARI application shell:

- `/`
- `/projects`
- `/deals`
- `/campaigns`
- `/events`
- `/archive`
- `/membership`
- `/community-guidelines`
- `/contact`
- `/privacy`
- `/terms`
- `/login`
- `/register`

## Protected destinations

Signed-in and administrative destinations must redirect unauthenticated visitors to `/login`. The audit covers the dashboard, member directory, connections, notifications, account settings, Telegram settings, Investor preferences and protected administrative rooms.

## Schema activation safety

The Deals catalogue probes for its opportunity schema before selecting opportunity data. When those tables are not available yet:

1. `/deals` remains available and shows approved public project profiles.
2. Confidential Investor data is not queried or exposed.
3. Deal-detail URLs redirect to the corresponding approved public project when possible.
4. Write actions return a clear temporary-service response rather than a generic server error.
5. The full permissioned Deals Room resumes automatically when the schema is present.

## Release gate

Before merge or production promotion:

- type checking, linting and formatting pass
- unit and integration tests pass
- the production build succeeds
- the complete browser suite passes
- the launch-gate preview succeeds
- the production public audit confirms every menu destination
- test fixture routes return HTTP 404 publicly
- protected routes retain authentication enforcement
