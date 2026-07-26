# Production incident: unapproved preview reached the custom domain

Date: 26 July 2026

## Impact

The custom domain served an unfinished opportunity-branch build. The homepage returned HTTP 500 because the preview expected unreleased database schema, and the unfinished expanded footer rendered incorrectly.

## Immediate response

- Keep the opportunity pull request unmerged and in draft.
- Redeploy the current `main` branch, which contains the approved AKARI House Inari homepage and compact footer.
- Do not apply opportunity migration `0101` until its full browser and visual review passes.
- Treat pull-request deployments as previews only. The production custom domain must be updated exclusively from `main` through the production deployment workflow.

## Release safeguards

Before any future public release:

1. Confirm the exact commit being deployed is on `main`.
2. Apply required D1 migrations before Worker activation.
3. Run the public homepage, login, catalogue and protected-route audit.
4. Review the homepage and footer at 1440 px, 1024 px, 768 px and 390 px.
5. Confirm no pull-request preview is attached to `akarihouse.com`.
6. Keep the approved Inari experience as the public homepage unless a separately reviewed replacement is explicitly approved.

## Status

This commit intentionally triggers the standard `main` production workflow to restore the approved release.
