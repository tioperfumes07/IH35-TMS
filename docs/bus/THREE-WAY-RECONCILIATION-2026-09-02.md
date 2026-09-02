# THREE-WAY RECONCILIATION — Claude · Cursor agent 1 · Cursor agent 2

**2026-09-02 · verified against `origin/main be6f940d9b` and live Neon `br-fancy-credit-akjnd07a` (USMCA `5c854333-6ea5-4faa-af31-67cb272fef80`)**

**Canonical source (owner):** `/Users/jorgemunoz/Downloads/IH35-SEAT-INSTRUCTIONS-2026-09-02/THREE-WAY-RECONCILIATION-2026-09-02.md`  
**Pending register (owner xlsx, not committed):** `/Users/jorgemunoz/Downloads/IH35-SEAT-INSTRUCTIONS-2026-09-02/IH35-PENDING-REGISTER-2026-09-02.xlsx` — sheet **IH35 PENDING REGISTER**, 35 rows (summary in `CLAUDE-CURSOR-SYNC-RECONCILE-2026-09-02.md`).

## ANSWER: NOT FULLY RECONCILED — four named production gaps survive verification

---

## 1 · Claude was wrong three times today (same failure mode)

Every case was grepping a **guessed string** instead of reading the component.

| Row | What was claimed | What is on main | Who wins |
|---|---|---|---|
| **B1** | BUILT | `BookLoadModalV4.tsx:1589` still renders `AlwaysTrack load # (legacy)` | **Cursor / owner** — OPEN |
| **B3** | STILL OPEN | `:1627` `ReferenceSelect` + `createKind="historical_import_reason"` on the RIGHT | **Claude THREE-WAY** — BUILT |
| **Bill from load** | NO ENTRY POINT | `BillsReverseSection.tsx:81` → `/accounting/bills/vendor?load_id=…`; wired in `LoadDetailDrawer.tsx` | **Claude THREE-WAY** — BUILT (bill-payment from load still unverified) |

**Rule going forward:** rendered surfaces → read the component; schema/data → `information_schema` or live count.

---

## 2 · FOUR DISPUTES — production wins over “BUILT” inventory rows

### 2.1 · No company settlement **table**

Both Cursor inventories mark slice 20 / 5753 **BUILT**.

```sql
-- Neon 2026-09-02
SELECT count(*) FROM information_schema.tables WHERE table_name ILIKE '%company_settlement%';  --> 0
```

`TripProfitability.tsx` / `GET /api/v1/reports/trip-profitability` is a **read view** (“Company Settlements”). Close/lock/audit grain from Settlement 5753 PDF still needs a persistence layer. **P&L tie to $2,415.11 is not provable without it.**

### 2.2 · `accounting.bills.driver_uuid` does not exist

PR #19459 landed **`driver_id`**, `trailer_id`, `recover_from_driver`, `bill_lines.load_required` — not `driver_uuid`.

```sql
-- Neon columns on accounting.bills matching '%driver%'
driver_id uuid | recover_from_driver boolean
```

Road-repair → driver settlement path is **PARTIAL**, not BUILT.

### 2.3 · Driver bill still mints `B-`

```ts
// apps/backend/src/driver-finance/driver-bill-number.ts
return `B-${suffix}`;
```

GO-19 slice 03 / child numbers **NOT DONE** on live code.

### 2.4 · Miles not proved on load 13508

