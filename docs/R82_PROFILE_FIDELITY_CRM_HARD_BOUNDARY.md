# R82 — Profile fidelity and CRM hard boundary

## Why this correction exists

R81 did not meet the approved profile-card direction. It made the identity card too large and turned it into a dense credit-card/dashboard composition. R80 also removed the visible CRM routes but stopped short of fully removing retired CRM implementation modules and a CRM product panel from AKARI House.

R82 corrects both problems as a product-boundary and design-fidelity release.

## Review lenses

The implementation was re-audited through six disciplines:

1. **Product architecture** — AKARI House must remain the member/network/project/event/campaign product. CRM by AKARI must remain a separate operating product.
2. **Brand and creative direction** — the profile card should feel like a premium AKARI glass identity object, not a generic dashboard or a literal bank card.
3. **UX/UI** — the card must be compact enough to read as a floating identity card, with enough surrounding art/background visible to create the frosted-glass effect.
4. **Front-end engineering** — card dimensions, aspect ratio and responsive behavior need explicit regression guards.
5. **Back-end/data architecture** — duplicate CRM domain code must not remain active in House. Historic data structures must not be destructively removed until their data is reconciled.
6. **QA/release safety** — browser tests must fail if the card grows back into a full-width panel or CRM product UI returns to House.

## Profile-card acceptance criteria

The web preview at `/profile-card` must:

- use the approved 85.6:53.98 landscape proportion;
- remain at or below roughly 680–700px on normal desktop layouts;
- sit inside a larger atmospheric stage so background art remains visible around and through the card;
- use translucent/frosted glass rather than an opaque dashboard panel;
- keep the portrait compact on the left;
- keep name, handle, role and optional short headline as the primary centre content;
- use restrained AKARI pink and blossom-yellow light;
- use the official AKARI logo and flower mark without turning them into dominant decorations;
- keep social links small and integrated;
- avoid metrics bars, verification blocks, large footer strips, fake QR modules and other dashboard-like UI inside the card;
- remain usable without horizontal overflow on mobile.

The configuration form may remain below the card; it must not squeeze the card into a narrow side-by-side editor layout.

## CRM hard boundary

### AKARI House owns

- authentication and membership;
- member profiles and professional identity;
- Founder, Creator and Investor role experience;
- Founder projects and project ownership/claims;
- investor opportunity discovery and House diligence access;
- Events and IIO;
- Creator/Ambassador campaigns;
- moderation, verification and House administration;
- House-specific activation and launch operations.

### CRM by AKARI owns

- leads and pipelines;
- accounts and contacts;
- relationship intelligence;
- agreement management and follow-ups;
- operating rhythm / sales follow-up queues;
- invoices, expenses, cash flow, funding and revenue operations;
- CRM customer workspaces, subscriptions and tenant administration.

R82 removes the retired House implementations for agreement tracking, relationship intelligence, operating rhythm, commercial SaaS/workspace administration and workspace invitations. It also removes the CRM promotional panel/link from the House admin workspace.

## Deliberate technical integration exception

`/api/crm/creators` remains as an authenticated **integration contract**, not a CRM user interface or duplicate CRM implementation. It lets the separate CRM consume Creator data from the House source of truth. Removing or renaming that contract requires a coordinated CRM consumer migration.

## Data-safety exception

R82 does **not** drop legacy D1 tables or rewrite historic migrations. In particular, House diligence still reads legacy signed NDA provenance from `agreement_records`. That is a compatibility dependency, not permission to restore agreement management in House.

Before legacy CRM tables can be removed, a controlled reconciliation must:

1. compare House legacy rows with CRM D1;
2. migrate or verify any authoritative CRM records;
3. replace the House diligence NDA lookup with a minimal CRM-to-House NDA provenance bridge;
4. only then retire the legacy House CRM schema through a separately reviewed migration.

No destructive D1 cleanup is part of R82.

## Regression protections

R82 adds automated checks that:

- retired CRM routes stay 404;
- the House admin UI contains no `crm.akarihouse.com` product link or CRM product panel;
- retired CRM implementation modules do not exist in the House source tree;
- the Creator-feed integration route remains available;
- the profile card stays under the desktop size limit;
- the profile card keeps the approved landscape aspect ratio;
- metrics and footer dashboard elements remain hidden;
- the card keeps a frosted-glass treatment;
- the page does not create horizontal overflow.

## Follow-up after R82

The remaining architecture cleanup is intentionally separate: reconcile legacy CRM data and replace the NDA compatibility read before dropping historic CRM tables. That work must be data-led rather than cosmetic so existing users and diligence access are not broken.
