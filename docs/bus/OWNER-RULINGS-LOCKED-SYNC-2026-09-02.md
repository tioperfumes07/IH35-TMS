# OWNER RULINGS LOCKED SYNC — 2026-09-02

**Owner confirmed (Jorge chat, same session).** Single downloadable sync for all seats.  
**Verified:** Neon `tiny-field-89581227` / branch `br-fancy-credit-akjnd07a` · USMCA `5c854333-6ea5-4faa-af31-67cb272fef80` · repo `origin/main` tip at write time.

**Primary sources (owner):**

| Artifact | Path |
|---|---|
| Three-way reconciliation | `/Users/jorgemunoz/Downloads/IH35-SEAT-INSTRUCTIONS-2026-09-02/THREE-WAY-RECONCILIATION-2026-09-02.md` |
| Pending register (xlsx, not committed) | `/Users/jorgemunoz/Downloads/IH35-SEAT-INSTRUCTIONS-2026-09-02/IH35-PENDING-REGISTER-2026-09-02.xlsx` |
| Repo mirrors | `docs/bus/THREE-WAY-RECONCILIATION-2026-09-02.md` · this file |

---

## Sync verdict

**LOCKED — stop re-asking the seven owner rulings below.** Law + sequence align across seats. Production gaps in §7 remain **build/Chrome work**, not new policy meetings.

Hand inventories stale within hours at FAST-MERGE velocity — cite **this file + THREE-WAY + live Neon**, not yesterday’s SHA.

---

## 1 · Five-percent net-pay floor — **LOCKED (not open)**

**Source:** `docs/lockdown/00_LOCKED_DECISIONS.md` §9.2–§9.3 · CPA ANSWERS.docx (5% default + Owner/Admin override).

| Rule | Locked answer |
|---|---|
| Default floor | **5% of gross** — editable per settlement |
| UI | **Accept / Edit-amount** on every settlement that hits the floor |
| Termination | Operator may override floor and deduct up to **full final check** |
| Recovery order | **Pay first**, then escrow for shortfall only |
| Charge count | **One charge per event** (kill double-charge: app chargeback + escrow trigger) |

**#19708 is a defect, not a policy fork:** missing Accept/Edit control + missing **who-chose register** (audit of operator override). Do not re-litigate “full loan first vs 5% floor” — both live behind the locked resolver; wire UI + register.

**CC-1:** GO-22 settlement stack implements §9.2 Accept/Edit + who-chose register on top of existing floor math.

---

## 2 · Thirteen half-built — Jorge correction (not “10 remaining”)

### BUILT tables (Neon `to_regclass` — four owner-named)

| Table | Schema |
|---|---|
| `reconciliation_drift_alerts` | `banking` |
| `predictive_alerts` | `maintenance` |
| `accident_liabilities` | `safety` |
| `late_arrival_aggregates` | `dispatch` |

Table existence ≠ Chrome done — UI/wiring still owed per feature.

### NO new tables (GO-20)

