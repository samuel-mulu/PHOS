# Unified Clinic System — Frontend Build Plan W0–W15

**Project:** Unified Clinic / Hospital Management System  
**Frontend:** Next.js App Router + React + TypeScript  
**Backend:** Existing NestJS + Prisma + PostgreSQL  
**Purpose:** Full agent-ready implementation plan from W0 through W15.  
**Core Rule:** The existing backend is the source of truth. The frontend must consume and respect current controllers, DTOs, enums, role guards, workflow rules, and response shapes.

---

# 1. Frontend Phase Map

```text
W0  — Frontend Foundation + Design System
W1  — Login + Auth State
W2  — Role-Based App Shell + Navigation
W3  — Patient Search / Register / Profile
W4  — Reception + Encounter
W5  — Nurse / Triage
W6  — Doctor Workspace
W7  — Laboratory Workspace
W8  — Prescription + Pharmacy Workspace
W9  — Inventory Workspace
W10 — Billing Workspace
W11 — Payments + Refunds + Cashier
W12 — Cash Reconciliation
W13 — Notifications + Realtime Operations
W14 — Admin + Reports + Audit
W15 — Error / Offline UX
```

---

# 2. Existing Backend Map

Current backend phases:

```text
B0  — Backend Foundation
B1  — Prisma Core Schema
B2  — Authentication
B3  — Users + RBAC
B4  — Facility / Departments / Services
B5  — Patient
B6  — Encounter
B7  — Queue
B8  — Triage
B9  — Consultation
B10 — Laboratory
B11 — Prescription
B12 — Pharmacy
B13 — Inventory
B14 — Billing
B15 — Payments + Refunds
B16 — Cash Reconciliation
B17 — Notifications
```

Frontend-to-backend dependency map:

| Frontend Phase | Backend Modules |
|---|---|
| W0 | B0 |
| W1 | B2, B3 |
| W2 | B3, B4 |
| W3 | B5, B6 |
| W4 | B4, B5, B6, B7 |
| W5 | B5, B6, B7, B8 |
| W6 | B5, B6, B7, B8, B9, B10, B11 |
| W7 | B6, B7, B10 |
| W8 | B6, B11, B12, B13 |
| W9 | B13 |
| W10 | B6, B14 |
| W11 | B14, B15 |
| W12 | B15, B16 |
| W13 | B17 + existing event/socket layer if available |
| W14 | B3, B4, B14, B15, B16, audit/report APIs |
| W15 | Cross-cutting across B0–B17 |

---

# 3. Core Architecture

Use one frontend.

```text
Next.js
  |
  v
Feature Hooks
  |
  v
API Services
  |
  v
NestJS REST API
  |
  v
Prisma
  |
  v
PostgreSQL
```

Do not create separate applications for:

- reception
- nurse
- doctor
- laboratory
- pharmacy
- cashier
- admin

Use one application with role-aware workspaces.

---

# 4. Frontend Stack

Use:

```text
Next.js App Router
React
TypeScript
Tailwind CSS
shadcn/ui
TanStack Query
React Hook Form
Zod
Axios
Zustand
Lucide React
date-fns
Sonner
```

Do not add Redux unless there is a proven need.

Do not add unnecessary architecture layers.

---

# 5. Environment Strategy

Development:

```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api
```

Production:

```env
NEXT_PUBLIC_API_URL=https://api.example.com/api
```

Same source code in every environment.

Only environment configuration changes.

---

# 6. Required Frontend Folder Structure

```text
src/
├── app/
│   ├── (auth)/
│   │   └── login/
│   │
│   ├── (dashboard)/
│   │   ├── dashboard/
│   │   ├── patients/
│   │   ├── reception/
│   │   ├── nurse/
│   │   ├── doctor/
│   │   ├── laboratory/
│   │   ├── pharmacy/
│   │   ├── inventory/
│   │   ├── billing/
│   │   ├── cashier/
│   │   ├── reconciliation/
│   │   ├── notifications/
│   │   ├── admin/
│   │   ├── reports/
│   │   └── audit/
│   │
│   ├── layout.tsx
│   ├── providers.tsx
│   └── globals.css
│
├── components/
│   ├── ui/
│   ├── layout/
│   ├── shared/
│   ├── patients/
│   ├── reception/
│   ├── nurse/
│   ├── doctor/
│   ├── laboratory/
│   ├── pharmacy/
│   ├── inventory/
│   ├── billing/
│   ├── cashier/
│   └── admin/
│
├── features/
│   ├── auth/
│   ├── users/
│   ├── facilities/
│   ├── patients/
│   ├── encounters/
│   ├── queues/
│   ├── triage/
│   ├── consultations/
│   ├── laboratory/
│   ├── prescriptions/
│   ├── pharmacy/
│   ├── inventory/
│   ├── billing/
│   ├── payments/
│   ├── reconciliation/
│   ├── notifications/
│   ├── reports/
│   └── audit/
│
├── lib/
│   ├── api/
│   ├── auth/
│   ├── query/
│   ├── realtime/
│   ├── offline/
│   ├── env.ts
│   ├── constants.ts
│   └── utils.ts
│
├── stores/
│   └── auth-store.ts
│
└── types/
```

