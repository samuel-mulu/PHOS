# PHOS Clinic — Phase A trial on production PC (operator checklist)

Complete this on the clinic PC **after** copying updated scripts from the repo. **Do not** change `PHOS-Clinic-AutoStart` until steps 1–7 pass.

## Prerequisites

- [ ] Backup `E:\PHOS\scripts` → `E:\PHOS\scripts.bak-YYYYMMDD`
- [ ] Copy all files from repo `phos-backend/clinic/scripts\` to `E:\PHOS\scripts\` (include every `phos-*.ps1`)
- [ ] Folders exist or will be auto-created: `E:\PHOS\logs`, `E:\PHOS\run`, `E:\PHOS\state`

## Tests

1. [ ] `powershell -File E:\PHOS\scripts\phos-clinic-check.ps1` — integrity **OK**
2. [ ] `powershell -File E:\PHOS\scripts\phos-clinic.ps1 -StartOnly` — staff URL loads on LAN
3. [ ] Repeat step 2 **five times** — ports 80/3000/4001 each have **one** listener; no extra PowerShell spam
4. [ ] Review `E:\PHOS\logs\orchestrate-*.log` — `already_healthy` on repeats
5. [ ] Optional reboot with **AutoStart unchanged** — morning verify
6. [ ] Monitor 3–5 clinic days — no manifest errors
7. [ ] Approve Phase B → create `PHOS-Clinic-Supervisor` per TASK-SCHEDULER.md

## Rollback

Restore `scripts.bak-*` over `E:\PHOS\scripts`. Clear `E:\PHOS\run\*.json` if needed.
