# R77 AKARI House V1 Launch Completion

R77 closes the gap between a technically complete AKARI House product and a publicly finished V1. It does not add another product module.

## V1 completion rule

AKARI House may be treated as publicly complete only when the live production evidence supports all four conditions:

1. The House has enough real seed inventory.
2. A balanced real-user pilot has been completed.
3. Required Founder, Creator, Investor and account journeys have passed with recorded evidence.
4. No critical or high-severity pilot finding remains unresolved.

The Superadmin source of truth is `/admin/launch-completion`.

## Seed targets

The launch desk reads canonical production records and expects at least:

- 3 published Founder Projects
- 2 published Investor opportunities
- 1 published Creator campaign
- 2 upcoming published events
- 3 approved Founder members
- 8 approved Creator members
- 3 approved Investor members
- 1 approved multi-role member

No migration creates seed content and no test fixture is allowed to satisfy these counts in production.

## Controlled pilot

The pilot extends the existing `pilot_cohorts` and `pilot_findings` system with real participant and task evidence.

Minimum evidence:

- 10 real approved participants
- 10 participants marked completed by an operator after their work is reviewed
- Founder coverage of at least 3
- Creator coverage of at least 8
- Investor coverage of at least 3
- at least 1 multi-role participant

A multi-role participant may count toward more than one role, but remains one person in the total participant count.

## Required journey evidence

At least one passed result is required for:

- membership, login and session journey
- profile completion and privacy controls
- Founder Project creation and activation
- Creator campaign application and delivery
- Investor Deal discovery and diligence
- password reset, logout and account recovery

Member connections and event participation are also available as pilot tasks and should be exercised when relevant to the cohort.

## Human evidence that remains manual

Automation must not self-certify the following checks:

- real-device authentication on Safari, iOS Safari, Android Chrome and Firefox
- human visual review of representative public, member, role and admin workspaces
- final analytics, CSP and privacy posture verification

These checks are recorded through the existing Production readiness desk.

## Turnstile and mobile authentication

R77 retains server-side Turnstile validation. The client widget now uses Cloudflare's supported responsive sizes: compact on very narrow screens and flexible otherwise. Load, error, expiry and timeout states are announced without providing a bypass.

## Analytics and CSP posture

AKARI keeps its existing narrow Content Security Policy. R77 does not add Cloudflare Insights to the allowlist. The production public audit fails if a Cloudflare browser analytics beacon is injected into the returned document.

## Performance evidence

`Production Performance Evidence` is a manual GitHub Actions workflow that runs three fresh Chromium navigations for each profile:

- mobile: 390 x 844
- desktop: 1440 x 900

The report stores median LCP, CLS, DOMContentLoaded, load time, transfer bytes and resource count. It is synthetic lab evidence and must not be represented as CrUX field data.

R77 also uses `content-visibility` only on below-fold homepage story chapters. The Arrival hero remains fully rendered, eager and high priority.

## Release process

1. Validate the exact R77 PR head with dependency audit, typecheck, lint, formatting, tests, production build and the complete Playwright matrix.
2. Validate the exact head with Launch Gate Preview.
3. Merge only when both are green.
4. Apply additive migration `0124_launch_completion_pilot.sql` through the normal production workflow.
5. Deploy the Worker through the normal GitHub to Cloudflare path.
6. Run authenticated production smoke including `/admin/launch-completion`.
7. Run the public production audit, including the browser-analytics privacy check.
8. Run the production performance evidence workflow and retain its artifact.
9. Use the live launch-completion desk to see which seed and real-human evidence remains outstanding.

A technically green deployment does not fabricate or replace the required human pilot evidence.
