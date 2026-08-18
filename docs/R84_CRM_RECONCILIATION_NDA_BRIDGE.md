# R84 — CRM reconciliation and NDA bridge

## Goal

Remove AKARI House's long-term dependency on the historical CRM-era agreement tables without merging `akarihouse.com` and `crm.akarihouse.com` or changing the original AKARI House product model.

AKARI House remains the professional network and diligence experience. CRM by AKARI remains the canonical commercial CRM and agreement registry.

R84 is deliberately non-destructive. Legacy House tables remain intact until reconciliation evidence proves they are no longer required.

## Current legacy dependency

The historical diligence route used House `agreement_records` to decide whether an Investor had a current signed NDA. That is the final compatibility dependency preventing safe removal of the CRM-era agreement table.

R84 routes the public diligence endpoint through `project-diligence-bridge.tsx` and centralizes the NDA decision in `crm-nda-bridge.server.ts`.

The registered R84 loader no longer calls the historical loader, so CRM mode can operate without executing the old `agreement_records` query. The historical route module remains only as a compatibility source for the existing UI and non-NDA actions until the later destructive-cleanup release.

## Bridge modes

`CRM_NDA_BRIDGE_MODE` supports three modes.

### `legacy` — production default

- House `agreement_records` remains authoritative through the centralized bridge helper.
- CRM is not called.
- Existing Investor access behavior is preserved.
- Safe to deploy before any CRM mappings or runtime API key exist.

### `shadow`

- House legacy state remains authoritative.
- CRM is queried in parallel using the read-only NDA endpoint.
- mismatches are logged for reconciliation.
- a CRM disagreement cannot change Investor authorization.

Use this only after the CRM R84 bridge is deployed and a read-only CRM API key is configured.

### `crm`

- CRM becomes the NDA authority.
- The registered diligence runtime does not execute the legacy agreement query.
- if CRM is unavailable, misconfigured or returns a non-authoritative response, access fails closed.

Do not enable this mode until mapping coverage and shadow comparisons are clean.

## Runtime configuration

Non-secret variables:

- `CRM_API_URL=https://crmakari.pages.dev/api/v1`
- `CRM_NDA_BRIDGE_MODE=legacy`

The Pages origin is used because `crm.akarihouse.com` is intentionally behind Cloudflare Access. The `/api/v1/*` application endpoints still require the CRM's tenant-scoped API key authentication.

Secret required only before `shadow` or `crm` mode:

- `CRM_API_KEY`

The production House runtime key must have **read-only** CRM scope. Do not use the reconciliation write key as the normal runtime credential.

The secret is intentionally not in the required-secret deployment list while mode is `legacy`, so R84 can deploy without creating an unused production credential.

## Diligence route behavior

The existing large diligence route remains intact as a compatibility module so R84 does not unnecessarily rewrite stable UI and unrelated document-management actions.

The registered route now:

1. owns the full diligence loader
2. obtains Investor NDA state only through `crm-nda-bridge.server.ts`
3. owns the `ask-diligence-question` action so the same bridge authority is enforced server-side
4. reuses the existing rendered UI
5. delegates only non-NDA actions to the historical implementation

The non-NDA delegated actions do not execute the historical NDA lookup. This means `crm` mode has no runtime dependency on the legacy agreement query.

## Data minimization

House consumes only:

- signed / not signed
- authoritative marker
- reason
- checked timestamp
- agreement id, status, signed/activated/expiry timestamps when signed

House does not receive or cache:

- signed agreement document URL
- signature evidence
- legal notes
- fees or commercial terms
- CRM relationship history
- CRM contact notes

## Reconciliation sequence

1. Deploy CRM R84 bridge schema/API first.
2. Deploy House R84 in `legacy` mode.
3. Create a short-lived CRM write-scope reconciliation API key.
4. Inventory legacy House CRM-era records and CRM records using non-sensitive counts only.
5. Explicitly map House project ids to CRM project ids.
6. Explicitly map relevant House member ids to CRM contacts where appropriate.
7. Bind canonical CRM NDA agreements to stable House member ids.
8. Revoke the write-scope reconciliation key.
9. Create a separate read-only runtime CRM API key for House.
10. Configure `CRM_API_KEY` in the House Worker.
11. Switch to `shadow` mode and review mismatches.
12. Resolve mapping/data exceptions.
13. Switch to `crm` mode only when shadow results are clean.
14. Confirm there are zero active legacy CRM reads in the registered House runtime.
15. Back up House D1.
16. Remove frozen CRM-era tables and the historical compatibility implementation in a separate destructive release.

## Safety rules

- Never fuzzy-match projects or members by display name.
- Never commit production reconciliation exports or private CRM data to GitHub.
- Never delete House legacy tables in the bridge release.
- Never make the CRM write key a permanent House runtime secret.
- Never let a CRM outage grant access: `crm` mode fails closed.
- Keep destructive table cleanup as a separate release with a final backup and rollback plan.
