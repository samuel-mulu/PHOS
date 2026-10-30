# Clinic PC setup (E:\PHOS)

Git repos are **separate**: backend = `PHOS`, frontend = `PHOS-Frontend`.  
This `clinic/` folder ships with **PHOS backend** — pull backend, then copy scripts to `E:\PHOS\scripts\`.

## One-time on clinic PC

```powershell
New-Item -ItemType Directory -Path "E:\PHOS\scripts","E:\PHOS\nginx" -Force
```

After `git pull` in backend repo (or copy from dev USB):

```powershell
Copy-Item "E:\PHOS\PHOS\clinic\scripts\*.ps1","E:\PHOS\PHOS\clinic\scripts\*.cmd" "E:\PHOS\scripts\"
Copy-Item "E:\PHOS\PHOS\clinic\nginx\Caddyfile" "E:\PHOS\nginx\"
```

Edit paths at the top of **`E:\PHOS\scripts\phos-clinic.ps1`** if folders differ.

**Task Scheduler:** see [TASK-SCHEDULER.md](./TASK-SCHEDULER.md) — program `E:\PHOS\scripts\Start-PHOS.cmd`, start in `E:\PHOS\scripts`.

**Reliability (startup, supervisor, deploy):** see [RELIABILITY-RUNBOOK.md](./RELIABILITY-RUNBOOK.md). Copy all `phos-*.ps1` modules together with `phos-clinic.ps1`.

## Every day or after update

**One file (build + start):**

```powershell
powershell -ExecutionPolicy Bypass -File "E:\PHOS\scripts\phos-clinic.ps1"
```

**Start only** (no rebuild, faster morning start): double-click **`E:\PHOS\scripts\Start-PHOS.cmd`** or:

```powershell
powershell -ExecutionPolicy Bypass -File "E:\PHOS\scripts\phos-clinic.ps1" -StartOnly
```

**Build only** (after `git pull`, before restart):

```powershell
powershell -ExecutionPolicy Bypass -File "E:\PHOS\scripts\phos-clinic.ps1" -BuildOnly
```

Then pull + start:

```powershell
cd E:\PHOS\PHOS; git pull
cd E:\PHOS\PHOS-frontend; git pull
powershell -ExecutionPolicy Bypass -File "E:\PHOS\scripts\phos-clinic.ps1"
```

Frontend polyfill (payments on LAN): pull **PHOS-Frontend** and rebuild.