| Phantom | Canonical repoint |
|---|---|
| `inventory.parts` | `maintenance.parts_inventory` (#19508) |
| `maintenance.labor_rates` | `catalogs.labor_rates` (#19508) |

### Deferred / blocked (do not build new tables)

| Item | Action |
|---|---|
| 5 + 8 (cooling customers, recommended fuel stops) | **UNAVAILABLE** at launch — not empty grids |
| 12 + 13 (QBO health, Plaid health) | **Delete health-deep** wrong names; use `integrations.qbo_connections` + `bank_accounts.sync_status` |

### Real gap (only missing table owner named)

| Table | Status |
|---|---|
| `safety.workers_comp_claims` | **MISSING** — GO-20 slice E |

### Cargo sensor dispute — **RESOLVED (Neon 2026-09-02 PM)**

```sql
-- br-fancy-credit-akjnd07a, USMCA scope not required for to_regclass
SELECT
  to_regclass('telematics.cargo_sensor_incidents')  --> NULL
  to_regclass('dispatch.cargo_sensor_incidents')    --> dispatch.cargo_sensor_incidents
  to_regclass('dispatch.cargo_sensor_readings')     --> dispatch.cargo_sensor_readings
  to_regclass('dispatch.cargo_sensor_alerts')       --> NULL
```

**Verdict:** Canonical lifecycle is **`dispatch.cargo_sensor_incidents`** + **`dispatch.cargo_sensor_readings`**.  
`telematics.cargo_sensor_incidents` is a **phantom** — repoint any stale grep/docs (GAP-64 spec, aggregator was already fixed on main). Migrations: `202606080219_cargo_sensor_readings.sql`, `202613390002_go20_d_cargo_sensor_incidents.sql`.

---

## 3 · Consolidate “four tables” — **React grids, not DB**

Owner item #84 = **four competing table components**, not database tables.

| Keep | Retire (convert adopters, then delete) |
|---|---|
| `ParityTable` | `DataTable` · `shared/ResizableTable` · `shared/MobileOptimizedTable` |

**Pickers (K2):** KEEP `components/Combobox.tsx`; retire `EntityPicker` · `SelectCombobox` · `shared/Combobox`.

**CC-3:** ParityTable consolidation + C1 UUID sweep.  
**CC-2:** J1 ratchet + K2 Combobox convergence (277 trapping importers → 0).

---

## 4 · USMCA blank + sample drivers — **owner order**

| Rule | Action |
|---|---|
| No sample/test/demo/probe/hop transactions in USMCA | Everything shows **0/blank** except real bank feed |
| Bank exception | **Only** uncategorized bank transactions since **Dec 2025** may appear |
| Sample drivers | **2** remain in `mdata.drivers` (`is_sample_data=true`, Neon verified) — **quarantine/void; never leave samples** |

Reference purge law: `docs/lockdown/SAMPLE-DATA-PURGE-LAW-2026-09-02.md`.

**CC-1:** kill 2 sample drivers as part of GO-22 hygiene.

---

## 5 · Fuel advance — **LOCKED (Jorge 2026-09-02 — HOLD-FOR-JORGE cleared)**

USMCA has **no owner-operators** (B1 hired drivers only).

**Owner word (verbatim — do not re-ask):**

> If **we** send the driver a fuel advance (cash so he can pay at the pump) → that is **IH35/company money**, **NOT a driver responsibility**, **NEVER a driver settlement deduction**.
>
> If a **broker** sends a fuel cash advance → it is a **prepayment toward the customer invoice** (AR reduction / unearned/prepaid against that load invoice), not a driver liability.

| Path | Locked treatment | CC-1 build |
|---|---|---|
| **IH35 / company fuel advance** (cash at pump) | Company/truck operating cost — **never** settlement deduction | Post as expense/truck cost; **remove any code** that deducts company fuel advances from driver pay |
| **Broker fuel cash advance** | Prepayment toward customer invoice — AR reduction / unearned or prepaid against that load invoice | **Not** driver liability; wire distinct from company advance |
| Fuel-card **overage** / personal / non-fuel (separate from advance) | Driver liability — BANK-DOM-06: 150 gal / ~$900 per swipe, approve-then-recover, `fuel_overage_receivable` | Settlement recovery **after** approve only |

**CC-1 (B8):** implement **both paths distinctly** in Book Load + settlement rails. Audit/remove settlement deduction paths for company fuel advances.

---

## 6 · Miles gate “loosen” — **CLOSED**

**#19689 / GO-16 Rev C** already shipped:

- `lane.fills` when `practical_miles` present; `autofill_allowed` audit-only only.
- Load **13508** null miles = wizard never re-saved (`updated_at = created_at`) — **Chrome proof owed**, not a gate decision.

---

## 7 · Three-way production disputes — **still true until fixed**

From `docs/bus/THREE-WAY-RECONCILIATION-2026-09-02.md` (independent Neon + source re-verify):

| # | Gap | State |
|---|---|---|
| 1 | No `company_settlement` **table** | View only — close/lock/audit grain missing |
| 2 | `accounting.bills.driver_uuid` | Column is **`driver_id`** — road-repair → settlement **PARTIAL** |
| 3 | Driver bill mint | Still **`B-`** prefix (`driver-bill-number.ts`) — GO-19 slice 03 not done |
| 4 | Load 13508 miles | NULL on live row — operator Chrome walk not filed |

Wave A money (after 13508 Chrome): `driver_id` bills path → drop `B-` → company settlement table → Load Costs tab.

---

## 8 · Remaining open (short)

| Topic | Owner state |
|---|---|
| Fuel advance **implementation** (§5) | Policy **closed** — CC-1 B8 build: two distinct paths + purge company-advance deductions |
| Cargo sensor | **Closed** at schema (§2) — incident worker + Owner Home Attention Chrome still owed |
| `safety.workers_comp_claims` | Real table gap — GO-20 E |
| Four table + four picker consolidation | Open build (#84 / K2) |
| Three-way four gaps (§7) | Open until Wave A lands |

**Do not re-open:** 5% floor policy · miles gate · fuel advance paths (§5) · USMCA blank order · cargo schema namespace · HOLD-FOR-JORGE fuel.

---

## 9 · NOW sequence for seats

Per owner xlsx + THREE-WAY + this sync:

| Order | Seat | Row |
|---|---|---|
| 1 | **CC-3** | B1 — remove AlwaysTrack legacy label (Plain English) |
| 2 | **CC-2** | Re-open load **13508** Chrome: miles fill → operator override → expense/bill/pay chain |
| 3 | **CC-1** | **GO-22** only — presettlement, settlement generator, tour close, loan pop-up; **§9.2 Accept/Edit + who-chose register**; kill 2 sample drivers; keep USMCA blank |
| 4 | **CC-2** | J1 ratchet + K2 Combobox consolidate (`Combobox.tsx` wins) |
| 5 | **CC-3** | ParityTable consolidate (retire 3 legacy grids) + C1 UUID sweep |
| 6 | **Cursor lead** | Bus fan-out · deploy parity · FAST-MERGE green docs/code overflow — **never POST Book Load** · **not GO-22 code** |

**Standing:** Never POST Book Load · never seat financial fixtures · USMCA only · merge on green + proof.

---

## 10 · Neon proof bundle (cargo sensor + samples)

```
cargo_sensor:
  telematics.cargo_sensor_incidents  = NULL
  dispatch.cargo_sensor_incidents    = EXISTS
  dispatch.cargo_sensor_readings     = EXISTS

mdata.drivers (USMCA):
  is_sample_data=true count = 2
  total = 167
```

---

*End sync — fan-out from `docs/bus/INBOX-CURSOR.md` TOP line.*
