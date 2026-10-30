# Paste this into ChatGPT (or any assistant) — PHOS clinic server help

Copy everything below the line into a new chat when you need help on the **clinic PC**.

---

I run **PHOS** (clinic software) **offline** on one Windows PC. Other PCs use **only a browser**.

## My setup

| Item | Value |
|------|--------|
| Server PC user | Hiwet Clinic (example) |
| Data drive | **E:\PHOS** |
| Backend code | **E:\PHOS\PHOS** (git: https://github.com/samuel-mulu/PHOS) |
| Frontend code | **E:\PHOS\PHOS-frontend** (git: https://github.com/samuel-mulu/PHOS-Frontend) |
| PostgreSQL | Local, database **phos**, port **5432** |
| API port | **4001** (`.env` in backend) |
| Web (Next standalone) | **127.0.0.1:3000** |
| Gateway | **Caddy** at **E:\PHOS\bin\caddy.exe**, config **E:\PHOS\nginx\Caddyfile**, port **80** |
| Staff browser URL | **http://192.168.1.9/** (LAN IP may change; check with `ipconfig`) |
| Frontend API URL at build | **/api/v1** (same host via Caddy, no IP in build) |

## Scripts on server (edit paths at top of phos-clinic.ps1)

- **E:\PHOS\scripts\phos-clinic.ps1** — build + start (or `-StartOnly` / `-BuildOnly`)
- **E:\PHOS\scripts\phos-clinic-check.ps1** — show IP, folders, ports, what is missing
- Copy scripts from repo after `git pull`: **E:\PHOS\PHOS\clinic\scripts\**

## What I run (simple)

**Check PC:**

```powershell
powershell -ExecutionPolicy Bypass -File "E:\PHOS\scripts\phos-clinic-check.ps1"
```

**Start clinic (morning, no rebuild):**

```powershell
powershell -ExecutionPolicy Bypass -File "E:\PHOS\scripts\phos-clinic.ps1" -StartOnly
```

**After git pull (rebuild + start):**

```powershell
cd E:\PHOS\PHOS; git pull
cd E:\PHOS\PHOS-frontend; git pull
powershell -ExecutionPolicy Bypass -File "E:\PHOS\scripts\phos-clinic.ps1"
```

## Three windows when running

1. API — `npm run start:render` in **E:\PHOS\PHOS**
2. Web — `node server.js` in **E:\PHOS\PHOS-frontend\.next\standalone**
3. Caddy — `caddy run --config Caddyfile` in **E:\PHOS\nginx**

## Database

- pgAdmin: host **localhost**, DB **phos**
- Backend **DATABASE_URL** in **E:\PHOS\PHOS\.env** (password URL-encoded if special chars)

## Common problems

- Payment error **crypto.randomUUID** → need latest frontend pull + **build** (polyfill in idempotency.ts)
- **404 consultation** in browser console → often normal for visits without consult
- **400 invoice** → visit may have nothing to bill; need service at reception
- **git** only inside **PHOS** and **PHOS-frontend** folders, not parent folder
- **No Docker** on clinic PC — Node + Postgres + Caddy only

## What I need from you

[Paste here: error message, screenshot text, or output of phos-clinic-check.ps1]

Help me step by step for **this clinic PC only**. Keep answers short numbered steps.

---
