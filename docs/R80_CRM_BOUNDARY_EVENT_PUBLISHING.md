# R80 — CRM Boundary and Event Publishing

## Purpose

R80 corrects two production-boundary problems discovered after R79:

1. submitted Events were technically publishable but operationally buried inside the Projects & interests review screen, with a mandatory decision note even for approval;
2. AKARI House exposed several complete CRM-style operating modules even though `crm.akarihouse.com` is already the canonical CRM by AKARI application.

The goal is to restore one clear product boundary without deleting data.

## Canonical product boundary

### AKARI House — `akarihouse.com`

AKARI House owns the professional-network product and member-facing collaboration layer:

- membership and role verification
- member profiles and privacy controls
- connections and discovery
- Founder projects and project relationships
- Investor opportunity and diligence workflows that are part of the House network
- Events
- Ambassador / IIO campaigns and creator delivery
- Archive, notifications, moderation and House operations

### CRM by AKARI — `crm.akarihouse.com`

The separate `akari-house/CRMAKARI` application is the canonical operating system for:

- CRM leads, contacts and relationship records
- governed relationship intelligence
- agreement tracking
- operating-rhythm / follow-up operations
- finance, invoices, payments and cost records
- SaaS workspace / tenant administration
- broader revenue operations
- CRM fundraising operations that are not member-facing House diligence

The existing House-to-CRM Creator feed remains an integration boundary. It does not make the House application a second CRM.

## House CRM duplication found

Before R80, the House router registered complete internal routes for:

- `/admin/agreements`
- `/admin/relationships`
- `/admin/relationships/:relationshipId`
- `/admin/operating-rhythm`
- `/admin/finance`
- `/admin/workspaces`
- `/workspaces/:slug`
- `/workspace-invitations/accept`

The House D1 schema also contains CRM-like tables created by earlier releases, including commercial finance, SaaS workspace, agreement and relationship-intelligence structures.

The House Worker was also scheduling `operating_rhythm`, which consumed the relationship, agreement and commercial attention model from the House database. R80 retires that House cron path as part of the separation.

That means the duplication was not only visual. The House could operate a second commercial/CRM data model and run background CRM-style follow-up processing.

## R80 containment decision

R80 removes the duplicate CRM routes from the AKARI House route registry, removes those modules from House admin navigation and stops the House Worker from running the CRM-style operating-rhythm job.

It does **not** drop or rewrite the existing House D1 tables.

This is deliberate. Existing records may need to be reconciled with the production CRM database before destructive cleanup is safe.

The House Admin workspace now links operators directly to `https://crm.akarihouse.com` for CRM-only work.

## Read-only NDA compatibility dependency

One House-specific diligence path still reads historical `agreement_records` to confirm whether an Investor has a signed, unexpired project NDA.

R80 keeps that read-only compatibility dependency because deleting or disconnecting it immediately could remove legitimate diligence access from existing Investors.

Before `agreement_records` can be removed from House, replace this dependency with one of the following reviewed designs:

1. a CRM-to-House synchronization contract that supplies only the minimum signed-NDA provenance needed by the House diligence authorization check; or
2. a dedicated House NDA provenance table owned by the diligence domain and populated through an explicit CRM integration.

Generic agreement creation, negotiation, follow-up and administration remain CRM-only. The compatibility read must not be used to reintroduce an agreement-management UI into AKARI House.

## Data migration rule

Before any duplicate House CRM table is removed:

1. export or count all records in the affected House tables;
2. compare them against the correct AKARI House tenant in CRM by AKARI;
3. identify records that exist only in House;
4. map and migrate unique records through a controlled CRM import/migration procedure;
5. verify tenant isolation and record counts;
6. preserve audit/reference history where required;
7. replace the NDA compatibility read before removing `agreement_records`;
8. obtain an operator backup;
9. only then create a later cleanup migration for deprecated House CRM tables.

R80 therefore freezes duplicate CRM operation first and defers schema destruction.

## Event publishing correction

R79 already allowed Superadmin and `projects`-scoped admins to publish an Event directly from the create/edit flow.

The remaining operational problem was submitted member Events:

- they were nested in `/admin/interests` under Projects & interests;
- the approval form required a 5–500 character decision note before Publish would succeed;
- the event host management UI still described the process as if every admin-created event required review.

R80 adds `/admin/events` as a first-class Event Publishing desk.

### Publish behavior

Authorized admins can:

- see all Events in `submitted` state with their submitted cover, host, summary, date/time and destination information;
- verify the meeting destination when one is supplied;
- publish immediately with **no mandatory note**;
- optionally record a publication note;
- decline only after supplying a 5–500 character reason.

Publishing continues to write:

- `events.status = 'published'`
- `reviewed_by`
- `reviewed_at`
- an `event.reviewed` notification to the host
- an `event.reviewed` audit event

Direct admin-created Events continue to publish from `/events/new` and `/events/:slug/edit` without a second approval step.

## Security boundary

Event publishing remains limited to:

- Superadmin; or
- an AKARI admin with the existing `projects` scope.

Ordinary approved Event hosts continue to submit for review.

No Event publication permission is granted merely because a user is an approved AKARI member.

## What R80 intentionally does not do

R80 does not:

- delete House CRM tables;
- silently copy House data into CRM;
- change the CRM D1 database;
- weaken CRM tenant isolation or Cloudflare Access;
- remove House-specific Founder fundraising-readiness or diligence functionality;
- remove the controlled House-to-CRM Creator feed;
- break historical signed-NDA authorization while its replacement integration is still pending;
- change ordinary Event-host moderation requirements.

## Acceptance criteria

R80 is complete when:

- duplicate CRM-only routes are not registered by AKARI House;
- duplicate CRM-only items no longer appear in House admin navigation;
- the House Worker no longer runs the CRM operating-rhythm job;
- House operators are directed to `crm.akarihouse.com` for CRM-only workflows;
- existing duplicate House D1 records remain intact pending reconciliation;
- the historical NDA compatibility dependency is documented before later schema cleanup;
- Event Publishing is visible as its own admin queue;
- a submitted Event can be published without entering an artificial approval note;
- declining an Event still requires a clear reason;
- direct Superadmin Event creation/edit publishing still works;
- ordinary Event hosts still use the review path;
- tests guard the product boundary against accidental re-introduction.