---

# 7. Backend Contract Audit

Before implementing frontend features, inspect the actual backend.

Create:

```text
docs/frontend-backend-contract.md
```

Record:

```text
Auth endpoints
User endpoints
Role enum
Facilities
Departments
Services
Patients
Encounters
Queues
Triage
Consultations
Laboratory
Prescription
Pharmacy
Inventory
Billing
Payments
Refunds
Cash reconciliation
Notifications
Reports
Audit
```

For each API:

```md
METHOD /path

Request:
...

Response:
...

Roles:
...

Possible errors:
...
```

If this document and the backend differ:

```text
CURRENT BACKEND CODE WINS
```

---

# 8. Global Frontend Rules

The agent must follow these rules for every phase:

1. Inspect relevant backend module first.
2. Use exact DTO fields.
3. Use exact enum values.
4. Use exact role names.
5. Use backend pagination.
6. Use backend validation.
7. Never duplicate workflow rules.
8. Never manually calculate next encounter state.
9. Never hardcode departments/services/tests/medicines when APIs exist.
10. Keep server state in TanStack Query.
11. Keep small client-only state in Zustand only when needed.
12. Prevent duplicate submissions.
13. Handle loading/error/empty states.
14. Keep patient identity visible in clinical screens.
15. Do not silently discard unsaved clinical input.
16. Avoid large global stores.
17. Avoid direct fetch calls inside pages.
18. Do not use `any` as a shortcut.
19. Keep implementation simple.
20. Do not redesign the backend unless there is a real defect.

---

# 9. W0 — Frontend Foundation + Design System

## Goal

Create the technical and visual foundation for the complete clinic application.

## Build

- Next.js App Router
- TypeScript strict mode
- Tailwind
- shadcn/ui
- Axios
- TanStack Query
- React Hook Form
- Zod
- Zustand
- Sonner
- Lucide
- date-fns
- environment validation
- central API client
- global error normalization
- shared query client
- layout primitives
- base DataTable
- form field components
- loading states
- skeleton states
- error states
- empty states
- confirm dialogs
- status badges
- responsive baseline

## Design Direction

Clinical workstation rather than generic SaaS.

Use:

```text
soft neutral background
white content surfaces
dark slate/navy navigation
clinical teal/green accent
clear warning/error states
compact tables
readable forms
strong patient identity
```

Avoid:

- excessive gradients
- giant marketing cards
- oversized headings
- decorative dashboards
- unnecessary animation

## Acceptance Criteria

- project compiles
- environment validation works
- API client works
- query provider works
- base design system exists
- shared states exist
- responsive desktop/tablet layout exists
- no feature-specific hacks in foundation

---

# 10. W1 — Login + Auth State

## Backend

Use:

- B2 Authentication
- B3 Users + RBAC

Inspect current endpoints first.

Likely concepts:

```text
POST /auth/login
POST /auth/refresh
GET /users/me
POST /auth/logout
```

Use actual backend routes.

## Build

- login screen
- auth schema
- auth API service
- login mutation
- current user query
- session restore
- logout
- 401 handling
- 403 handling
- role landing redirect
- optional return URL after login

Do not add employee self-registration.

## Acceptance Criteria

- correct credentials log in
- wrong credentials show proper error
- refresh restores session
- current user loads
- logout works
- expired session is handled
- roles are read from backend

---

# 11. W2 — Role-Based App Shell + Navigation

## Backend

Use:

- B3 Users + RBAC
- B4 Facility / Departments / Services

## Build

- sidebar
- header
- responsive tablet/mobile menu
- current user identity
- facility/department context
- role-filtered navigation
- protected dashboard layout
- permission-denied screen
- role-based default route

Suggested role landing:

```text
ADMIN          -> /dashboard
RECEPTIONIST   -> /reception
NURSE          -> /nurse
DOCTOR         -> /doctor
LAB_TECHNICIAN -> /laboratory
PHARMACIST     -> /pharmacy
CASHIER        -> /cashier
STORE_MANAGER  -> /inventory
```

Use backend role names exactly.

## Acceptance Criteria

