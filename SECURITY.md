# Security notes

- Never commit `.env`; use independent 32+ character access and refresh secrets.
- Refresh tokens are opaque, hashed at rest, rotated on refresh and revoked when an account is disabled.
- The application returns user projections that exclude `passwordHash`.
- PostgreSQL must stay private. Publish only Nginx/API ports on the clinic LAN.
- Run `npm audit` during every dependency update.

## Current dependency scan

The runtime multipart vulnerability reported against NestJS 11 was removed by using NestJS 12. The remaining npm advisory is in Prisma 7 CLI/config transitive dependencies (`deepmerge-ts` and `mysql2`). PHOS uses PostgreSQL, not MySQL, and none of these CLI packages expose an application endpoint. npm currently proposes a breaking downgrade to Prisma 6 rather than a compatible Prisma 7 fix. Recheck and upgrade when Prisma publishes the stable patched line; do not use `npm audit fix --force` blindly.
