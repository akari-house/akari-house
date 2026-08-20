# R92 — Profile Sharing Card UX Polish

R92 finishes the AKARI House sharing-card experience without changing CRM boundaries or member data ownership.

## Product changes

- Replace the decorative QR-like block with a locally generated, standards-compliant QR for public member profiles.
- Encode the canonical production profile URL (`https://akarihouse.com/profiles/:username`).
- Render the same QR in the downloaded PNG so live preview and export agree.
- Never render a fake/scannable-looking QR for a private profile; show an explicit private state instead.
- Reduce social density to four primary social buttons with a `+N` overflow signal.
- Increase spacing and tap clarity for social links.
- Remove user-facing `credit-card` language and simplify sharing copy.
- Preserve the existing AKARI glass/flower/pink/yellow identity.

## Release gate

Do not merge until dependency/security, TypeScript, ESLint, Prettier, unit/integration tests, production build, full Playwright/browser coverage, role/security matrix and visual launch-gate evidence are green.

`akarihouse.com` remains the House product. No CRM route, UI, data authority or schema change is part of R92.
