# PHOS Clinic — reliability runbook

Operational guide for startup, health supervision, deploy, rollback, and backups on the clinic PC (`E:\PHOS`).

## Architecture (lightweight)

- **Logon:** Existing `PHOS-Clinic-AutoStart` → `Start-PHOS.cmd` → `phos-clinic.ps1 -StartOnly` (unchanged entry through Phase A validation).
- **Orchestrator:** Idempotent start with manifest checks, HTTP readiness, PID registry under `E:\PHOS\run\`.
- **Supervisor (Phase B):** Optional task runs `phos-supervisor.ps1 -Once` every 5 minutes.
- **Deploy (Phase C):** Manual `phos-deploy-frontend.ps1 -Confirm` — never runs at logon.

## Logs and state

| Path | Purpose |
|------|---------|
| `E:\PHOS\logs\orchestrate-YYYYMMDD.log` | Startup events |
| `E:\PHOS\logs\supervisor-YYYYMMDD.log` | Health / recovery |
| `E:\PHOS\logs\deploy-YYYYMMDD.log` | Release deploy |
| `E:\PHOS\run\{api,web,caddy}.json` | Owned process registry |
| `E:\PHOS\state\degraded.json` | Action required (integrity, foreign PID, caps) |
| `E:\PHOS\state\current-frontend-release.json` | Active release (Phase C) |

Logs are JSON lines; no patient data or secrets.

## Phase A — deploy scripts to clinic PC (after approval)

1. Backup: `Copy-Item E:\PHOS\scripts E:\PHOS\scripts.bak-YYYYMMDD -Recurse`
2. Copy from repo `phos-backend/clinic/scripts\*.ps1` and updated `*.cmd` to `E:\PHOS\scripts\`
3. Create folders: `E:\PHOS\logs`, `E:\PHOS\run`, `E:\PHOS\state`
4. Manual test (clinic closed or low traffic):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "E:\PHOS\scripts\phos-clinic.ps1" -StartOnly
```

5. Run **five times** while healthy — confirm single listener on ports 80, 3000, 4001.
6. Run `phos-clinic-check.ps1` — integrity section should pass.
7. Keep AutoStart task **unchanged** for 3–5 days; monitor logs.

### Phase A rollback

Restore `E:\PHOS\scripts` from backup. Delete `E:\PHOS\run\*.json` if stale. No database or frontend tree changes.

## Phase B — enable supervisor (after Phase A stable)

Create task **PHOS-Clinic-Supervisor** (see [TASK-SCHEDULER.md](./TASK-SCHEDULER.md)). Test: stop owned web process only; within one interval `/login` should recover.

### Phase B rollback

Disable supervisor task only. Phase A scripts remain.

## Phase C — frontend release deploy

**Maintenance window recommended.** Staff may need to refresh browsers.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "E:\PHOS\scripts\phos-deploy-frontend.ps1" -Confirm
```

Or build-only via:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "E:\PHOS\scripts\phos-clinic.ps1" -BuildOnly -Confirm
```

Rollback: edit `E:\PHOS\state\current-frontend-release.json` to previous `releaseId` / `standaloneDir`, then `-StartOnly`.

Keep at least **two** releases under `E:\PHOS\releases\frontend\`.

## When web shows manifest errors

1. Do **not** run `next build` while web is running.
2. Check `phos-clinic-check.ps1` integrity lines.
3. If manifests missing on disk → planned `-BuildOnly -Confirm` or `phos-deploy-frontend.ps1 -Confirm` after stopping web (deploy script stops **owned** web only).
4. If manifests present → restart web only: supervisor or manual `-StartOnly`.

## Backups

- **Weekly:** pg_dump to `E:\PHOS\backups\` (see [CLINIC-PRODUCTION-RUNBOOK.md](../../CLINIC-PRODUCTION-RUNBOOK.md)).
- **Quarterly:** verify backup with `pg_restore --list` or restore to a **separate** test database name.
- **Before script updates:** copy `E:\PHOS\scripts` to `scripts.bak-*`.

## Power failure

1. Boot → PostgreSQL (Automatic) → clinic user logon → AutoStart.
2. If degraded: AnyDesk → read `E:\PHOS\logs\orchestrate-*.log` and `state\degraded.json`.
3. Run `phos-clinic-check.ps1`.
4. `-StartOnly` once manually if needed; do not rebuild until integrity check fails.

## Prisma on API restart

`npm run start:render` runs `prisma migrate deploy` on each API start. This is intentional for schema updates. Supervisor caps API restarts to avoid repeated migration attempts during incidents. No automatic DB reset is performed by these scripts.

## Multi-user LAN

Brief interruption on component restart; staff refresh browser. Sessions may require re-login after long web outage.

## AnyDesk

Remote support uses the same scripts and logs. Desktop and AnyDesk are independent of PHOS health checks.
