# PHOS Backend - B0-B17

Production-minded NestJS modular monolith for the Perfect Health Operating System.

## Implemented scope

- B0: NestJS foundation, environment validation, global validation/error handling, throttling, Helmet, CORS, health check, Swagger and Docker.
- B1: Prisma/PostgreSQL domain schema, foreign keys, indexes, soft-delete fields, audit log and sequential patient/encounter identifiers.
- B2: Argon2 password hashing, JWT access tokens, opaque rotating refresh tokens stored as SHA-256 hashes, logout/revocation and login audit.
- B3: staff CRUD, roles, server-side guards and account status enforcement.
- B4: facility, department and priced service catalogs.
- B5: patient registration, deterministic duplicate warning, search, profile and demographic audit history.
- B6: encounter creation, active-encounter protection and guarded lifecycle transitions.
- B7: station queues with controlled queue transitions.
- B8: validated vitals; completing triage atomically closes triage work and opens doctor work.
- B9: draft/finalize/correct consultation flow and diagnoses. Finalized clinical records require a correction reason.
- B10: laboratory catalog, multi-test orders, result entry, supervisor verification and doctor notification. Results remain hidden from clinical viewers until verified.
- B11: encounter-linked prescriptions with medication instructions and cancellation controls.
- B12: FEFO pharmacy dispensing with partial fills and atomic stock reduction.
- B13: medicine/supplier catalogs, batch receiving, immutable stock movements, adjustments, low-stock and expiry views.
- B14: encounter invoices priced from server-side consultation, verified lab and dispensed medicine data.
- B15: partial payments, immutable refunds and invoice balance recalculation.
- B16: cashier shift opening, cash-only session enforcement and closing reconciliation.
- B17: persistent role/user notifications with unread tracking. Socket.IO delivery remains a later transport layer.

## Quick start

1. Copy `.env.example` to `.env` and replace both JWT secrets.
2. Start PostgreSQL: `docker compose up -d postgres`.
3. Install and initialize:

```bash
npm install
npx prisma generate
npx prisma migrate deploy
npm run prisma:seed
npm run start:dev
```

- API: `http://localhost:4000/api/v1`
- Swagger: `http://localhost:4000/api/docs`
- Health: `http://localhost:4000/api/v1/health`

Use integer cents for service prices: `30000` means `300.00 ETB`.

## First end-to-end workflow

1. `POST /auth/login`
2. `POST /patients`
3. `POST /encounters` (creates triage queue item)
4. `PUT /encounters/:id/triage` (closes triage queue and opens doctor queue)
5. `POST /encounters/:id/consultation`
6. `POST /consultations/:id/diagnoses`
7. Optionally create lab orders and prescriptions
8. `POST /consultations/:id/finalize`
9. Verify laboratory results and/or dispense medication
10. `POST /encounters/:id/invoice`
11. Issue the invoice and record payment

## Operations invariants

- Laboratory values are not returned to doctors until a lab supervisor verifies the complete order.
- Dispensing uses FEFO batches and locks stock changes inside one database transaction.
- Stock totals are derived from batches and movements; clients never set aggregate stock.
- Invoice catalog prices are resolved by the server. Only explicit procedure/other additions accept a manual price.
- Completed payments are never edited to represent a refund; every refund is a separate audited record.
- Payment and refund commands require UUID idempotency keys so safe client retries do not duplicate money movement.
- Cash payments require an open session belonging to the cashier.
- Database partial indexes prevent duplicate active encounters, duplicate active queue stations and multiple open cashier sessions.

## Important production notes

- Keep PostgreSQL private on the LAN; only publish the API through Nginx/TLS.
- Replace seed credentials immediately. Never commit `.env`.
- Phase 3 should extend the encounter workflow for lab and prescription routes rather than bypassing this state machine.
- Socket.IO is intentionally deferred until the queue commands are stable. Emit realtime events only after committed transactions.
- See `SECURITY.md` for the current dependency-audit note.