- one shell for all roles
- navigation changes by role
- backend 403 remains authoritative
- shell works on desktop/tablet
- no duplicated sidebars

---

# 12. W3 — Patient Search / Register / Profile

## Backend

Use:

- B5 Patient
- B6 Encounter

## Build

### Patient Search

Support backend-supported search fields:

- patient number
- name
- phone

Use:

```text
300–400 ms debounce
server-side filtering
server-side pagination
```

### Patient Registration

Use backend DTO fields exactly.

### Patient Profile

Show:

- patient identity
- demographic details
- contact
- encounter history
- available clinical summary

Future tabs may include:

```text
Overview
Encounters
Laboratory
Prescriptions
Billing
Payments
```

Only activate tabs when corresponding APIs are ready.

### Duplicate Safety

If backend returns conflict:

- show clear message
- show existing patient when possible
- do not silently create duplicate patient

## Acceptance Criteria

- search works
- registration works
- patient profile loads
- encounter history loads
- pagination works
- duplicate handling works
- loading/error/empty states exist

---

# 13. W4 — Reception + Encounter

## Backend

Use:

- B4 Facility / Departments / Services
- B5 Patient
- B6 Encounter
- B7 Queue

## Workflow

```text
Search Patient
     ↓
Select Patient
     ↓
Start New Visit
     ↓
Department / Service
     ↓
Create Encounter
     ↓
Queue
```

## Build

- reception dashboard
- fast patient search
- selected patient card
- Start Visit drawer
- encounter type
- facility
- department
- service
- reason for visit
- create encounter
- current reception queue
- queue status
- waiting duration
- safe query invalidation

Do not manually update encounter statuses.

If backend creates queue as part of encounter creation, use that flow.

If backend uses a second command, use the documented backend sequence.

## Acceptance Criteria

- receptionist can create encounter
- department/service lists come from backend
- queue shows new encounter
- duplicate submit blocked
- backend owns transition status

---

# 14. W5 — Nurse / Triage

## Backend

Use:

- B5 Patient
- B6 Encounter
- B7 Queue
- B8 Triage

## Workflow

```text
Nurse Queue
    ↓
Open Patient
    ↓
Vitals
    ↓
Chief Complaint
    ↓
Priority
    ↓
Complete Triage
    ↓
Doctor Queue
```

## Build

- nurse queue
- patient identity
- encounter identity
- vitals form
- temperature
- blood pressure
- pulse
- respiratory rate
- SpO2
- weight
- height
- BMI display when relevant
- chief complaint
- triage priority
- notes
- Save if backend supports draft
- Complete Triage

Do not use physiological ranges as diagnostic logic.

They are only input guardrails.

## Acceptance Criteria

- nurse queue works
- triage can be saved
- completion works
- backend transition moves patient to doctor queue
- nurse cannot access doctor actions

---

# 15. W6 — Doctor Workspace

## Backend

Use:

- B5 Patient
- B6 Encounter
- B7 Queue
- B8 Triage
- B9 Consultation
- B10 Laboratory
- B11 Prescription

## Layout

Recommended:

```text
┌──────────────────────────────────────────────────────────────┐
│ Patient | Patient No | Age/Sex | Encounter | Status         │
├────────────────┬────────────────────────┬────────────────────┤
│ Patient Context│ Consultation           │ Orders             │
│                │                        │                    │
│ Vitals         │ HPI                    │ Laboratory         │
│ History        │ Examination            │ Prescription       │
│ Allergies      │ Assessment             │                    │
│ Previous Visits│ Diagnosis              │                    │
│                │ Plan                   │                    │
├────────────────┴────────────────────────┴────────────────────┤
│ Save Draft                         Complete Consultation    │
└──────────────────────────────────────────────────────────────┘
```

## Build

- doctor queue
- patient context
- triage summary
- previous encounter summary
- consultation form
- diagnosis UI based on backend model
- clinical plan
- Save Draft
- lab order drawer
- prescription drawer
- current orders panel
- complete consultation

Do not auto-finalize consultation.

Backend determines next encounter state.

## Acceptance Criteria

- doctor queue works
- patient context is always visible
- consultation saves
- orders can be created
- prescription can be created
- completion uses backend state machine
- opening order drawer does not lose consultation form state

---

# 16. W7 — Laboratory Workspace

## Backend

Use:

- B6 Encounter
- B7 Queue
- B10 Laboratory

## Goal

Provide laboratory staff with a clear work queue from ordered test to verified result.

## Workflow

```text
Lab Queue
   ↓
Receive Order
   ↓
Collect / Process
   ↓
Enter Result
   ↓
Review / Verify
   ↓
Result Available to Doctor
```

