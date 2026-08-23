# CASCADE + DEVIN — VERTICAL CERTIFIED AUDIT (owner 2026-08-23)

**THIS is the instruction file.** Read it end to end before clicking.  
Companion pack (split / repo / SHA): `docs/audit/CASCADE-DEVIN-CERTIFIED-U14-AUDIT-PACK-2026-08-23.md`  
**Gold linkage (accident + insurance claim web — mandatory):** `docs/audit/ACCIDENT-CLAIM-WEB-AUDIT-MODEL-2026-08-23.md`  
Trackers: `docs/audit/scenario-trackers/certified-u14/`

**Lane:** audit CERTIFIED Urgent-14 modules only. **AUDIT ONLY — do not fix, do not code, do not open product PRs.** Write findings + recommendations in OUTBOX and `docs/audit/scenario-trackers/certified-u14/`. Cursor/CC repair later. **Not** a 15th plan. **Do not** recertify (Cursor owns the Status table). **Do not** enter OPEN prefixes `/lists` `/legal` `/customers` `/drivers` `/fleet`. **Do not** `trigger_deploy`. **Do not** remake proven TESTs / Close / Book Load.

**Complete** = for **each tab / leaf** on that module: Fully-Wired **1–12** + DoD **A–E** + VERIFY **1–8** + **every Required matrix column** on that leaf + forward **and** reverse live click + picker `+ Add new` first row + **security (RLS/opco/Owner-unscoped)** + **the accident/claim gold web** (`ACCIDENT-CLAIM-WEB-AUDIT-MODEL`) as it **touches this module** + a **CONNECTIVITY-EXTENT** block (every proven / missing / dead / silent edge + **does it post to GL**). Scoreboard Built, CI green, “clicked around,” unique-FINDING-CLEAN ≠ complete.

---

## 0. Be current (every session)

| Item | Value |
|------|--------|
| GitHub | `tioperfumes07/IH35-TMS` |
| Worktree | `/Users/jorgemunoz/IH35-TMS-clean` (or your assigned clone of **that** remote) |
| App | `https://app.ih35dispatch.com` |
| API | `https://api.ih35dispatch.com` |
| Live SHA | `GET https://api.ih35dispatch.com/api/v1/healthz/shallow` → `version` |
| USMCA opco | `5c854333-6ea5-4faa-af31-67cb272fef80` |
| Neon | project `tiny-field-89581227` · prod wins · RLS `0` ≠ absence (`set_config('app.bypass_rls','lucia',true)` **same txn** + completeness discriminator on **that** table) |

```bash
git fetch origin && git checkout main && git pull --ff-only origin main
curl -sS https://api.ih35dispatch.com/api/v1/healthz/shallow
git rev-parse --short origin/main
```

If healthz ≠ `origin/main` short: audit **live** anyway; write `LIVE_SHA_LAG`. Do not idle. Do not kick Render.

**No product PRs. No fixes.** Auditors write OUTBOX + tracker markdown. Cursor may merge tracker docs. Never `gh pr checks --watch`. Never `trigger_deploy`.

---

## 1. Files you must have open (laws + maps)

**Session / U14**

1. `docs/lockdown/URGENT-14-EXCLUSIVE-MODULE-CERTIFY-LAW-2026-08-22.md`
2. `docs/lockdown/SESSION-ANNOUNCE-CURRENT-LAW-HOPS-2026-08-22.md`
3. `docs/lockdown/CREATE-TEST-THEN-VOID-LAW-2026-08-22.md`
4. `docs/lockdown/USMCA-LAUNCH-FIRST-STANDING-LAW-2026-08-22.md`
5. `docs/lockdown/NO-PER-MERGE-PROD-DEPLOY-LAW-2026-08-21.md`
6. `docs/bus/FAST-MERGE-4MIN-LAW.md`
7. Your INBOX: `docs/bus/INBOX-CASCADE.md` or `INBOX-DEVIN.md` / `INBOX-DEVIN-A.md`

**Complete bar (all of these)**

