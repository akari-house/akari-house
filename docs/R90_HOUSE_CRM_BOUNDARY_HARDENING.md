# R90 — House / CRM boundary hardening

## Canonical products

**AKARI House — `akarihouse.com`** owns the professional network and member collaboration product: membership, profiles, privacy, connections, Founder projects, Creator campaigns, Investor opportunities and House diligence, Events, Archive, notifications, moderation and House operations.

**CRM by AKARI — `crm.akarihouse.com`** owns commercial CRM operations: leads, contacts, relationship intelligence, follow-up/operating rhythm, generic agreement tracking, finance, invoices/payments, SaaS workspaces/tenant administration and broader revenue operations.

The products may integrate through explicit server-to-server contracts. They are not one user interface, one session or one database authority.

## R90 changes

- remove dead House SaaS workspace invitation email/login compatibility;
- keep `akari_session` host-only so House authentication is not shared across subdomains;
- redirect noncanonical production House browser traffic from the Workers URL and `www` to `https://akarihouse.com` while leaving `/health` available to deployment verification;
- make `CRM_API_URL` and `CRM_NDA_BRIDGE_MODE` explicit in the generated production deployment config;
- add regression tests that fail if CRM-only routes or dead workspace behavior return.

The changed TypeScript sources are formatted with the repository-pinned Prettier version and are validated by the normal CI and launch-gate workflows before merge.

## R84 safety gate

R90 deliberately does **not** drop the frozen CRM-era House tables or automatically switch NDA authority. Production remains in `CRM_NDA_BRIDGE_MODE=legacy` until reconciliation evidence is complete.

Before a later destructive cleanup:

1. back up both House and CRM D1 databases;
2. inventory legacy NDA-dependent records;
3. explicitly map relevant House projects and members to canonical CRM records;
4. configure a dedicated read-only CRM runtime API key;
5. run `shadow` mode and resolve every authorization-affecting mismatch;
6. switch to `crm` mode only when shadow comparisons are clean;
7. verify CRM failure fails closed for NDA-gated diligence;
8. prove no registered House runtime path reads the frozen CRM-era tables;
9. take a final backup and merge table deletion as a separate reviewed release.

No destructive database migration is part of R90.
