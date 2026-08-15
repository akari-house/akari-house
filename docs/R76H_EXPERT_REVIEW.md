# R76H Expert-Lens Release Review

R76H was evaluated using five specialist lenses. This is an internal product and engineering review framework, not a claim that named external people or firms reviewed AKARI House.

## 1. Product growth and activation

Decision: measure outcomes from operational source-of-truth tables before adding more behavioral tracking.

- Keep R76G shown/clicked events for activation guidance only.
- Derive Founder, Creator and Investor outcomes from Projects, campaign applications/deliveries, opportunity activity, interests, introductions and connections.
- Surface the largest current funnel drop-off rather than optimizing only for clicks.
- Make the R76F Next Action Engine respond to outcome state so users are not repeatedly sent back to discovery after they have already progressed.

## 2. Marketplace and Creator operations

Decision: preserve data-completeness eligibility and avoid audience-size thresholds.

- Creator readiness remains X profile + follower count present + XScore + Sorsa Score.
- A follower count of 0 remains valid.
- External/non-member Creator accounts remain part of campaign outcome reporting when they carry the Creator role.
- Campaign outcomes distinguish applied, shortlisted/accepted, accepted, delivered and approved.
- Base campaign `payout_cents` is an allocation, not proof of payment. R76H therefore labels this stage compensation allocated. Canonical campaign settlement belongs in R69.

## 3. Founder and Investor workflow

Decision: count intent and relationship progression only where AKARI has durable evidence.

Founder outcomes use managed/published Projects, verified Project relationships, active campaign or Investor-opportunity workflows, Creator applications and Investor intent.

Investor outcomes use completed preferences, actual opportunity views, Project interests, introduction requests, accepted Founder connections and progressed interest/introduction states.

R76H does not invent an "active conversation" metric from page views or assumptions.

## 4. Trust, privacy and security

Decision: operational metadata must not become a shadow profile database.

- No email, bio, location or free-form profile content is copied into the SLA tables.
- Review assignment and waiting state are separate from the governed decision records.
- The unified inbox cannot approve/reject Membership, role verification, Project claims or moderation cases directly.
- Review operations require Superadmin authentication and same-origin mutation requests.
- Waiting-on-user time pauses the SLA clock and is preserved when AKARI resumes the item.

## 5. Operations and reliability

Decision: use configurable internal targets and additive schema changes.

Initial internal targets:

- Membership: 48 hours
- Role verification: 72 hours
- Project claim: 72 hours
- Moderation: 24 hours

These are operating defaults, not public promises. Superadmin can change them without a deployment.

Release invariants:

- No destructive migration.
- Existing decision/audit workflows remain authoritative.
- Existing production users, Projects, applications and relationships are preserved.
- R76H must pass typecheck, lint, formatting, unit/integration tests, Chromium/Firefox/WebKit E2E, role/security launch checks, responsive evidence, production migration, authenticated smoke and public audit before the release is considered complete.
