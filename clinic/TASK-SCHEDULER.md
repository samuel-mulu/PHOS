# PHOS — Windows Task Scheduler (start only)

Starts **API + Web + Caddy** via `Start-PHOS.cmd`. Does **not** rebuild.  
PostgreSQL should be a Windows service set to **Automatic** (separate from this task).

## Create the task

1. **Win + R** → `taskschd.msc` → Enter.
2. **Create Task…** (not “Create Basic Task”).

### General

| Field | Value |
|--------|--------|
| Name | `PHOS Start` |
| Run only when user is logged on | **Yes** (clinic user, e.g. Hiwet Clinic) |
| Run with highest privileges | Only if Caddy on port 80 required Admin when you tested manually |

### Triggers → New…

- **Begin the task:** At log on  
- **Specific user:** clinic account  
- Optional: **Delay task for:** 1 minute (Wi‑Fi / PostgreSQL)

*Alternative:* Daily at **7:30 AM** Mon–Sat if the PC is **already logged in** by then.

### Actions → New…

| Field | Value |
|--------|--------|
| Action | Start a program |
| **Program/script** | `E:\PHOS\scripts\Start-PHOS.cmd` |
| **Start in (optional)** | `E:\PHOS\scripts` |

Do **not** put the `.cmd` path only in “Program” without **Start in** if the script fails; both lines above are the recommended pair.

### Conditions

- Uncheck **Start the task only if the computer is on AC power** (laptops).

### Settings

- **If the task is already running, do not start a new instance**
- Uncheck **Stop the task if it runs longer than…** (or use a long limit)

3. **OK** → enter password if prompted.

## Test

Right-click **PHOS Start** → **Run**.  
Three PowerShell windows should open. Browser: **http://192.168.1.4/** (not `:3000`).

## Manual start (same as task)

Double-click `E:\PHOS\scripts\Start-PHOS.cmd`.

## After `git pull`

Copy scripts from `E:\PHOS\PHOS\clinic\scripts\` to `E:\PHOS\scripts\`, then run **Build-PHOS.cmd** or **Build-Frontend-Only.cmd** once — not every scheduled run.

---

## Reliability phases (clinic-adjusted plan)

### Phase A — keep AutoStart unchanged

If your task is named **`PHOS-Clinic-AutoStart`**, leave it pointing at **`E:\PHOS\scripts\Start-PHOS.cmd`** until manual trials pass. The updated `phos-clinic.ps1 -StartOnly` adds idempotent startup, manifest checks, and logs under `E:\PHOS\logs` without changing the task action.

Optional (document only until you approve): add **Delay task for 1–2 minutes** on logon if drive `E:` or PostgreSQL is sometimes slow after reboot.

Future (after Phase A verified): replace action with `Start-PHOS-Task.cmd` (no `pause`) — same `-StartOnly` behavior, cleaner Task Scheduler history.

### Phase B — health supervisor (separate task, optional)

Create **`PHOS-Clinic-Supervisor`** only after Phase A is stable on the clinic PC.

| Field | Value |
|--------|--------|
| General | Run only when user is logged on (same clinic user) |
| Trigger | At log on **and** repeat every **5 minutes** for duration **Indefinitely** (or 12 hours if you prefer a cap) |
| Action | Start a program |
| Program | `powershell.exe` |
| Arguments | `-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "E:\PHOS\scripts\phos-supervisor.ps1" -Once` |
| Start in | `E:\PHOS\scripts` |
| Settings | If the task is already running, do not start a new instance |

Test: Task Scheduler → Run once → check `E:\PHOS\logs\supervisor-*.log`.

### Phase C — deploy is never scheduled

Frontend releases use **`phos-deploy-frontend.ps1 -Confirm`** or **`phos-clinic.ps1 -BuildOnly -Confirm`** during a maintenance window only. See [RELIABILITY-RUNBOOK.md](./RELIABILITY-RUNBOOK.md).