8. `docs/lockdown/FULLY-WIRED-COMPLETE-BAR-2026-08-13.md` — **1–12** (Live Chrome **last**)
9. `docs/lockdown/HONEST-BUILT-LAUNCH-LAW-2026-08-14.md`
10. `docs/lockdown/VERTICAL-WIRING-LAW-2026-08-12.md` — column vertical, not module-horizontal
11. `docs/audit/IH35-FULL-SYSTEM-AUDIT-SPEC.md` — DoD **A–E** + VERIFY **1–8** + §B9 insurance model + §B12 wiring clicks  
11b. `docs/audit/ACCIDENT-CLAIM-WEB-AUDIT-MODEL-2026-08-23.md` — **deepest bar**: accident, load, customer, vendor, driver, truck, police report, claim, deductible, driver-responsible, salary vs escrow, at-fault, repair WO, lawsuit, GL, bank, reverse from every hub
12. `docs/specs/DEFINITION-OF-DONE.md` / `docs/lockdown/DEFINITION-OF-DONE.md` (more protective wins)
13. `docs/lockdown/PER-PR-CHECKLIST.md` (every FINDING PR)

**Matrix = original column wall**

14. `docs/specs/scoreboard/columns.shared.json` — **canonical column IDs** (numbered **C01–C24** below)
15. `docs/specs/scoreboard/MODULE-MATRIX-SCOREBOARD-LOCKED.md` — Box 1 Required · 2 Audited · 3 Built · 4 Live
16. `docs/specs/scoreboard/MATRIX-COMPLETE-INVENTORY-2026-08-12.md` — every modal/drawer/wizard is a Required **leaf**
17. **That module’s Required map** (the leaf × column wall you actually tick):
    - `docs/specs/scoreboard/modules/accounting.required.json`
    - `docs/specs/scoreboard/modules/banking.required.json`
    - `docs/specs/scoreboard/modules/settlements.required.json` (and/or driver-finance if split)
    - `docs/specs/scoreboard/modules/factoring.required.json`
    - `docs/specs/scoreboard/modules/dispatch.required.json`
    - `docs/specs/scoreboard/modules/vendors.required.json`
    - `docs/specs/scoreboard/modules/maintenance.required.json`
    - `docs/specs/scoreboard/modules/safety.required.json`
    - `docs/specs/scoreboard/modules/insurance.required.json`
18. Live board: `https://app.ih35dispatch.com/program/matrix` → open **that module**

**What each tab is supposed to do**

19. `docs/specs/IH35_ARCHITECTURAL_DESIGN.md` — module sections (tab purpose / count)
20. `docs/approved-screens/` matching PNG for that module
21. Live nav source (do not invent tabs):
    - Accounting: `apps/frontend/src/pages/accounting/subnav-manifest.ts`
    - Banking flyout: `apps/frontend/src/components/layout/sidebar-config.ts` (`bank` children)
    - Dispatch flyout: same file (`dispatch` children)
    - Maintenance: `apps/frontend/src/components/maintenance/MAINTENANCE_NAV_CONFIG.ts`
    - Safety flyout: `sidebar-config.ts` (`safety` children)
    - Insurance: `/safety/insurance` (sidebar `insurance`)

**Trackers**

22. `docs/audit/scenario-trackers/certified-u14/TEMPLATE.md`
23. `docs/audit/scenario-trackers/certified-u14/VERTICAL-LEAF-WORKSHEET.md`
24. Module file `U14-0N-*.md`

**Never steal:** lists/legal/customers/drivers/fleet Required JSON — those modules are still OPEN U14.

---

## 2. How “complete” is measured (no soft yes)

A module audit is **AUDIT-PASS** only when **all** are true on **this** healthz `version`:

| Gate | Meaning |
|------|---------|
| **FW 1–12** | Every numbered item in FULLY-WIRED-COMPLETE-BAR for **every tab you opened** (N/A only with reason) |
| **DoD A–E** | Active path · wizard depth · F+R canonical FKs · purpose→economics · evidence |
| **V1–V8** | Chrome · picker+creator live · wiring live · deep F+R · entity scope · economics · tab/design · RLS |
| **Matrix** | For **each leaf** in that module’s `*.required.json`, every column marked Required is **Live-proven** (Box 4), not merely Built. `leafRe:.*` theater = FAIL |
| **Vertical** | Same **column id** is honest on this module; you do not declare PASS while sibling leaves on this module still lack that column |
| **Live SHA** | Evidence dated to current `healthz/shallow` `version` |

