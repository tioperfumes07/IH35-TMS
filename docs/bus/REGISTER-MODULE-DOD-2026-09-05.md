# THE REGISTER — per-module Definition-of-Done checklists (owner-approved 2026-09-05 18:35Z)

**This file is the register. Nothing exists off it.** Built from the measured inventory `docs/bus/OWNER-ISSUE-INVENTORY-2026-09-05.md` (row #s cited). One owner per module; **parallel across modules, strictly one active item per coder**; next item only after the current one is CLOSED.

- **Registrar + deployer + settlements/load-costs FE vertical:** Cursor. Cursor owns this file and the deploy timer.
- **Independent auditor:** Claude. Re-measures every closure against Neon + the API before the box flips. Keeps the measured inventory + 5-day register as the source. Builder never self-certifies.
- **Module order (locked):** Dispatch/Book Load → Settlements → Accounting/Load Costs (incl. cash flow) → Maintenance → Driver Profile → Customers/Vendors → Reports. (Telematics/Samsara + Seed run under their owners as prerequisites.)
- **No live Chrome per item.** Live-verify is ONE pass per module at module-close, after all wiring/linkage is done.

## DONE-BAR (an item is CLOSED only when ALL hold — 5 owner adjustments baked in)
1. **Schema** exists — and for any DB change, **`db:migrate` ran against production Neon** (a drafted-but-unapplied migration is NOT schema). *(adj 2)*
2. **Endpoint returns REAL USMCA rows** — predicate `operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'` AND `is_sample_data IS NOT TRUE`; number pasted from Neon or one authenticated curl. Transportation / sample rows never count. *(adj 3)*
3. **FE reads/renders the field** — `file:line`.
4. **Both-way linkage** present (Law §9 — drills forward and back).
5. **One guard** `scripts/verify-*.mjs` (+ `--selftest`) that **passes in the PR's CI check, not on a laptop** — merge blocked unless the guard is green in CI. *(adj 1)*
6. **Merged sha** on origin/main.
7. **Auditor (Claude) re-runs the closure probe** and flips the box. Self-certified DONE is rejected. *(adj 4)*
8. Every item carries a **UTC deadline + surrender seat**; silence past the deadline = surrender, registrar moves the item. *(adj 5)*

DONE line format: `SEAT | ITEM DONE | <sha> | <Neon/endpoint number> | <guard name PASS in CI> | NEXT <item>`.

Deadlines below are rolling from 18:35Z; each coder's **ACTIVE** item is due +2h (20:35Z) unless noted. Deploy timer: Cursor every module-close.

---

## MODULE 1 — DISPATCH / BOOK LOAD — owner **CC-2** (surrender: Cascade)
- [ ] **D1** L.4a board columns (inv #7/#37): drop `DEFAULT_VISIBLE_BOARD_KEYS`/`defaultHidden` (`DispatchBoard.tsx:1039-1061`); all 33 cols; group headers; `Location`→`Live loc`; drag/resize; sticky first 4; OWNER-REMOVE Commodity·Linehaul·Pre-settlement·Status; guard test. **#20639 merged — AUDITOR-VERIFY only.**
- [ ] **D2** L.4b top bar (inv #8): one nav, segmented List/Kanban/Round Trips, `+ Book Load` sole filled, `/dispatch`→Overview; guard. **[CC-2 ACTIVE]**
- [ ] **D3** L.4c Round Trips timeline recovered from `22a266132`+`67faa3dcd`, keep `82fda7c90`; guard (inv #9).
- [ ] **D4** L.4g `verify-additive-only.mjs` + baseline in gate (inv #10).
- [ ] **D5** Book Load auto-geofence wiring produces rows (inv #40) — coord Codex telematics.

## MODULE 2 — SETTLEMENTS — owner **CC-1 (backend)** + **Cursor (FE vertical)** (surrender: CC-3 · CC-2)
- [ ] **S1** settlement-lines read model miles/rate/pay from `driver_bills` (inv #11/#28) — CC-1. **Neon shows 76/76 earnings + 76/76 deadhead lines linked, all bills carry miles+rate → AUDITOR-VERIFY.**
- [ ] **S5** settlements LIST read model — Gross/Deductions/Net real (S-13646 shows $0 while lines total $958+), loads separator, one button height (inv #28) — CC-1. **[CC-1 ACTIVE after seed]**
- [ ] **L5** settlement detail FE per `docs/design/reference/DRIVER-SETTLEMENT-DETAIL-REFERENCE-2026-09-05.html`: 6×93px KPI grid, register table per section, `+ Add additional pay/reimbursement/deduction` with NUMBER box, inline edit while OPEN, lock at Close; guard (inv #11) — **Cursor [ACTIVE]**.
- [ ] **M3** company settlements backend — service+read model, 5784 waterfall, `GET /company-settlements[/:id]`, human-confirmed close via journal-entries.service (inv #12) — CC-3.
- [ ] **L6** company settlements FE `/accounting/company-settlements` on M3 shapes (inv #12) — Cursor.

## MODULE 3 — ACCOUNTING / LOAD COSTS (incl. cash flow) — owner **CC-1**; Banking sub-lane **CC-2**
- [ ] **A1** Load Costs board `th` sticky `position:sticky;top:0` (inv #1) — CC-1 (surrender CC-2).
- [ ] **A3** S.2 `/accounting/bills/driver` reads `driver_finance.driver_bills`; All-bills union + Source col; void hidden (inv #13) — CC-1.
- [ ] **A4** S.3 Invoices **Factored** column from `factoring_status`/`factor_profile_id`; dash-never-blank (inv #14) — CC-1.
- [ ] **A6** Cash flow statement — operating/investing/financing from GL, incurred vs paid dates — CC-1.
- [ ] **B2** Banking filters/design — one 28px toolbar height, multi-select type, date range on landing (inv #19) — CC-2. **#20580 merged — AUDITOR-VERIFY.**
- [ ] **B1** Banking matcher — exact-cents ±5d to expenses/bills + many-to-one fuel-card + vendor-alias; suggestion only (inv #18) — CC-2. **expense candidate #20626 + Plaid suggestion #20635 landed; fuel-card many-to-one + vendor-alias remain.**

## MODULE 4 — MAINTENANCE — owner **Codex**
- [ ] **X7** maintenance tables/KPIs on ParityTable contract; guard (inv #21) — Codex. **[Codex ACTIVE]**
- [ ] **X8** WO create/edit comboboxes, unit-picker rule, ≥$7,000 role routing on screen (inv #21) — Codex.

## MODULE 5 — DRIVER PROFILE — owner **CC-1 (money)** + **Codex (tabs)** + **CC-3 (audit)** + **Cascade (load history)**
- [ ] **D3** banner order (inv #26) — CC-1.
- [ ] **D1** deductions grouped by driver, table not cards (inv #24) — CC-1.
- [ ] **D2** Escrow view + by-driver + profile card; quarantine TEST driver (inv #25) — CC-1.
- [ ] **D4** Earnings & Debt read model — per-load earnings + debt history (inv #36) — CC-1.
- [ ] **DP1** profile tabs: kill double-route layout, Actions ▾ dropdown (inv #30/#31) — Codex.
- [ ] **DP2** Documents (driver vs per-load split, Doc Date) + Equipment (trailer/load/miles) (inv #34/#35) — Codex.
- [ ] **DP3** Audit History scoped to the driver (inv #33) — CC-3.
- [ ] **LH** Load History filters+dates+PDF export+click-to-load (inv #32) — Cascade.

## MODULE 6 — CUSTOMERS / VENDORS — owner **CC-3**; landing filter **Cascade**
- [ ] **V1** counterparty roll-ups (vendors purchases/last-purchase/count; customers loads/booked/open-AR/last-load); dash-never-zero; guard sums foot to live (inv #15/#16) — CC-3. **[CC-3 ACTIVE]**
- [ ] **K9** Customers+Vendors landing filter bar recovered from `1e4a6282d7^`; ≥5 visible controls on first load (inv #17) — Cascade.

## MODULE 7 — REPORTS / PLANNERS — owner **Cascade**
- [ ] **K4-7** Planners BRD-19/20/21/23 — server-paginate+sort+filter+export per list; guard each (inv #22) — Cascade. **[Cascade ACTIVE after K9]**

## PREREQUISITE LANES (run under owner, block their module's live pass)
- **SEED** (CC-3): finish USMCA loads via SCRIPT through service fns, HARD FLOOR pickup ≥ 2026-08-07, is_sample_data=false; never manual; owner-open loci 13525/13540 stay open (inv #5/#29/#38).
- **TELEMATICS/SAMSARA** (Codex): driver mirror active+deactivated (inv #39); Book-Load geofence rows (inv #40); LIVE COUNT 16 units / 17-20 drivers (Rule 49). Sequence by Cursor.

---

## ACTIVE ITEM PER COACH (only one each, right now)
| Seat | Module | ACTIVE item | Due UTC |
|---|---|---|---|
| CC-2 | Dispatch | D2 top bar | 20:35Z |
| CC-1 | Settlements | seed slice → then S5 list read model | seed 20:00Z · S5 21:00Z |
| Cursor | Settlements FE | L5 settlement detail per reference | 21:00Z |
| CC-3 | Customers/Vendors | V1 roll-ups | 20:35Z |
| Codex | Maintenance | X7 tables on ParityTable | 20:35Z |
| Cascade | Customers/Vendors | K9 landing filter | 20:00Z |

*Registrar: Cursor. Auditor: Claude. Deploy: Cursor on each module-close. Live Chrome: once per module, at close.*
