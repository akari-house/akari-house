# R91 — Launch Experience, Performance & Discovery Optimization

## Multidisciplinary review panel

R91 is evaluated collectively through the lens of:

- Principal product and information-architecture lead
- Senior SaaS and professional-network UX architect
- Founder journey advisor
- Creator campaign journey advisor
- Investor and private-opportunity advisor
- AKARI anime/Japanese environment art director
- Design-systems and accessibility specialist
- Frontend and Cloudflare performance engineer
- Technical SEO specialist
- PWA and future app-discovery/ASO-readiness specialist
- Privacy and permissions engineer
- Cross-browser QA lead

This panel is a design and engineering review framework. It does not represent external people being hired or contracted by this repository.

## Product rule

> The public House creates emotion. The signed-in House creates direction. Evidence creates trust.

A member should not need to understand AKARI's full feature map before getting value. The signed-in experience therefore prioritises one active role and three ordered decisions.

## Role-first House Compass

### Founder

1. Keep the project actionable.
2. Find the right Creators.
3. Turn support into a campaign.

### Creator

1. Keep professional and social signals useful.
2. Find a campaign that fits.
3. Build Founder relationships around real work.

### Investor

1. See opportunities first.
2. Tune relevance through preferences.
3. Understand the Founder before an introduction.

Multi-role members keep one identity and choose the role they are using now. Role selection changes the path, not the account.

## R91 implementation boundaries

- Remove repeated signed-in navigation and status layers instead of adding more dashboard features.
- Keep cinematic Arrival, Hall, Archive and Membership language on public discovery surfaces.
- Keep the existing yellow AKARI flower and pink identity.
- Keep `akarihouse.com` separate from `crm.akarihouse.com`.
- Do not add CRM pipeline, lead or relationship-operations UI to AKARI House.
- Preserve existing member records and production D1 data; R91 has no destructive migration.
- Preserve Founder multi-project support.
- Preserve Creator campaign-readiness requirements and privacy controls.
- Keep Investor opportunity browsing ahead of preference configuration.

## Performance and delivery

- Remove the render-blocking Google Fonts stylesheet and use the existing Inter-first system stack without an external font request.
- Generate responsive Arrival artwork at build/dev time from the approved source asset.
- Keep the hero as one uninterrupted scene and preserve eager/high-priority discovery for the first viewport.
- Reduce first-load homepage member portrait previews while retaining total member counts.
- Generate exact square PWA icons and a maskable icon from the approved AKARI mark.

## SEO and PWA/app-discovery readiness

- Use concise Founder/Creator/Investor-oriented titles and descriptions.
- Keep authenticated member discovery noindex/private.
- Replace the stale static sitemap with a D1-aware sitemap containing published Project, Campaign and Event detail URLs.
- Keep WebSite and Organization structured data on the public homepage.
- Publish exact install icons and useful PWA shortcuts.

Native Apple App Store / Google Play ASO is deliberately outside R91 because AKARI House is currently a website/PWA, not a submitted native store listing. R91 prepares naming, icons, descriptions and installability foundations without pretending that a store listing exists.

## Deliberately not added

No chat, wallet, token utility, AI matching, creator basket, payment rail or new CRM surface is part of this release.