**Forbidden PASS:** “CERTIFIED historically” · scoreboard % · CI · unique-clean · one dashboard click.

**FAIL only for unique:** HTTP 500 · dead click · silent no-op. Design nits go in tracker notes, not a fake FINDING.

**Outcome line (OUTBOX):**  
`Cascade|Devin | AUDIT-PASS|FINDING | MODULE=<id> | LIVE_SHA=<healthz> | leaves=<n walked>/<n in required.json> | GO`

---

## 3. Fully-Wired 1–12 (tick on EVERY tab)

Canonical prose: `docs/lockdown/FULLY-WIRED-COMPLETE-BAR-2026-08-13.md`. Short tick list:

| # | Name | You must prove |
|---|------|----------------|
| 1 | Place | Tab exists on approved design + live nav; not ComingSoon twin |
| 2 | Create/save | `+ Create`/`+ Book` writes **canonical** table; all fields in payload; server display IDs |
| 3 | Money | Vendor or customer + GL purpose + correct object (invoice/bill/expense/payment/settlement/factor/escrow/JE); header+lines; **no TMS→QBO write-back**; flags OFF unless owner turned on |
| 4 | Forward | Real FKs: load/driver/unit/trailer/vendor/customer/WO/claim/policy/bank/GL as owed — not UUID-in-name |
| 5 | Reverse | Other module shows this record and drills back |
| 6 | Matrix | Every Required cell Built with **leaf-specific** guard |
| 7 | Surface bar | tab/subtab/leaf · search/filter/gear/range/picker/Combobox · modal/popup/side/drawer/ParityDrawer · wizard · nested `+ Add new` first row |
| 8 | Chrome | no box-in-box · QBO calendar/money · Escape dismiss · Filter Apply · `+ Create`/`+ Book` never `+ New`/`+ Add` |
| 9 | Picker law | catalog · `+ Add new` **first** · same Lists creator · same table · appears+selected+reload · USMCA |
| 10 | Entity/RLS | `operating_company_id` or unit owner/lease · FORCE RLS · void not delete |
| 11 | Guard | root-cause + guard fails on bug · FINDING block |
| 12 | Live Chrome **last** | SHA match · create→save→reload→reverse→money · picker prove · links not 404 |

---

## 4. Original matrix columns (C01–C24)

Source: `docs/specs/scoreboard/columns.shared.json` (owner 2026-08-08 chrome/wiring part of linkage; 2026-08-12 added claim/WO/accident/policy/settlement/legal_matter/invoice/bank).

There is **no separate 31-column file** in repo. **Complete column work** = C01–C24 **plus** every extra id inside that module’s `*.required.json` if present **plus** Boxes 1–4 on `/program/matrix`. Walk **rows (leaves) vertically**: finish one leaf down all owed columns, then the next leaf — that is VERTICAL-WIRING-LAW.

| # | id | Group | What you click-prove |
|---|-----|--------|----------------------|
| C01 | `driver` | linkage | FK to `mdata.drivers`; label not raw UUID; reverse from driver |
| C02 | `customer` | linkage | FK to `mdata.customers`; reverse from customer |
| C03 | `vendor` | linkage | FK to `mdata.vendors` (not RETIRE qbo_vendors); reverse |
| C04 | `unit` | linkage | FK to `mdata.units` (owner/lease — **no** `operating_company_id` on units) |
| C05 | `trailer` | linkage | trailer equipment FK; reverse |
| C06 | `load` | linkage | `mdata.loads` / dispatch load; **do not invent** load FKs on historical QBO imports |
| C07 | `claim` | linkage | insurance claim FK; reverse graph |
| C08 | `work_order` | linkage | `maintenance.work_orders`; reverse |
| C09 | `accident` | linkage | safety accident FK; reverse |
| C10 | `policy` | linkage | insurance policy FK; reverse |
| C11 | `settlement` | linkage | driver_finance settlement FK; reverse |
| C12 | `legal_matter` | linkage | legal matter FK; reverse |
| C13 | `ap_bill` | money | AP bill + lines + vendor |
| C14 | `expense` | money | expense + lines + GL |
| C15 | `invoice` | money | AR invoice + customer |
| C16 | `bank` | money | bank txn / match / recon — TEST expense Match + Accept; do not drain For-review |
| C17 | `gl_je` | money | balanced JE via **existing poster**; flags |
| C18 | `inventory` | money | parts/stock if owed |
| C19 | `liability` | money | escrow / liability / holdback display honest |
| C20 | `picker_law` | chrome | `+ Add new` first row · same creator |
| C21 | `qbo_chrome` | chrome | ParityDrawer / calendar / Due / box-in-box |
| C22 | `connectivity` | wiring | nav→route→API→canonical table, live click |
| C23 | `reverse_link` | wiring | reverse drill live |
| C24 | `scenario.maintenance` / `scenario.insurance` | process | scenario tracker card if this module owns that hop |