Use actual B10 statuses and commands.

Do not invent status names.

## Build

### Laboratory Dashboard

Show useful status counts when supported:

```text
Pending
Collected
In Progress
Ready for Verification
Completed
```

### Lab Queue

Columns:

- order/request number
- patient
- encounter
- requested tests
- priority
- ordered by
- ordered at
- status

### Order Detail

Show:

- patient identity
- encounter
- test list
- doctor notes
- priority
- specimen details when modeled

### Results

Render based on backend test/result model.

Possible result types:

- numeric
- text
- positive/negative
- select option
- multiline note

Do not hardcode one universal result field if the backend models different result structures.

### Verify/Finalize

Use backend command.

Do not directly mutate status if the backend has a workflow endpoint.

## Acceptance Criteria

- lab queue loads
- orders are role-protected
- result entry works
- backend validation is respected
- verification/finalization works
- doctor-facing result becomes available
- patient identity is always clear

---

# 17. W8 — Prescription + Pharmacy Workspace

## Backend

Use:

- B6 Encounter
- B11 Prescription
- B12 Pharmacy
- B13 Inventory

## Goal

Allow pharmacy staff to receive prescriptions, confirm stock, dispense safely, and record dispensing through backend rules.

## Workflow

```text
Prescription
    ↓
Pharmacy Queue
    ↓
Review Medication
    ↓
Check Available Stock
    ↓
Dispense
    ↓
Backend Updates Stock / Prescription State
```

## Build

### Pharmacy Queue

Show:

- patient
- prescription
- doctor
- encounter
- prescribed time
- status

### Prescription Detail

Show:

- medicine
- strength
- route
- frequency
- duration
- quantity
- instructions

Use actual backend fields.

### Stock Context

If B12/B13 expose inventory availability, show it.

Do not calculate stock truth solely from frontend cache.

### Dispensing

Use backend command to dispense.

The backend should enforce:

- stock availability
- dispensing quantity
- prescription state
- authorization
- inventory mutation

### Partial Dispense

Only support if backend supports it.

Do not invent frontend-only partial dispense behavior.

## Acceptance Criteria

- pharmacy queue works
- prescription details are accurate
- stock comes from backend
- dispense action works
- backend handles inventory mutation
- duplicate dispense is prevented

---

# 18. W9 — Inventory Workspace

## Backend

Use:

- B13 Inventory

## Goal

Provide pharmacy/store staff with operational inventory management.

## Build

### Inventory List

Suggested columns when backend supports:

```text
Item
SKU / Code
Batch
Quantity
Unit
Expiry Date
Location
Status
```

### Search / Filters

Support backend filters such as:

- item name
- code
- batch
- low stock
- expiring soon
- expired
- location

### Stock Movements

Show backend ledger/movement history if available.

Types may include:

- receipt
- dispense
- adjustment
- transfer
- return

Use backend enum.

### Receive Stock

Create a proper stock-receipt form if API exists.

### Adjust Stock

Require reason and use backend command.

Never change stock quantities directly in UI state.

### Low Stock / Expiry

Display warnings using backend values/config where available.

Do not make destructive stock decisions on frontend.

## Acceptance Criteria

- list works
- filters work
- stock details work
- movements are visible
- receive/adjust operations use backend
- inventory remains server-authoritative

---

# 19. W10 — Billing Workspace

## Backend

Use:

- B6 Encounter
- B14 Billing

## Goal

Show patient charges generated from clinic services and downstream care.

## Workflow

```text
Encounter
   ↓
Charge Items
   ↓
Bill / Invoice
   ↓
Outstanding Balance
   ↓
Payment
```

## Build

### Billing Queue

Display encounters/bills needing payment.

### Bill Detail

Show:

- patient
- encounter
- invoice number
- bill items
- description
- quantity
- unit price
- subtotal
- discount when supported
- taxes when supported
- total
- paid
- balance
- status

Amounts must use backend representation consistently.

If backend uses cents/minor units, do not use floating point for calculation.

### Adjustments

Only expose discounts/voids if backend explicitly supports them and current user is authorized.

Do not allow arbitrary client-side bill manipulation.

## Acceptance Criteria

- bill list loads
- bill detail matches backend
- totals are displayed correctly
- payment status is canonical
- unauthorized adjustments are hidden and backend-protected

---

# 20. W11 — Payments + Refunds + Cashier

## Backend

Use:

- B14 Billing
- B15 Payments + Refunds

## Goal

Build the cashier workflow around existing bills.

## Workflow

```text
Find Patient / Bill
      ↓
Outstanding Balance
      ↓
Collect Payment
      ↓
Receipt
```

Refund:

