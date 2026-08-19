# R90 — House / CRM boundary hardening

## Purpose

R90 makes the already-established AKARI product boundary mechanically difficult to blur again.

- `akarihouse.com` is the AKARI House professional network and member collaboration product.
- `crm.akarihouse.com` is CRM by AKARI, the separate commercial operating system.

This release removes dead House SaaS-workspace compatibility code, makes production CRM bridge configuration explicit, and adds regression coverage around host, cookie, route and wording boundaries.

R90 is intentionally non-destructive. It does not drop frozen CRM-era House tables until the R84 reconciliation checklist has been completed with production evidence and backups.

## AKARI House owns

- membership, roles and verification
- member profiles, privacy and connections
- Founder projects and project relationships
- Creator campaigns and delivery
- Investor opportunities and House diligence
- Events
- Archive
- notifications, moderation and House operations

## CRM by AKARI owns

- leads, contacts and CRM relationship records
- operating rhythm and follow-up management
- generic agreement tracking
- finance, invoices, payments and cost records
- SaaS workspace and tenant administration
- broader revenue operations

## Hardening rules

1. House must not register CRM-only routes.
2. House session cookies must remain host-only; never set `Domain=.akarihouse.com`.
3. House emails and canonical URLs must point to `https://akarihouse.com`.
4. Browser-facing House UI must not advertise CRM implementation details.
5. CRM integration is server-to-server and limited to explicit bridge contracts.
6. Production deployment must declare CRM bridge variables explicitly rather than relying on stale retained variables.
7. Legacy House CRM tables remain frozen until R84 reconciliation is proven and a separate destructive release is approved.

## R84 dependency

R90 does not switch `CRM_NDA_BRIDGE_MODE` from `legacy` automatically. The safe sequence remains:

1. back up House and CRM D1;
2. inventory legacy NDA records;
3. explicitly map relevant House projects/members to CRM;
4. configure a read-only CRM runtime API key;
5. run `shadow` mode and resolve mismatches;
6. switch to `crm` only when comparisons are clean;
7. verify fail-closed Investor diligence behavior;
8. remove legacy tables only in a later destructive release.

## Acceptance criteria

- dead workspace invitation email/login compatibility is removed from House;
- production generated Wrangler config carries the CRM API URL and bridge mode explicitly;
- House boundary tests fail if CRM-only routes or ambiguous CRM copy return;
- House authentication tests prove the session cookie is host-only;
- CRM public copy identifies itself as CRM by AKARI, not AKARI House;
- public CRM demo copy does not present House as the CRM interface;
- no destructive House D1 cleanup occurs in this release.