On `/program/matrix` each cell also has **four boxes**: Required · Audited · Built · Live. **AUDIT-PASS requires Live** on owed cells, or honest `UNVERIFIED — <blocker>` (empty TMS → CREATE-TEST-THEN-VOID labeled TEST, then re-walk — do not remake a TEST that already exists).

---

## 5. DoD A–E + VERIFY 1–8 (every leaf)

From `docs/audit/IH35-FULL-SYSTEM-AUDIT-SPEC.md`:

| | Gate | Live proof |
|--|------|------------|
| A | Active path | nav → mounted route → not ComingSoon |
| B | Wizard depth | every rendered field in submit payload |
| C | Linkage F+R | canonical FKs both ways |
| D | Purpose→economics | purpose picks money object |
| E | Evidence | SHA / URL / Neon / screenshot |
| V1 | QBO chrome | |
| V2 | Picker+creator 7 clauses | |
| V3 | Connectivity | every link lands correct live target; CoA→register→report if accounting |
| V4 | Deep F+R web | **accident+claim gold web** — every hop in `ACCIDENT-CLAIM-WEB-AUDIT-MODEL` that this module touches; reverse live; GL terminus named |
| V5 | Catalogs / USMCA | no cross-entity |
| V6 | Economics | header+lines; balanced JE if flag ON |
| V7 | Tab/design law | no silent-missing; no invented tabs |
| V8 | RLS | FORCE RLS; security_invoker views |

§B12: picker first row; Lists cards (you **do not** audit Lists module — only pickers **inside** your module); CoA path on accounting; EntityLink both ways.

---

## 6. Seat split (vertical: one module, all tabs, then next)

| Seat | Modules (order) | Start URL |
|------|-----------------|-----------|
| **Cascade** | accounting → banking → settlements → factoring → dispatch | `/accounting` |
| **Devin / Devin-A** | **one auditor** (product tab “Devin A” = Devin). vendors → maintenance → safety → insurance. Fill your own trackers as you click. **Not** a scribe. **Not** Devin-B. **No fixes.** | `/vendors` |

Empty unique-FINDING → write CONNECTIVITY-EXTENT + RECOMMENDATIONS → next module in **your** column. **Do not** start leftover product (`POST-URGENT-14`) — this seat is audit-only. **Never idle** on the next **audit** module.

---

## 7. VERTICAL format — what each module/tab does

Work **down** the tab list. For each row: open URL → say what it does → run FW 1–12 + owed C01–C24 + A–E + V1–8 → fill `VERTICAL-LEAF-WORKSHEET.md` (copy one block per tab).

### CASCADE · accounting (`/accounting`)

**What the module is:** QBO-class books: CoA, AP, expenses, AR, payments, JE, period, catalogs. Nav law: `subnav-manifest.ts` + `IH35_ARCHITECTURAL_DESIGN.md` MODULE 3. Approved PNG `docs/approved-screens/3-Accounting-Dropdown.png`.

**Top row:** Accounting · Bills ▾ · Expenses ▾ · Bill payment ▾ · Invoices ▾ · Maintenance & shop ▾ · Vendors · Customers · Reports · More ▾