```text
Existing Payment
      ↓
Authorized Refund
      ↓
Reason
      ↓
Backend Refund Transaction
```

## Build

### Cashier Dashboard

Useful metrics when backend supports:

- bills waiting
- payments today
- refunds today
- current cashier total

### Payment Form

Use exact backend payment methods.

Possible methods:

- CASH
- BANK
- MOBILE_MONEY
- CARD

Do not invent methods.

### Payment Safety

Prevent:

- double-click duplicate
- overpayment unless backend permits
- negative values
- client-side fake paid state

### Receipt

Render printable receipt from canonical response.

### Refunds

Only authorized roles can access.

Require:

- original payment
- amount
- reason

Use backend refund command.

## Acceptance Criteria

- payment works
- bill updates after payment
- duplicate submission is prevented
- receipt renders
- refund works when permitted
- backend remains ledger authority

---

# 21. W12 — Cash Reconciliation

## Backend

Use:

- B15 Payments
- B16 Cash Reconciliation

## Goal

Allow cashiers/supervisors to close and reconcile a working period safely.

## Workflow

```text
Cashier Shift / Session
      ↓
Expected Cash
      ↓
Counted Cash
      ↓
Variance
      ↓
Submit Reconciliation
      ↓
Supervisor Review if backend supports it
```

## Build

### Reconciliation Dashboard

Show:

- cashier
- period/session
- opening balance if applicable
- cash payments
- refunds
- expected amount
- counted amount
- variance
- status

### Count Form

Use backend model.

### Submission

Require confirmation.

If backend supports supervisor approval, build that workflow.

Do not calculate ledger truth independently.

Frontend can display calculations, but backend response is canonical.

## Acceptance Criteria

- reconciliation data loads
- cashier can submit count
- variance is visible
- backend confirms final reconciliation state
- role restrictions work

---

# 22. W13 — Notifications + Realtime Operations

## Backend

Use:

- B17 Notifications
- existing Socket.IO/WebSocket layer if already implemented

## Goal

Improve operational awareness without making realtime state a second source of truth.

## REST First Rule

REST remains canonical.

Realtime should:

```text
receive event
  ↓
invalidate/update relevant query
  ↓
UI refreshes from canonical state
```

Do not build a parallel frontend workflow engine.

## Build

### Notification Center

Show:

- unread count
- notification list
- category/type
- timestamp
- link/action target
- mark read
- mark all read when backend supports

### Realtime Events

Potential use cases:

- queue changed
- patient sent to triage
- patient sent to doctor
- lab result finalized
- prescription ready
- payment completed
- system notification

Only use actual backend event names.

### Reconnect Behavior

On socket reconnect:

- re-fetch important active queries
- do not trust missed events
- avoid duplicate event processing

### Deduplication

If events have IDs/version numbers, use them.

## Acceptance Criteria

- notifications load
- unread state works
- realtime updates relevant screens
- reconnect re-syncs data
- duplicate events do not create duplicate UI state
- REST remains canonical

---

# 23. W14 — Admin + Reports + Audit

## Backend

Use available APIs from:

- B3 Users/RBAC
- B4 Facilities/Departments/Services
- B14 Billing
- B15 Payments
- B16 Reconciliation
- audit/report endpoints

## Goal

Provide administrators with controlled configuration, operational reporting, and audit visibility.

## Build

### User Management

When backend supports:

- list users
- create user
- edit user
- activate/deactivate/block
- assign role
- assign facility/department

Do not allow frontend to invent roles.

### Facility Configuration

Use B4:

- facilities
- departments
- services

Expose only backend-supported write operations.

### Reports

Build from actual report APIs.

Possible categories:

- patient registrations
- encounters
- service utilization
- laboratory activity
- pharmacy activity
- inventory summary
- billing
- payments
- refunds
- cashier reconciliation

Do not generate misleading frontend-only accounting totals when backend reporting endpoints already exist.

### Audit Logs

Display:

- actor
- action
- entity
- entity ID
- timestamp
- metadata/details
- source/IP when provided

Audit logs should be read-only.

### Filters

Use server-side filtering and pagination.

## Acceptance Criteria

- admin-only routes are protected
- users/facility configuration matches backend
- reports use backend data
- audit logs are read-only
- filters/pagination work
- no hidden frontend privilege escalation

---

# 24. W15 — Error / Offline UX

## Goal

Make the clinical application resilient to unstable LAN/internet/API conditions without creating unsafe offline medical writes.

This phase is cross-cutting across W0–W14.

---

## 24.1 Error Categories

Distinguish:

```text
Validation error
Unauthorized
Forbidden
Not found
Conflict
Server error
Network unavailable
Request timeout
Temporary backend outage
Stale data
Realtime disconnected
```