Code path **is** loosened (#19689, see §5). Live row is not proof:

| Field | Value |
|---|---|
| load_number | 13508 |
| miles_practical / miles_shortest / mileage_source | NULL / NULL / NULL |
| created_at | 2026-09-02T12:18:05.084Z |
| updated_at | 2026-09-02T12:18:05.084Z (identical — never written after create) |
| assigned_primary_driver_id | NULL |
| load_stops.location_id | 0 of 2 |

Lane catalog **does** have Indianapolis↔Laredo miles (`practical_miles` 1319.7 / 1331.1, `confidence` Check ZIP, `autofill_allowed` false). Rev C fills on `lane.fills`, not `autofill_allowed`.

---

## 3 · WHERE ALL THREE AGREE — treat as settled

- **GO-22 pre-settlement / settlement** is the blocker (tour close, loan pop-up, manual attach/detach, views).
- **Tour = settlement boundary.** Home 23918 Mines Rd, Laredo TX 78045. Close only in geofence with no load. **SB leg does not close it.**
- **Fuel is a truck cost**, never a driver settlement deduction (B1 hired drivers).
- **K2 combobox open** — baseline **268** (`scripts/ui-design-system-baseline.json`); **277** importer files on main today (EntityPicker 111 · SelectCombobox 158 · shared/Combobox 8). Count rose while row sat pending.
- **J1 open** — 997 off-scale sizes / 324 files (ratchet baseline committed on `be6f940d9b`).
- **C1 UUID sweep open** (after Cascade recount).
- **2 sample drivers** still in `mdata.drivers` (live).
- **A2 customer picker, A1 interchange, N1 expense, GO-24 locations, GO-16 miles component, A3 save, C6 guard** — built.
- **Standing truth (Neon):** journal_entries **0** · driver_settlements **0** · bills **0** · invoices **0** · loads **1** (13508 draft).

---

## 4 · CURRENCY — nobody stays current by hand

| Seat | Cited tip | Notes |
|---|---|---|
| Cursor INVENTORY-60H | `21aa0ba` | Doc on main is `be6f940d9b` (#19712) |
| Claude THREE-WAY | `88d3d88a1` | Older than current tip |
| Owner MASTER-V2 | `fea6b5976` | Intermediate |

**Finding:** at FAST-MERGE velocity, hand inventories are stale within hours. Durable fix = guard that fails when a row marked BUILT has no live artifact (table/column/route).

---

## 5 · Miles gate — owner YES “loose”; already shipped

**Not an open decision.** GO-16 Rev C / #19689:

- `lane-mileage.service.ts`: `fills = practical != null`; `autofill_allowed` audit-only.
- `BookLoadModalV4.tsx:619–620`: `if (!lane.fills) return;`
- All **3,338** `catalogs.lane_mileage` rows carry `practical_miles`.

13508 null miles = load never re-opened/saved through the wizard after the fix — **Chrome proof still owed**, not a gate decision.

---

## 6 · “Consolidate the four table” (owner item #84)

**Not comboboxes** (that is **K2** — four pickers: `Combobox.tsx` good · `EntityPicker` · `SelectCombobox` · `shared/Combobox`).

**Four competing table components** (GO-05 / MASTER-V2 §2E #56):

| Component | Role |
|---|---|
| `ParityTable` | Canonical QBO-parity grid (373 adopters) |
| `DataTable` | Legacy/alternate |
| `ResizableTable` | Legacy/alternate |
| `MobileOptimizedTable` | Legacy/alternate |

**43** raw `<table>` remain. Owner decision: consolidate onto **ParityTable** (or explicitly retire the three alternates). CC-3 lane when J1/K2 allow.

---

## 7 · Thirteen half-built → **8 remain** on Neon today (was 10 when only 3 tables existed)

Original 13 (`MAP-FINDINGS.md` / `GO-19-THIRTEEN-HALF-BUILT.md`). Status **2026-09-02 Neon**:

| # | Feature | Table / fix | Status |
|---|---|---|---|
| 1 | Bank drift alerts | `banking.reconciliation_drift_alerts` | **TABLE EXISTS** — Chrome/UI unverified |
| 2 | Predictive maintenance | `maintenance.predictive_alerts` | **TABLE EXISTS** |
| 3 | Late arrival aggregates | `dispatch.late_arrival_aggregates` | **TABLE EXISTS** |
| 4 | Accident liabilities | `safety.accident_liabilities` | **TABLE EXISTS** |
| 5 | Cargo sensor incidents | `dispatch.cargo_sensor_incidents` | **TABLE EXISTS** (schema dispatch, not telematics) |
| 6 | WO parts phantom | `inventory.parts` | **REPOINTED** → `maintenance.parts_inventory` (#19508) |
| 7 | WO labor rates phantom | `maintenance.labor_rates` | **REPOINTED** → `catalogs.labor_rates` (#19508) |
| 8 | Workers comp claims | `safety.workers_comp_claims` | **MISSING** — GO-20 slice E PENDING |
| 9 | Cooling customers | `mdata.customer_health_scores` | **MISSING** — DEFER launch, report UNAVAILABLE |
| 10 | Recommended fuel stops | `fuel.recommended_stops` | **MISSING** — DEFER launch |
| 11 | Fuel route recommendations | `fuel.route_recommendations` | **MISSING** — planner returns unavailable (reference behavior) |
| 12 | QBO health (wrong name) | `qbo.connections` | **BLOCKED** — use `integrations.qbo_connections`; delete health-deep |
| 13 | Plaid health | `banking.plaid_items` | **BLOCKED** — delete health-deep; use `bank_accounts.sync_status` |

**“10 remaining”** in Claude verdicts = 13 − 3 tables at time of that write. **Current count: 8** (5 tables + 2 repoints done; 6 still missing/deferred/blocked).

---

## 8 · CPA / questionnaire — six closed vs still open

### Already answered (do not re-ask) — cite `GO-19-OWNER-DECISIONS-CLOSED-2026-09-01.md`

| Decision | CPA / owner quote |
|---|---|
| Cutover $0 OB | `cpa_answers.txt` **L245**: *“The balances are 0.”* |
| Capitalize **$7,000** | Jorge 2026-09-01 + `cpa_answers.txt` **L300 A4-D6**; `capitalize-threshold.ts` `700_000` |
| Company settlement 5753 grain | Downloads `Company_Settlement_5753.pdf`; P&L **$2,415.11** |
| Accessorials under 4200 | 4210–4240 parented (Neon verified) |
| Escrow wiped / samples quarantined | GO-19-02 closed |
| Insurance samples reconciled | GO-12 L14 / GO-11 |

**Capitalize wiring:** `wo-ap-posting.service.ts:183` calls `decideRepairBooksTreatment` — **BUILT** (caveat: ≥$7k may 409 until `fixed_asset_default` owner-bound).

### Still open (not CPA)

| Decision | State |
|---|---|
| **5% net-pay floor vs full loan deduction at tour close** | Owner leaning: *“deducted completely first in my opinion”* (`IH35-MASTER-INVENTORY-2026-09-02.md` #66). Seat docs still mark **OPEN** — build both behind config; #19708 merged full auto-recovery (may conflict with blocking pop-up intent). |
| Consolidate four table components | Owner item #84 — **OPEN** |
| Build vs remove for 8 remaining half-built | Owner item #83 — **OPEN** per feature |
| Fuel advance HOLD-FOR-JORGE | **OPEN** |

`cpa_answers.txt` is **not in repo**; quotes above are from locked `GO-19-OWNER-DECISIONS-CLOSED` and Desktop/Downloads CPA packet.

---

## 9 · Corrected pending sequence NOW

Per owner xlsx + `NOW-ONE-SOURCE.md`:

1. **CC-3** — B1 remove `AlwaysTrack` (Plain English)
2. **CC-2** — Re-open 13508 in Chrome: miles fill → operator override → expense/bill/pay chain
3. **CC-1** — GO-22 only (presettlement query, settlement generator, tour close, loan pop-up with config for #81)
4. **CC-2** — J1 ratchet + K2 stop bleed (277→0 trapping pickers)
5. **CC-3** — C1 UUID sweep; prove `location_id` on a real load
6. **Cursor lead** — bus/deploy parity; no Book Load POST; no GO-22 code

**Wave A money (after 13508):** `driver_id` on bills → drop `B-` prefix → company settlement table → Load Costs tab.

---

## 10 · Cursor addendum to Claude doc (2026-09-02 PM)

- Confirmed Claude THREE-WAY on all four production disputes via independent Neon + source reads.
- **Dispute Claude wins:** bill vendor entry from load (`BillsReverseSection.tsx:78–85`); B3 built (`BookLoadModalV4.tsx:1620–1629`).
- **Dispute Claude wins on capitalize:** wired at `wo-ap-posting.service.ts:183` (MASTER-V2 #50 stale).
- **K2 count:** ratchet baseline 268; live grep 277 importers — REGRESSED.
- **Repo mirror path:** this file. Jorge-facing summary: `docs/bus/CLAUDE-CURSOR-SYNC-RECONCILE-2026-09-02.md`.