| Tab / leaf | Route | Function (audit this) |
|------------|--------|------------------------|
| Hub | `/accounting` | KPIs; jumps; not fake $0 on failed fetch |
| Bill | `/accounting/bills` | AP bills list/create; vendor+GL+lines |
| Maintenance/Repair/Fuel/Driver/Vendor bill | `/accounting/bills/*` | typed AP from ops |
| Multiple / Recurring bills | `/accounting/bills/multiple` `.../recurring` | batch / schedule |
| Expenses list / Expenses / Receipts | `/accounting/expenses/list` `/accounting/expenses` `/accounting/receipts` | expense + attachments |
| Bill payment / vendor balances / credits / AP / AP aging | `/accounting/bill-payments` etc. | pay bills; aging report |
| Invoices / credit memos / Receive Payment / Undeposited / AR aging / Collections | `/accounting/invoices` etc. | AR cycle |
| Maintenance & shop | `/accounting/maintenance-shop` | shop costs → AP |
| Vendors / Customers / Reports | `/accounting/vendors` `/accounting/customers` `/accounting/reports` | **accounting** surfaces — do not steal `/vendors` `/customers` U14 OPEN modules; stay on these accounting routes |
| Factoring / Faro / factor recon | `/accounting/factoring` `/factoring/faro-import` `/accounting/factor-reconciliation` | packet/recon (also Cascade later `/factoring`) |
| Daily/QBO recon | `/accounting/daily-recon` `/accounting/reconciliation` `/accounting/qbo-reconcile` | tie-out; no TMS→QBO write |
| Loans & advances | `/accounting/loans-advances` | liability |
| Settlements / pre / queues / escrow | `/driver-finance/settlements` `/accounting/pre-settlements` `/accounting/dispute-queue` `/accounting/abandonment-queue` `/accounting/escrow` | driver money (full walk also on settlements module) |
| JE / register / all txns / recurring / integration | `/accounting/journal-entries` `/accounting/account-register` `/accounting/transactions` … | ledger |
| Period / OB / tax / close / forecast / multi-entity | `/accounting/month-close` `/accounting/period-close` … | **do not Close period** with 0 sessions as a “test” |
| Revenue rec / assets / allocations / prepaid / payroll | More ▾ back office | TRK assets only; TRANSP/USMCA no fake PP&E |
| Audit / lineage / posting templates / QBO drift | `/accounting/audit-trail` … | WORM |
| CoA catalogs | `/lists/accounting/chart-of-accounts` etc. | **Lists routes that Accounting More already opens** — hop as accounting catalogs, do not start CC-3 `/lists` hub campaign |

**Canonical money tables (examples):** `accounting.bills` `accounting.expenses` `accounting.invoices` `accounting.journal_entries` `catalogs.accounts`. Poster reuse only.

### CASCADE · banking (`/banking`)

**What it is:** bank tiles, register, match, recon, Plaid, virtual factor/escrow tiles (excluded from 425C main totals). Design MODULE 4.

| Tab | Route | Function |
|-----|--------|----------|
| Accounts | `/banking` | tiles; real + virtual |
| Transactions | `/banking/transactions` | unified register; Match/Categorize |
| Reconciliation | `/banking/reconciliation` `/banking/reconcile` | TEST Accept; do not drain For-review |
| Factoring (Faro) | `/banking/factoring` | door to factor |
| Driver escrow | `/banking/driver-escrow` | virtual liability |
| Relay / reports / statement import / Plaid / settings / transfers / cash GL / email / visibility | `/banking/*` | each must load; no 500 |

CREATE-TEST-THEN-VOID: labeled TEST expense → Match → recon Accept → ledger. Owner voids later.

### CASCADE · settlements (`/driver-finance/settlements` + cash advances)

**What it is:** driver pay cycle. **Do not remake Close.**

| Tab | Route | Function |
|-----|--------|----------|
| Settlements | `/driver-finance/settlements` | list/detail; loads in cycle; reverse to load/driver |
| Cash advances | `/driver-finance/cash-advance-requests` `/driver-finance` as live | advances; escrow |
| Related accounting doors | `/accounting/pre-settlements` `/accounting/escrow` | same economics, reverse |

Canonical: `driver_finance.*` (not RETIRE payroll).

### CASCADE · factoring (`/factoring`)

**What it is:** Faro packets, chargebacks, statements. Reserve accounts owner-manual (do not “fix” subtypes).

| Tab | Route | Function |
|-----|--------|----------|
| Factoring home / submit / chargebacks | `/factoring` and subroutes as nav shows | packet → accounting; reverse to load/invoice |
| Banking door | `/banking/factoring` | same data, reverse |