Do not show every problem as:

```text
Something went wrong
```

Use actionable messages.

---

## 24.2 Global Network Status

Create a small network status layer.

Detect:

- browser offline state
- API unreachable
- socket disconnected

Examples:

```text
Offline — changes cannot be submitted.
Server unavailable — retrying is safe.
Realtime disconnected — data may not update automatically.
```

Do not confuse browser online status with backend health.

---

## 24.3 Safe Retry UX

Safe GET requests may have retry.

Be careful with mutations.

For create/update/payment/dispense operations:

- do not blindly retry after timeout
- use idempotency when backend supports it
- show uncertain submission state when necessary

Example:

```text
Payment submission timed out.
Do not submit again until the transaction status is checked.
```

This is especially important for:

- encounter creation
- lab result finalization
- pharmacy dispense
- payments
- refunds
- reconciliation

---

## 24.4 Offline Read Behavior

TanStack Query may display cached data when network is unavailable.

Cached data must be clearly marked as potentially stale.

Example:

```text
Offline — showing last loaded data from 10:42 AM.
```

Do not represent cached data as current.

---

## 24.5 Offline Writes

Default rule:

```text
DO NOT QUEUE CLINICAL OR FINANCIAL WRITES OFFLINE
```

Do not silently store and replay:

- consultation completion
- triage completion
- prescriptions
- lab finalization
- inventory adjustment
- dispensing
- payments
- refunds
- reconciliation

These actions require authoritative backend validation.

For ordinary draft text, local temporary preservation may be allowed.

Example:

- unsaved consultation draft
- unsaved triage note

But it must not be represented as submitted.

---

## 24.6 Local Draft Recovery

Use safe local draft persistence for long text forms where useful.

Possible:

```text
consultation draft
triage notes
lab result draft before verification
```

Rules:

- scope draft to user + encounter + form type
- timestamp draft
- never mark it submitted
- clear after confirmed backend save
- show recovery prompt after crash/reload

Example:

```text
An unsaved draft from 10:36 AM was found.
[Restore] [Discard]
```

Do not store highly sensitive data longer than necessary.

---

## 24.7 Mutation Uncertainty

For important commands, distinguish:

```text
FAILED
```

from:

```text
UNKNOWN WHETHER SERVER COMMITTED
```

A timeout after sending payment is not equal to a rejected payment.

When possible:

1. query canonical transaction by ID/idempotency key
2. resolve actual state
3. only then allow retry

---

## 24.8 Page-Level Error States

Each operational screen needs:

```text
Loading
Success
Empty
Recoverable Error
Permission Error
Not Found
Offline Cached State
```

---

## 24.9 Error Boundaries

Use Next.js error boundaries for unexpected rendering failures.

Create:

```text
app/error.tsx
app/global-error.tsx
feature-level error boundaries where useful
```

Do not use error boundaries as replacement for normal API error handling.

---

## 24.10 Form Preservation

When user has unsaved clinical input:

- warn before destructive navigation when practical
- do not reset form on query refetch
- do not lose text when opening a drawer/modal
- do not lose form because a background query failed

---

## 24.11 Realtime Offline Behavior

If socket disconnects:

```text
show small warning
continue using REST
reconnect
invalidate active queries after reconnect
```

The application should remain usable without realtime when REST works.

---

## 24.12 Error Logging

In production:

Log technical errors without exposing:

- auth tokens
- passwords
- full sensitive clinical payloads
- unnecessary patient information

User-facing errors should be readable.

Developer logs should contain enough context to diagnose safely.

---

## 24.13 Offline UX Acceptance Criteria

- browser offline is detected
- backend outage is distinguishable
- cached data is labeled stale/offline
- unsafe writes are not silently queued
- retries do not duplicate important mutations
- consultation draft can recover when implemented
- realtime reconnect triggers canonical refresh
- user never receives false confirmation of payment/dispense/clinical completion
- forms survive recoverable UI errors when possible
- global error boundaries exist

---

# 25. Query Key Strategy

Use domain-specific query keys.

Example:

