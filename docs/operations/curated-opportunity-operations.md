# AKARI House curated opportunity operations

## Purpose

This runbook governs approved opportunity previews and permissioned private rooms inside AKARI House. It does not replace legal, financial, tax or regulatory advice.

AKARI remains a professional networking, discovery, introduction and collaboration platform. Review and verification are access-control decisions, not endorsements or guarantees.

## Separation of permissions

Capital and collaboration permissions remain separate.

- Investor opportunity access requires approved membership, an active account, the Investor role, verified Investor eligibility and any configured per-opportunity approval.
- Creator campaign participation does not grant access to Investor-only information.
- Founder ownership of one project does not grant access to another Founder’s private information.
- Scoped administrators may act only inside their assigned review scopes.
- Superadmin access must be used only for exceptional operational work and audited reviews.

## Founder submission

1. The Founder maintains the underlying project record.
2. The project must pass AKARI project review before an opportunity can be submitted.
3. The Founder prepares the approved public preview, highlights, risk information, raise metadata and access policy.
4. Saving a draft does not expose it to the catalogue.
5. Submitting sends it to AKARI review.
6. A Founder cannot self-publish the opportunity.
7. Material changes after publication should be reviewed before being represented as current.

## Opportunity review

A project-scoped administrator reviews:

- project status and ownership
- public preview and highlights
- sector, stage and geography
- funding instrument and ranges
- closing timeline
- risk information
- private-room policy
- whether the content is suitable for discovery without exposing confidential facts

The administrator records a decision note and may publish, decline, pause or archive the listing. Every action creates an audit event and Founder notification.

## Investor eligibility

Selecting the Investor role creates a claimed state only.

The member completes preferences, ticket range and an eligibility and experience note. Submission creates a verification-pending state. A verification-scoped administrator reviews the evidence and records:

- evidence category
- decision note
- review period
- verified, restricted or rejected state

Investor profile state and role verification are synchronized at the database layer. Restricted, rejected, suspended or unapproved members cannot enter private rooms.

## Private-room requests

For approved-only rooms:

1. A verified Investor submits an access reason.
2. The Founder or authorized administrator reviews the request.
3. Approval has explicit start and expiry times.
4. Revocation or expiry removes access immediately.
5. URL changes cannot bypass the server decision.
6. Unauthorized responses omit confidential fields rather than returning hidden data.

## Private documents

Founder uploads remain private and unapproved by default.

A project-scoped administrator reviews each document and assigns:

- category
- confidential or restricted class
- approval decision
- decision note

A document appears in a private room only when both conditions are true:

1. the document is approved; and
2. the Investor has an active, unexpired document grant.

Withdrawing document approval revokes every active grant for that document. Private delivery uses R2, no-store responses, MIME-sniffing protection and access logging.

## Investor actions

Verified Investors may:

- save an opportunity
- pass for now
- request private-room access
- register or withdraw non-binding interest
- ask an authorized question
- request a Founder introduction after access approval

These actions do not create a commitment, transaction or guarantee.

## Public community proof

Public totals include only members who are:

- active
- approved
- role verified
- publicly visible

Investor totals additionally require verified Investor eligibility. Private, restricted, rejected, suspended and unverified profiles are excluded. Public avatar responses retain profile-visibility enforcement.

## Incident response

Immediately pause an opportunity and review access logs when:

- confidential information appears in a public response
- an unauthorized document is delivered
- a restricted account retains access
- access persists after expiry or revocation
- a serious legal, fraud or safety concern is reported

Revoke affected grants, preserve audit evidence, record a production finding and follow the incident and recovery runbooks.

## Expansion checklist

Before admitting a controlled Investor cohort:

- production health and deployment audit are current
- public fixture routes return 404
- opportunity catalogue is available
- protected administration routes redirect visitors
- manual Superadmin smoke evidence is current
- one document approval and withdrawal cycle has been tested
- one access request, approval, expiry and revocation cycle has been tested
- public community totals have been sampled for privacy
- no critical or high-severity finding remains open
- provisional legal and risk copy has received final counsel review