### CASCADE · dispatch (`/dispatch`)

**What it is:** McLeod-grade load board. **Do not remake Book Load.** Use existing load.

Flyout (sidebar-config): Home, Loads, Chat, At-Risk, In-Transit Issues, Assignment History, Planner Calendar, Driver/Truck/Loads planners, Detention, OCR, Equipment Transfers, ETA notify, POD+BOL, Settings, Geofence, Alerts, Border + History, Factoring queue.

Each row: open → search/filter/gear → open existing load drawer (Stops/Pay/Docs/…) → EntityLink customer/driver/unit → reverse from those records → pickers `+ Add new` first row if you open a combobox (**do not save a second Book Load**).

Canonical: `mdata.loads`. FINDING only 500/dead/silent.

---

### DEVIN · vendors (`/vendors`)

**What it is:** vendor master + AP reverse. Not accounting `/accounting/vendors` only — this is the module.

| Typical surfaces | Function |
|------------------|----------|
| List All/Active/Inactive | roster; search/filter/gear |
| + Create Vendor | canonical `mdata.vendors`; do not remake if TEST exists |
| Detail tabs (Profile/AP/Documents/Audit/…) | reverse bills/WOs |

### DEVIN · maintenance (`/maintenance`)

Nav: `MAINTENANCE_NAV_CONFIG.ts`

**Module flyout (13):** Dashboard, Vehicles, Drivers, Parts, Severe Repairs, PM Schedule, Inspections, Vendors, Reports, Compliance, Position History, Fault Drafts, Fault Rules.

**Dashboard ops tabs (10):** Active WOs, Fleet Table, R&M Status Board, Service/Location, Arriving Soon, In-Transit Issues, Damage Reports, Severe Repairs, Parts Inventory, Settings.

**What it does:** WOs, PM, DVIR/inspections, parts, vendor shop. Canonical `maintenance.work_orders`. Reverse to unit/vendor/load/claim. **Do not remake WO TESTs.** Insurance_claim_id both ways if present.

### DEVIN · safety (`/safety`)

Flyout: Home, Driver Files, HOS, DOT Compliance, DOT Inspections, CSA Score, Accidents, Internal Fines, CSA Mitigation, Anomaly Alerts.

**What it does:** CSA/DOT/accident/fines. Reverse to driver/unit/load/legal/insurance. Do not remake TESTs. Parent `/safety/training` must not dump to `/home` (known leftover class — if still dead, FINDING).

### DEVIN · insurance (`/safety/insurance` and claims as nav shows)

**What it does:** policies, claims. Claim graph: policy, driver, unit, accident, load, legal, WO, deductible, bills, JE. Reverse GET/graph or UI sections. Empty claims → CREATE-TEST-THEN-VOID one labeled TEST claim, then walk graph — do not skip V4.

---

## 8. Per-tab procedure (copy this)

1. Curl healthz → write `LIVE_SHA`.
2. Open tab. Screenshot or URL+what rendered.
3. Tick FW 1–12 (N/A with reason).
4. Open that leaf on `/program/matrix` — every Required column C01–C24: Live click or UNVERIFIED blocker.
5. One combobox: `+ Add new` first; if you create, labeled TEST; cancel if a TEST already exists unless hop blocked.
6. Click every EntityLink on the page (forward). From the target, find reverse.
7. If money: header+lines; do not flip posting flags.
8. Fill worksheet block. Next tab same module. Do not skip “More ▾” overflow on accounting.

---

## 9. OUTBOX shapes

`Cascade | ACK | VERTICAL-AUDIT | MODULE=accounting | NOW=/accounting | FILE=docs/audit/CASCADE-DEVIN-VERTICAL-CERTIFIED-AUDIT-INSTRUCTIONS-2026-08-23.md | GO`

`Devin | ACK | VERTICAL-AUDIT | MODULE=vendors | NOW=/vendors | FILE=docs/audit/CASCADE-DEVIN-VERTICAL-CERTIFIED-AUDIT-INSTRUCTIONS-2026-08-23.md | GO`

`Devin-A | ACK | VERTICAL-AUDIT | MODULE=vendors | NOW=/vendors | GO`