```ts
export const queryKeys = {
  auth: {
    me: ["auth", "me"] as const,
  },

  patients: {
    all: ["patients"] as const,
    list: (params: unknown) => ["patients", "list", params] as const,
    detail: (id: string) => ["patients", "detail", id] as const,
  },

  encounters: {
    detail: (id: string) => ["encounters", "detail", id] as const,
  },

  queues: {
    reception: (params?: unknown) => ["queue", "reception", params] as const,
    nurse: (params?: unknown) => ["queue", "nurse", params] as const,
    doctor: (params?: unknown) => ["queue", "doctor", params] as const,
    laboratory: (params?: unknown) => ["queue", "laboratory", params] as const,
    pharmacy: (params?: unknown) => ["queue", "pharmacy", params] as const,
  },

  triage: {
    detail: (encounterId: string) => ["triage", encounterId] as const,
  },

  consultation: {
    detail: (encounterId: string) => ["consultation", encounterId] as const,
  },

  laboratory: {
    order: (id: string) => ["laboratory", "order", id] as const,
  },

  pharmacy: {
    prescription: (id: string) => ["pharmacy", "prescription", id] as const,
  },

  inventory: {
    list: (params?: unknown) => ["inventory", "list", params] as const,
  },

  billing: {
    bill: (id: string) => ["billing", "bill", id] as const,
  },

  notifications: {
    list: (params?: unknown) => ["notifications", params] as const,
  },
};
```

---

# 26. Mutation Invalidation Strategy

Invalidate only the necessary data.

Examples:

## New Encounter

```text
patient detail
patient encounters
reception queue
encounter detail
```

## Triage Complete

```text
nurse queue
doctor queue
encounter detail
triage detail
```

## Consultation Complete

```text
doctor queue
encounter detail
consultation
lab orders
prescriptions
```

## Lab Finalized

```text
laboratory queue
lab order
encounter
doctor/patient result view
```

## Dispense

```text
pharmacy queue
prescription
inventory item
inventory movement
```

## Payment

```text
bill
billing queue
payment history
cashier dashboard
reconciliation totals
```

Do not invalidate the whole application cache after every mutation.

---

# 27. Data Integrity Rules

Frontend must never independently decide:

- encounter state
- queue state
- whether triage is complete
- whether consultation can finalize
- whether lab result can be verified
- whether medication can be dispensed
- whether stock can decrease
- whether bill is paid
- whether refund is valid
- whether cash reconciliation is correct

Frontend submits intent.

Backend validates and returns canonical state.

---

# 28. Financial Amount Rules

If backend stores minor units/cents:

```text
100 ETB = 10000 minor units
```

Do not perform financial math using floating-point numbers.

Create formatting helpers.

Example concept:

```ts
formatMoney(amountMinor)
```

Use backend currency configuration.

---

# 29. Date / Time Rules

Backend timestamps are canonical.

Frontend:

- parse ISO timestamp
- display clinic-local time
- do not rewrite server timestamps
- show absolute date/time for clinical/financial records

Use `date-fns`.

---

# 30. Table Standards

Operational tables should support:

- server pagination
- server filters
- sort when backend supports it
- loading skeleton
- empty state
- row actions
- keyboard focus
- mobile/tablet fallback

Do not load thousands of records and filter entirely in the browser.

---

# 31. Shared Status Badges

Create domain-specific presentational mappings.

Examples:

```text
EncounterStatusBadge
QueueStatusBadge
LabStatusBadge
PrescriptionStatusBadge
PaymentStatusBadge
ReconciliationStatusBadge
```

Mappings are display-only.

Do not use label maps as workflow logic.

---

# 32. Security Rules

Frontend must:

- never expose backend secrets
- never log tokens
- never use UI hiding as authorization
- handle 401
- handle 403
- avoid sensitive patient data in browser logs
- avoid storing unnecessary clinical payloads long-term
- sanitize user-entered content when rendering rich text
- use backend RBAC on every protected action

---

# 33. Phase Gates

## W0 Gate

Proceed only if:

- app builds
- API client works
- query provider works
- design baseline exists

## W1 Gate

Proceed only if:

- login works
- session restore works
- logout works
- roles load

## W2 Gate

Proceed only if:

- role navigation works
- protected layout works

## W3 Gate

Proceed only if:

- patient search works
- patient creation works
- profile works

## W4 Gate

Proceed only if:

- encounter creation works
- queue receives correct canonical state

## W5 Gate

Proceed only if:

- triage works
- doctor queue receives completed triage

## W6 Gate

Proceed only if:

- consultation saves
- lab orders work
- prescription works

## W7 Gate

Proceed only if:

- lab result workflow works end-to-end

## W8 Gate

Proceed only if:

- pharmacy dispensing works with backend inventory

## W9 Gate

Proceed only if:

- inventory movements are accurate

## W10 Gate

Proceed only if:

- canonical bill details/totals are displayed correctly

## W11 Gate

Proceed only if:

- payment/refund works safely

## W12 Gate

Proceed only if:

- reconciliation totals match backend

## W13 Gate

Proceed only if:

- notification/realtime reconnect is safe

## W14 Gate

Proceed only if:

- admin/report/audit access is correctly protected

