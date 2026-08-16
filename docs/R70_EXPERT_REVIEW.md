# R70 Expert Review - Agreement Tracking + Legal Reference

## Purpose

R70 gives AKARI operational visibility over agreements without turning AKARI into a legal drafting, storage or signing product.

The operating loop is:

Agreement required -> Lawyer prepares externally -> Agreement sent -> External document link added -> Status tracked -> Signed externally -> CRM updated

## Product boundary

AKARI records metadata only:

- agreement type and title
- counterparty name and optional email
- related Project and/or Campaign
- internal follow-up owner
- lifecycle stage
- external HTTPS document link/reference
- requested, sent, signed, effective and expiry dates
- next follow-up date
- operational note

AKARI does not provide:

- agreement generation
- legal templates
- AI contract drafting
- clause building
- legal review
- e-signatures
- lawyer replacement

The legal document and signature remain with the external lawyer, Drive/document provider or signing provider.

## Legal / governance lens

The system avoids representing an operational status as legal validity. `signed` means AKARI recorded that an agreement was signed externally. It is not an AKARI signature event and does not independently prove enforceability.

There is no contract body, signature image, signer authentication or legal clause data in the R70 schema.

## Privacy and security lens

The R70 desk is Superadmin-only in V1 because agreement metadata can reveal confidential counterparties, commercial relationships, fundraising work and deadlines across multiple AKARI operating areas.

External document references must use HTTPS. AKARI does not proxy or ingest the contract file.

Every create/update operation writes to the existing `audit_logs` system. Records are not hard-deleted through the UI; `terminated` and `not_required` preserve operating history.

## CRM / operations lens

The design answers six operational questions directly:

1. Who has an agreement?
2. Who was it sent to?
3. What stage is it at?
4. Where is the external original?
5. When does it expire?
6. Who inside AKARI owns the follow-up?

Agreement records can optionally attach to an AKARI Project or Ambassador Campaign. A Campaign association is validated against its Project to avoid contradictory CRM links.

Fundraising agreements use the related Project as their internal AKARI reference because the existing curated Investor Opportunity model is Project-keyed. R70 does not create a second fundraising opportunity entity.

## Financial / GTM lens

R70 does not approve spend, calculate fees or create invoices. It can record service, campaign, advisory, partnership and fundraising agreement references that commercial workflows may depend on.

The operational desk highlights:

- due follow-ups
- items awaiting external signature
- signed records
- records expiring in 30 days

This is enough to reduce missed follow-ups and expired mandates without creating another task-management system.

## Engineering lens

- additive migration only: `0116_agreement_tracking.sql`
- single metadata table: `agreement_records`
- existing `users`, `projects`, `ambassador_campaigns`, `admin_users` and `audit_logs` reused
- no document BLOB/R2 storage
- no new admin permission table or scope migration
- same-origin mutation protection
- Superadmin authorization on loader and action
- HTTPS external URL normalization
- relationship validation for Campaign -> Project

## V1 acceptance criteria

R70 is complete when:

- a Superadmin can create an agreement requirement
- a Superadmin can assign an AKARI follow-up owner
- a record can link to a Project and/or Campaign
- stages can move through external legal preparation, sending, negotiation and signed status
- signed status requires an external HTTPS document link
- sent/signed milestone dates are recorded
- follow-up and expiry urgency are visible
- all changes are auditable
- non-Superadmins cannot enter the desk
- AKARI never claims to draft, review or sign the legal agreement
