# R84 operator checklist

This checklist is intentionally procedural. It does not contain production data.

## Before CRM deployment

- [ ] Review CRM R84 migration and API contracts.
- [ ] Confirm production backup export remains enabled before migrations.
- [ ] Confirm no House or CRM records are migrated automatically.

## After CRM R84 deployment

- [ ] Confirm migration 0010 exists in production CRM D1.
- [ ] Confirm `/api/v1/house-nda-status` rejects unauthenticated requests.
- [ ] Create a short-lived CRM API key with `write` scope for reconciliation only.
- [ ] Do not configure the write key in the House runtime.

## House deployment

- [ ] Deploy House with `CRM_NDA_BRIDGE_MODE=legacy`.
- [ ] Confirm existing diligence flows behave unchanged.
- [ ] Confirm no CRM request occurs in legacy mode.

## Read-only inventory

- [ ] Back up both D1 databases.
- [ ] Run `docs/r84-house-legacy-crm-inventory.sql` against House.
- [ ] Run CRM `docs/house-crm-reconciliation-inventory.sql` against the AKARI tenant.
- [ ] Store results in the private operational record, not GitHub.

## Explicit mapping

For every legacy NDA that matters to current access:

- [ ] Confirm the House project and canonical CRM project are the same real project.
- [ ] Create explicit House project → CRM project mapping.
- [ ] Confirm the House Investor identity.
- [ ] Link to a CRM contact when one exists.
- [ ] Confirm/create the canonical CRM NDA record from source evidence.
- [ ] Bind the CRM NDA agreement to the stable House member id.
- [ ] Link the legacy House agreement id to the CRM agreement id when applicable.

Never map by name alone.

## Shadow period

- [ ] Revoke the reconciliation write key when mapping is finished.
- [ ] Create a dedicated CRM API key with read-only scope.
- [ ] Store it as House Worker secret `CRM_API_KEY`.
- [ ] Change `CRM_NDA_BRIDGE_MODE` to `shadow`.
- [ ] Review mismatch logs.
- [ ] Resolve every mismatch involving a currently required NDA.
- [ ] Re-run count/coverage inventory.

## CRM cutover

- [ ] Confirm shadow comparisons are clean.
- [ ] Confirm CRM endpoint availability and tenant scope.
- [ ] Change `CRM_NDA_BRIDGE_MODE` to `crm`.
- [ ] Run Investor diligence tests in production.
- [ ] Confirm CRM failure denies NDA-gated Q&A rather than granting access.

## Legacy cleanup — separate release only

- [ ] Code search proves no active House runtime read of legacy CRM tables.
- [ ] Final House D1 backup is exported and checksum recorded.
- [ ] Reconciliation report/counts are approved privately.
- [ ] Dedicated destructive migration is reviewed.
- [ ] Drop legacy CRM-era tables only in that separate release.
- [ ] Run full role/security/diligence production gate.