## W15 Gate

Complete when:

- failure states are safe
- offline state is visible
- unsafe writes are never silently queued
- uncertain mutations do not produce false success

---

# 34. Definition of Done for Every Phase

Every W-phase must include:

```text
Implementation
TypeScript correctness
Backend contract verification
Role checks
Loading state
Empty state
Error state
Validation
Mutation safety
Responsive desktop/tablet check
No console errors
No stale mocks
No duplicated domain state
Basic integration verification
```

---

# 35. Required Agent Report After Each Phase

After completing each phase, report:

```md
## Phase
W#

## Completed
- ...

## Backend Contracts Used
- METHOD /path
- METHOD /path

## Backend Enums Used
- ...

## Files Added
- ...

## Files Changed
- ...

## Validation Performed
- ...

## Issues / Mismatches
- ...

## Phase Gate
PASS / FAIL

## Ready for Next Phase
YES / NO
```

---

# 36. Master Agent Prompt

```text
You are the senior frontend engineer for an existing Unified Clinic System.

The backend already exists using NestJS, Prisma, and PostgreSQL.

Backend modules:

B0  Backend Foundation
B1  Prisma Core Schema
B2  Authentication
B3  Users + RBAC
B4  Facility / Departments / Services
B5  Patient
B6  Encounter
B7  Queue
B8  Triage
B9  Consultation
B10 Laboratory
B11 Prescription
B12 Pharmacy
B13 Inventory
B14 Billing
B15 Payments + Refunds
B16 Cash Reconciliation
B17 Notifications

Build the frontend in this exact sequence:

W0  Frontend Foundation + Design System
W1  Login + Auth State
W2  Role-Based App Shell + Navigation
W3  Patient Search / Register / Profile
W4  Reception + Encounter
W5  Nurse / Triage
W6  Doctor Workspace
W7  Laboratory Workspace
W8  Prescription + Pharmacy Workspace
W9  Inventory Workspace
W10 Billing Workspace
W11 Payments + Refunds + Cashier
W12 Cash Reconciliation
W13 Notifications + Realtime Operations
W14 Admin + Reports + Audit
W15 Error / Offline UX

Architecture rules:

1. Inspect the relevant backend module before implementing each phase.
2. The current backend API is the source of truth.
3. Use exact routes, DTOs, enum names, response shapes, pagination, and role names.
4. Do not invent frontend API contracts when backend contracts already exist.
5. Do not rewrite working backend code merely to simplify the frontend.
6. Use one Next.js application for all roles.
7. Backend RBAC is authoritative.
8. Backend workflow/state transitions are authoritative.
9. Use TanStack Query for server state.
10. Use Zustand only for small client/session state where necessary.
11. Use React Hook Form + Zod.
12. Use one centralized Axios client.
13. Keep API requests in feature API modules.
14. Do not hardcode departments, services, tests, medicines, roles, or IDs if backend APIs provide them.
15. Prevent duplicate mutations.
16. Use idempotency for sensitive commands when backend supports it.
17. Never mark a clinical/financial action successful until the backend confirms it.
18. Never silently queue unsafe clinical or financial writes offline.
19. Keep patient identity obvious in all clinical workspaces.
20. Do not silently discard unsaved clinical data.
21. Keep REST canonical even when realtime is added.
22. Keep architecture simple and maintainable.
23. Complete and validate each phase gate before moving to the next.

Before W1, create docs/frontend-backend-contract.md containing the confirmed backend contracts.

Start with W0.

After each phase, report:
- completed work
- backend endpoints used
- enums used
- files added/changed
- validation performed
- mismatches/issues
- phase gate PASS/FAIL
- readiness for next phase
```

---

# 37. Full System Workflow

```text
LOGIN
  ↓
ROLE SHELL
  ↓
PATIENT
  ↓
ENCOUNTER
  ↓
RECEPTION QUEUE
  ↓
TRIAGE
  ↓
DOCTOR
  ↓
CONSULTATION
  ├──────────→ LAB
  ├──────────→ PRESCRIPTION
  ↓
PHARMACY
  ↓
INVENTORY
  ↓
BILLING
  ↓
PAYMENT / REFUND
  ↓
CASH RECONCILIATION
  ↓
REPORTING / AUDIT

Cross-cutting:
  Notifications
  Realtime
  Error / Offline UX
```

---

# 38. Final Architecture Principle

The frontend is not a second backend.

It should:

```text
collect input
display state
send commands
show backend results
```

The backend should:

```text
authorize
validate
transition workflow
calculate canonical financial state
mutate inventory
write audit logs
protect data integrity
```

This separation should remain unchanged through W0–W15.
