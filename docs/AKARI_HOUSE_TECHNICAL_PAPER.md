# AKARI House — Product and Technical Paper

Version: 1.0  
Updated: 24 July 2026  
Repository: `akari-house/akari-house`  
Production Worker: `akari-house`

## 1. Product purpose

AKARI House is a reviewed professional network for Founders, Creators and
Investors. It combines public storytelling with controlled membership,
project discovery, mutual professional connections, investor interest,
events and managed Initial Interest Offering (IIO) ambassador campaigns.

AKARI is intentionally not a public follower-growth network. Visibility,
contact disclosure, project access and campaign participation are controlled
by server-side permissions.

## 2. Current product capabilities

### Public experience

- Anime-inspired AKARI House landing journey
- Responsive desktop and mobile navigation
- Public project, campaign, event and archive directories
- Case studies
- Membership application
- Privacy Notice, Terms and Community Guidelines
- Protected public contact form

### Identity and membership

- Registration, email verification, login, logout and password reset
- One account with Founder, Creator and Investor roles
- Applicant and approved-member access tiers
- Public, members-only, connections-only and private profile visibility
- Profile editing and private R2 profile photographs
- Social links and self-reported follower counts
- Admin verification and membership review

### Network

- Member discovery
- Connection request, acceptance and mutual-connection rules
- Notifications
- Optional Telegram linking foundation
- Abuse reporting and moderation

### Projects

- Founder-created project profiles
- Admin review before publication
- Project social links and linked or unlinked team members
- Creator follows
- Investor interest with explicit contact-sharing permissions
- Ambassador-campaign proposals
- Lightweight private project-document storage
- VantageKit-only data-room links for sensitive diligence

### Events

- Approved-member event creation controls
- Event invitations and attendance workflow
- Event management and editing

### IIO ambassador campaigns

- Registration, start and end periods
- Posting cadence requirements
- Creator application and selection
- Creator social metrics, XScore and Sorsa score
- Weighted allocation and suggested distribution
- Daily/weekly work-link submissions
- Completion and missed-deliverable calculations
- Moderator review and payment adjustment
- Google Sheets/Drive OAuth and campaign export
- CSV export fallback

### Administration

- Superadmin and scoped admin permissions
- Membership, verification, projects, campaigns and moderation scopes
- Admin assignment
- Project/campaign moderation
- Private contact desk
- Audit logging

## 3. Technology architecture

```text
Browser
  |
  v
Cloudflare Worker (React Router SSR)
  |-- Static assets
  |-- Authentication and authorization
  |-- Server-rendered routes and actions
  |
  +--> Cloudflare D1
  |     Accounts, profiles, projects, campaigns, moderation and audit data
  |
  +--> Cloudflare R2
  |     Profile photos and limited private project documents
  |
  +--> Resend
  |     Transactional account email
  |
  +--> Google OAuth
  |     Sheets and Drive exports for administrators
  |
  +--> Telegram
        Optional notification/linking foundation
```

Frontend and server:

- React 19
- React Router 8 framework mode
- TypeScript
- Vite
- Cloudflare Workers runtime

Quality:

- ESLint
- TypeScript project checking
- Vitest unit and integration tests
- Playwright public-journey tests
- GitHub Actions CI

## 4. Repository structure

```text
app/
  components/       Shared UI and interaction components
  content/          Legal and editorial source content
  lib/              Authentication, permissions, security and domain logic
  routes/           Public, account, project, campaign and admin routes
  styles/           Global AKARI visual system
worker/
  index.ts          Cloudflare Worker entry point
migrations/         Ordered D1 schema migrations
public/             Optimized public assets
tests/              Unit, integration and end-to-end tests
docs/               Product and engineering handoff papers
wrangler.jsonc      AKARI-only Cloudflare configuration
```

## 5. Security model

- Passwords are hashed; raw passwords are never stored.
- Session tokens are random, stored as hashes and delivered with HttpOnly,
  SameSite cookies.
- Mutating actions enforce same-origin requests.
- Turnstile protects registration, recovery and public contact entry points.
- Rate limits protect authentication and high-risk actions.
- SQL uses D1 prepared statements and bound parameters.
- React escapes rendered member content.
- Authorization is checked in every server loader/action; UI hiding is not
  treated as access control.
- Profile visibility and contact disclosure are enforced on the server.
- Admin access is scope-based and all sensitive decisions can be audited.
- Secrets are Cloudflare Worker secrets and are not committed.
- Private R2 objects are served only through authorized Worker routes.

## 6. Data and storage policy

D1 stores structured relational data. R2 is reserved for binary objects.
AKARI currently limits project storage to five documents of at most 5 MB each
and 25 MB total per project. Accepted formats are PDF, DOCX, XLSX and PPTX.
Only the owning approved Founder can upload, download or delete these files.

