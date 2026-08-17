# R78 Authenticated UI Density Review

## Scope

This review evaluates the logged-in AKARI House experience after R77. It is a specialist product review using five design lenses rather than an external paid advisory engagement:

1. SaaS product UX and information density
2. Information architecture and scanning behaviour
3. Accessibility and interaction ergonomics
4. Responsive front-end systems
5. CRM and operator workflow efficiency

The public House remains intentionally cinematic. R78 focuses on authenticated member, role and administration workspaces where speed, orientation and repeat use matter more than atmosphere.

## Evidence reviewed

- R77 desktop and mobile Launch Gate visual evidence
- Founder, Creator, Investor and Superadmin workspaces
- Member directory and role-filter behaviour
- Dashboard role actions, profile readiness and profile editing surfaces
- Connections and notification-style operational lists
- Current responsive CSS and authenticated workspace layout rules

## Findings

### 1. Sparse collections expand too aggressively

When a role filter returns one or a few members, the existing grid can make a single profile occupy disproportionate visual space. This is most visible in a Founder-filtered member view with only one visible Founder profile.

**Decision:** one to three result cards use a self-sizing compact collection. A single Founder must read as one deliberate profile card, not as a half-empty page-wide panel.

The rule is generic. It applies to Founder, Creator and Investor filters without hard-coded role-specific layout logic.

### 2. Logged-in dashboards inherit too much cinematic spacing

The R77 Founder and Creator screenshots show strong visual hierarchy, but a routine user has to travel through large hero, account status, profile readiness, role actions, photo and profile-editing surfaces. Several cards use minimum heights designed more like landing-page modules than repeat-use SaaS controls.

**Decision:** preserve brand language and touch targets while reducing minimum heights, vertical gaps and panel padding in authenticated workspaces.

### 3. Role action cards carry more height than information

Role action cards currently reserve significant vertical space even when their copy is short.

**Decision:** use a denser auto-fit grid, shorter cards and bounded description length. The primary next action remains visually distinct without dominating the page.

### 4. Operational rows should scan like rows

Connections, notifications and similar operator/member lists are recurring workflow surfaces. Large card padding slows visual scanning.

**Decision:** reduce row padding and headline size while retaining clear status, actions and accessible target sizes.

### 5. Admin density is closer to the right benchmark

The Superadmin workspace is already more information-efficient than the personal dashboard. Its compact navigation, queue surfaces and operational cards are directionally correct.

**Decision:** align member and role workspaces toward the same density philosophy without turning them into an enterprise table UI.

## R78 design principles

### Public versus authenticated

- Public House: cinematic, narrative, atmospheric
- Member House: calm, compact, legible
- Founder/Creator/Investor workspaces: task-first and scannable
- Superadmin: highest useful information density

### Sparse-state rule

Low content volume must not create oversized components. Collections with one to three items should keep normal card proportions and leave intentional whitespace around the collection rather than stretching the items.

### Density rule

Reduce unused space before reducing font size. Keep readable typography, 42 to 48 pixel primary interactive targets where appropriate, visible focus states and responsive stacking.

### Consistency rule

The same information type should have the same visual weight across the authenticated product. Status summaries, next actions, directory cards and operational rows should not change scale dramatically between roles.

## R78 implementation

- new authenticated density CSS layer loaded after prior visual polish
- smaller authenticated workspace heroes on desktop
- tighter member-home and profile-readiness summaries
- compact auto-fit role action cards
- tighter profile editor rhythm without hiding fields
- sparse member collections self-size using content-aware CSS
- member cards have bounded summary copy for faster scanning
- connections and notification-style rows become more compact
- common authenticated operational cards use a consistent radius and padding rhythm
- mobile remains single-column and preserves usable interaction targets

## Regression proof

Launch Gate visual evidence now includes a sparse Founder directory scenario. On desktop the first sparse Founder card must remain at or below 380 pixels wide, and both desktop and mobile must remain free of horizontal overflow.

R78 is a visual and interaction-density release only. It does not change member permissions, privacy rules, Founder ownership, campaign eligibility, production user data or canonical product models.
