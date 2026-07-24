# AKARI Backup, Recovery and Incident Runbook

## Ownership

Assign named primary and backup operators before commercial launch. Every operational action must be recorded in `/admin/resilience` with evidence that does not expose secrets or private member data.

## D1 backup

1. Confirm the production database and account.
2. Export a consistent D1 backup using the approved Cloudflare procedure.
3. Store the encrypted export in the restricted operations location.
4. Record the run as `d1_backup`, including the private evidence reference.
5. Never commit database exports to GitHub.

## D1 restore test

Perform at least monthly and after material schema changes.

1. Provision an isolated non-production D1 database.
2. Restore the latest approved backup.
3. Apply any later migrations in order.
4. Verify row counts for users, projects, campaigns, settlements, diligence grants and audit logs.
5. Run authentication and permission smoke tests against the isolated environment.
6. Destroy the isolated test resources after evidence is retained.
7. Record the result as `d1_restore_test`.

## R2 recovery and retention

- All new private objects should be registered in `managed_r2_objects`.
- Objects on legal or dispute hold must use retention status `hold`.
- Expired objects are soft-deleted before permanent deletion.
- Permanent deletion requires an auditable cleanup run.
- Inventory checks must compare registered object keys with R2 inventory and investigate both missing and orphaned objects.
- Raw R2 object addresses must never be exposed publicly.

## Incident severities

- **SEV1:** Active compromise, widespread private-data exposure or complete production outage.
- **SEV2:** Major feature outage, suspected limited data exposure or failed recovery capability.
- **SEV3:** Degraded service, contained permission problem or repeated job failures.
- **SEV4:** Minor operational defect with no material member impact.

## Incident lifecycle

1. Open an incident immediately in `/admin/resilience`.
2. Assign an owner and establish severity.
3. Preserve logs and evidence.
4. Contain the issue before making non-essential changes.
5. Rotate affected secrets where relevant.
6. Recover service and verify permission boundaries.
7. Notify affected parties when legally or operationally required.
8. Resolve the incident only after production verification.
9. Complete a postmortem for SEV1 and SEV2 incidents.

## Secret rotation

Rotate secrets after suspected exposure, staff access changes and according to the approved schedule. Update Cloudflare secrets without committing values, verify dependent services, invalidate affected sessions when necessary and record a `secret_rotation` run.

## Emergency administrator access

Emergency access must be time-limited, use an individually attributable account and be reviewed after use. Shared permanent superadmin credentials are prohibited.
