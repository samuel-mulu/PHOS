# Clinic PC setup (E:\PHOS)

Git repos are **separate**: backend = `PHOS`, frontend = `PHOS-Frontend`.  
This `clinic/` folder ships with **PHOS backend** — pull backend, then copy scripts to `E:\PHOS\scripts\`.

## One-time on clinic PC

```powershell
New-Item -ItemType Directory -Path "E:\PHOS\scripts","E:\PHOS\nginx" -Force
```

After `git pull` in backend repo (or copy from dev USB):

```powershell
Copy-Item "E:\PHOS\PHOS\clinic\scripts\*.ps1" "E:\PHOS\scripts\"
Copy-Item "E:\PHOS\PHOS\clinic\nginx\Caddyfile" "E:\PHOS\nginx\"
```

If backend lives elsewhere, copy from `clinic\scripts\` in the repo you pulled.

## Every update

```powershell
cd E:\PHOS\PHOS
git pull

cd E:\PHOS\PHOS-frontend
git pull

powershell -ExecutionPolicy Bypass -File "E:\PHOS\scripts\build-clinic.ps1"
powershell -ExecutionPolicy Bypass -File "E:\PHOS\scripts\start-clinic.ps1"
```

Frontend polyfill (payments on LAN): pull **PHOS-Frontend** and rebuild.
