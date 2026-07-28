# AKARI workspace reference preview

This branch redesigns the Deals catalogue and Deal Room presentation from the approved reference image and extends the same visual system across authenticated user and administration workspaces.

Public, story-led House pages remain cinematic: The House, Projects, Campaigns, Events, Archive, Team and Membership, including their public detail pages. Operational areas use the CRM-style workspace shell: the member dashboard, member directory, profile tools, account and privacy settings, Telegram settings, connections, notifications, creation and management flows, Founder and Creator workspaces, Investor settings and every scoped administration route.

Admin navigation is generated from the existing backend permission model, so scoped administrators see only their assigned tools while Superadmins retain the full console.

Workspace hero banners use a purpose-built `workspace-house.svg` illustration inspired by the homepage House scene. It introduces a night-time Japanese house, warm windows, torii details, subtle grid structure and restrained AKARI pink, yellow and petal accents without modifying or duplicating the homepage artwork.

Desktop sidebar links and the mobile navigation retain distinct accessible names, and optional admin-menu enrichment cannot invalidate a normal member session. Backend route permission checks remain authoritative regardless of which links are shown.

The change is limited to navigation, layout, visual hierarchy and responsive presentation. Existing D1 records, server actions, Investor verification, per-deal approvals, document grants, expiry checks and audit records remain authoritative.

The branch must remain in draft until the visual preview is approved and all automated gates pass.
