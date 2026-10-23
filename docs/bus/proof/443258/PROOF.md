# ROUND 443.258-B PROOF — Codex D002–D032 shared class fixes (Cursor)

Deadline: 10-23 06:00 UTC. Fast-merge law.

## Classes shipped

| Class | Fix |
|---|---|
| D003/D015/D021/D022/D026/D031 names | `formatPersonName` → `formatDisplayName`; `entityLabel` for person/org nouns; DispatchBoard never initials; EntityLinkOrTombstone uses entityLabel |
| D004/D025/D029/D030 dates | `formatDate` = MM/DD/YYYY (`formatDateUS`); Load Costs PU/DEL; Home KPI; WeeklyRevenueChart axis MM/DD + tooltip MM/DD/YYYY; scheduler dates |
| D002 money | `formatMoney` / `formatMoneyCents`; HomeKpiCard; Fuel Questions Amount |
| D018/D028/D032 input height | `paritySizing.fieldHeightPx=32`, `PARITY_FIELD_HEIGHT_CLASS=h-8`; DatePicker default h-8; Create Task / Assign Fuel Card / Temp Cover |
| D006–D014 Settlements tabs | 443.254 fold-in: all Settlements mounts under `/driver-finance/*` (sidebar `settlements`) |
| D016/D017 Fuel Questions | `FuelQuestionsPanel` → `ParityTable` (gear + sortable), `storageKey=fuel-assignment-questions` |
| D024 Book Load no pay rate | removed Driver pay rate / mi from `BookLoadEquipmentSection` |
| Book Load miles | MilesStrip: Google practical + short ALWAYS under boxes; empty leg always under; lane history select→type unchanged |

## 443.257 fold-in (same PR)

- Truck Line Available: always "Assign a load →"
- Driver picker: Active/Probation USMCA (`active_definition=hr_status`), proper case via EntityPicker
- Missing CDL/med dates = pre-dispatch warning, not hard block

## Guards / tests

- `MilesStrip.test.tsx` — Google practical + short always visible (5/5 pass)
- `verify-back-returns-to-module-parent.mjs` (from 254)

## Live proof (fill after Chrome)

- PR: (this PR)
- sha tip: (after merge)
- healthz: `GET https://ih35-tms.onrender.com/api/v1/healthz/shallow`
- Screenshots: Book Load TripType + MilesStrip Google lines; Settlements tab bar; Fuel Questions gear; driver name proper case
