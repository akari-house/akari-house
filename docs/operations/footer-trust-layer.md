# AKARI House footer trust layer

## Release boundary

This release changes only the shared public footer presentation and its automated tests.

It does not change:

- the Inari homepage journey
- homepage loaders or database queries
- authentication or sessions
- member roles or permissions
- project, campaign, event or settlement workflows
- D1 schema or migrations
- R2 access
- Cloudflare resource bindings

## Information architecture

The footer is organised into:

- AKARI identity
- Network
- Opportunities
- Resources
- Legal
- a separate important-information area

Only routes that already exist in the application are linked.

## Legal and risk wording

The important-information area uses original AKARI language covering:

- AKARI's current role as a professional networking, discovery and collaboration platform
- no investment, financial, legal or tax advice
- no endorsement arising from project review, member verification or access approval
- early-stage and digital-asset risk
- independent due-diligence responsibility
- access restrictions based on membership, verification, eligibility, jurisdiction and approval
- no guarantee of funding, investment, returns, token listings, campaign performance or commercial outcomes
- no custody of investment funds or member assets through the platform

The interface states that this wording remains subject to final legal review.

## Confidential design research

External screenshots and URLs supplied during product research are internal references only. They are not assets, dependencies or public attribution.

Before release, search changed files and public output for confidential reference names, URLs, screenshot filenames and attribution phrases.

## Release checks

The release must pass:

- type checking
- linting
- formatting
- unit and integration tests
- production build
- full Playwright browser and viewport matrix
- no page-level or footer horizontal overflow
- no footer content collision
- all footer destinations resolve or correctly enforce authentication
