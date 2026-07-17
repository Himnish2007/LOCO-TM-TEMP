# HIMNISH RAIP — Loco Traction Motor Temperature Monitoring System

Loco version of the EMU Motor Coach TM Monitoring platform — same architecture, same
feature set (Digital Twin, Heatmap, GIS Map, Alerts, Analytics, Predictive, Loco Transfer,
Maintenance, Admin CRUD, Notifications, Reports, Health Index, Fleet Assistant, Audit),
adapted for **locomotives with 6 traction motors each** (12 monitored points: TM1–TM6 × DE/NDE).

This is a **new, separate deployment** — it does NOT touch the live production system at
`himnish2007-loco-temp-monitor-production.up.railway.app`. Test it fully before cutover.

---

## What's different from the EMU system

| | EMU system | This Loco system |
|---|---|---|
| Physical asset | Coach (motor coach) | Loco (WAP-7 / WAG-9 / WAM-4 etc.) |
| Grouping | EMU rake/formation | Loco Shed |
| Sensors per asset | Variable (per coach TM layout) | Fixed 12: TM1-DE, TM1-NDE … TM6-DE, TM6-NDE |
| Data source | Wireless sensors → LTE/MQTT | **Existing RUT200 Modbus TCP push (unchanged)** |
| Default thresholds | Warn 70°C / High 80°C / Crit 90°C | Warn 120°C / High 140°C / Crit 160°C (per your manual) |
| RBAC | 5 roles | Same 5 roles (super_admin, railway_hq, depot_admin, maintenance_eng, observer) |

## RUT200 / hardware — nothing changes

`rut200/himnish_push.lua` in this repo is **byte-for-byte identical** to your current
production script. Registers (1584–1606), coachId format (`WAP7-30211`), Modbus TCP
target (192.168.1.12:502), and the push payload shape are untouched:

```json
{"apiKey":"himnish_rut200_key_2024","coachId":"WAP7-30211","motors":[...12 values...],"ts":"..."}
```

The server exposes **`POST /api/push`** (no `/v1`) — the exact path and payload shape the
script already sends to. `PUSH_API_KEY` defaults to `himnish_rut200_key_2024` to match the
script's hardcoded key, so no script edit is needed to test against this new deployment —
only the URL (`local S=`) needs to point here once you're ready, and that's the only line
in the script you'll ever touch, whenever you choose to cut over.

A new locomotive auto-registers on its first push — no manual "Add Loco" step required
(same self-registration behavior the EMU ingest already has).

---

## Local test run

```bash
npm install
npm run dev          # DEMO_MODE=true — synthetic fleet data, no hardware needed
```
Open http://localhost:8080 — login `admin / himnish@2025` (change immediately in Admin).

Simulate a real RUT200 push:
```bash
curl -X POST http://localhost:8080/api/push -H "Content-Type: application/json" \
  -d '{"apiKey":"himnish_rut200_key_2024","coachId":"WAP7-30211","motors":[45,44,50,49,60,58,55,54,70,68,62,61],"ts":"2026-07-17T10:00:00Z"}'
```

## Deploy to Railway (new, separate app)

1. Create a **new** GitHub repo (e.g. `himnish-loco-tm-monitor-v2`) and Railway project —
   do not push to the existing `himnish2007-loco-temp-monitor` repo/app until you're ready.
2. Push this folder's contents.
3. Railway → Variables: set `PUSH_API_KEY=himnish_rut200_key_2024`, `DATA_API_KEY`,
   `JWT_SECRET`, `DEMO_MODE=false`, optionally `DATABASE_URL` for Postgres history.
4. Attach a Volume mounted at `/data` and set `DATA_DIR=/data` so locos/users/thresholds
   survive redeploys.
5. Test with `curl` against the new Railway URL (payload above) before touching the RUT200.
6. **Cutover, when ready:** SSH into the RUT200, edit only the `local S=` line in
   `/etc/himnish_push.lua` to the new URL, restart the script. Nothing else changes.

See `DEPLOY.md` and `GO-LIVE-CHECKLIST.md` (carried over from the EMU project) for the
full Railway/Volume/Postgres walkthrough — steps are identical, just point at this repo.

---

## Folder structure

```
server.js            Express entrypoint (mounts /api/v1 dashboard API + /api/push alias)
src/                  api.js, store.js, ingest.js, auth.js, config.js, notify.js,
                      reports.js, poller.js, mqtt.js, copilot.js, demo.js
public/index.html     Full dashboard SPA (all EMU tabs, relabeled for locos)
rut200/               himnish_push.lua, rc.local, setup guide — UNCHANGED from production
```