AKARI recommends VantageKit for confidential or investor-ready data rooms.
Only HTTPS links on `app.vantagekit.com` or `vantagekit.com` are accepted by
the project editor. AKARI does not proxy, copy or index a VantageKit data room.

Founders must not upload private keys, passwords, banking credentials,
identity documents or unredacted sensitive personal data into ordinary AKARI
project storage.

## 7. Core permission rules

- Visitors can read only published public material.
- Applicants can maintain lightweight account/profile information but cannot
  use approved-member capabilities.
- Approved members can use features appropriate to their selected roles.
- Only approved Founders can create and manage projects.
- Creators follow projects before applying to relevant campaign opportunities.
- Investors can express project interest.
- A connection is mutual only after acceptance.
- Contact data is disclosed only through the applicable visibility or explicit
  opportunity permission.
- Projects and campaigns require AKARI review before public release.
- Scoped admins can access only their assigned operational area.
- Superadmins can assign and revoke admin access.

## 8. Deployment

The application deploys only to the separate AKARI Cloudflare account and
resources:

- Worker: `akari-house`
- D1: `akari-house-db`
- R2: `akari-house-media`
- Current development production URL:
  `https://akari-house.spacematesxyz.workers.dev`

Standard release sequence:

```text
format -> lint -> typecheck -> tests -> build
-> D1 remote migrations -> Worker deploy -> smoke test
-> commit -> push
```

Required Worker secrets:

- `TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET_KEY`
- `RESEND_API_KEY`
- `MEMBERSHIP_FROM_EMAIL`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_TOKEN_ENCRYPTION_KEY`

## 9. Custom-domain cutover

Before switching to `akari.club`:

1. Attach `akari.club` or the selected subdomain to the AKARI Worker.
2. Change `APP_URL` in `wrangler.jsonc`.
3. Change `TURNSTILE_HOSTNAME`.
4. Add the production hostname to the Turnstile widget.
5. Add `https://akari.club/integrations/google/callback` to Google OAuth.
6. Keep the workers.dev callback temporarily during transition.
7. Confirm Resend DNS and the final sending identity.
8. Deploy and test registration, verification, recovery and Google export.

## 10. Market-launch blockers

Engineering MVP features are present, but these operational items must be
completed before broad commercial launch:

- Confirm AKARI’s legal entity, jurisdiction and registered/contact address.
- Have qualified counsel approve the final legal documents.
- Establish a monitored privacy/support response process.
- Complete custom-domain cutover.
- Run an end-to-end production test with real Founder, Creator and Investor
  test accounts.
- Test the first IIO campaign with a small invited cohort.
- Define retention periods for accounts, moderation records, campaign records,
  contact messages and R2 objects.
- Document incident response, backups and recovery ownership.
- Add product analytics only after a privacy review and consent decision.

## 11. Recommended next releases

### Release A — launch operations

- Admin dashboard counters and service health panel
- Legal acceptance-version records at registration
- Account export and account-closure workflow
- Contact-message assignment and response history
- R2 document expiry/retention controls
- End-to-end role and campaign tests

### Release B — trusted diligence

- Project-document access grants for explicitly selected investors
- Document versioning and expiry
- Data-room access-request records
- Founder diligence checklist
- Verification provenance and refresh dates

### Release C — campaign operations

- Campaign moderator assignment
- Submission reminders
- Payment status and payout evidence
- Dispute and correction workflow
- Final campaign report

### Release D — optional integrations

- Telegram notifications after explicit linking
- Provider-approved social metric integrations
- Never collect social-account passwords or request unnecessary write access

## 12. Guidance for future ChatGPT/Codex work

Every implementation request should include these constraints:

1. Work only in the `akari-house/akari-house` repository.
2. Never reference or modify Yōkai resources.
3. Preserve server-side visibility and role checks.
4. Do not expose secrets, private contacts, admin emails or R2 object keys.
5. Do not add fake Cloudflare resource IDs.
6. Apply new D1 changes through numbered migrations.
7. Run lint, type checking, tests and production build.
8. Apply the migration before deploying code that depends on it.
9. Smoke-test public routes and sensitive authorization boundaries.
10. Update this technical paper when architecture or permissions change.

## 13. Definition of launch-ready

AKARI is launch-ready when:

- The custom domain is live and all OAuth/Turnstile/email settings match it.
- Registration, verification, login, recovery and logout work in production.
- Applicant, member, role, visibility and admin permissions pass end-to-end
  tests.
- Project, campaign, event, connection and moderation workflows pass.
- Private contacts and project documents cannot be retrieved by unauthorized
  users.
- Legal identity and policy wording are finalized.
- The first controlled campaign completes from registration through final
  distribution.
- Monitoring, backups, incident handling and responsible operators are
  documented.
