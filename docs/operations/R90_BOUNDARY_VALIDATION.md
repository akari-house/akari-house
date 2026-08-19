# R90 boundary validation

The release must be validated at three levels.

## Repository

- House route registry contains no CRM-only product routes.
- House authentication cookie remains host-only.
- House canonical URLs and emails use `akarihouse.com`.
- Dead SaaS workspace invitation behavior is absent.
- Production deploy config declares CRM bridge variables explicitly.

## Production House

- `https://akarihouse.com` serves House identity.
- protected House routes require House authentication.
- retired CRM routes return 404.
- canonical metadata resolves to `akarihouse.com`.

## CRM

- CRM public copy says CRM by AKARI / AKARI CRM.
- CRM does not label its workspace UI as AKARI House.
- CRM login does not expose internal customer numbering.
- API bridge remains authenticated and tenant-scoped.
