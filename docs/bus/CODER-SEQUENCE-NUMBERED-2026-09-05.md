# IH35-TMS — NUMBERED CODER SEQUENCE (owner order 2026-09-05 · Cursor lead)

> **SINGLE SOURCE OF TRUTH — no double register.** This file is the ONLY assignment/sequence register.
> - **Cursor (lead)** owns THIS file: module ownership, per-seat numbered steps, deadlines, surrender.
> - **Claude** owns `docs/bus/OWNER-ISSUE-INVENTORY-2026-09-05.md` (the measured DEFECT list only) — it feeds steps INTO this file; it does not re-assign seats.
> - Each `INBOX-<SEAT>.md` top block is a POINTER to this file (`your block: §<SEAT>`), never a competing copy.
> - A step exists only if it is numbered here. To add work: add a numbered step here (lead), then point the INBOX at it. This ends the rewrite/argue loop.

## STANDING RULE — every seat, every job + every summary
Report progress as **STEP N of M** (your own numbered list below), e.g. `CC-1 | STEP 3 of 7 DONE | <sha> | <live sha> | <measurements> | NEXT 4 of 7`.
No seat starts step N+1 before posting step N's DONE with measurements. Silence at a step = deviation; lead reassigns. One coder per module, vertical (schema → backend → endpoint → screen → guard → live proof). Never touch another module's files. FAST-MERGE. USMCA only (5c854333-6ea5-4faa-af31-67cb272fef80). Never POST Book Load. Void never delete.

## MODULE OWNERSHIP (Devin replaces Cascade)
| Module | Owner | Folder |
|---|---|---|
| Deploy + Load Costs FE + Dispatch top bar (lead) | CURSOR | /Users/jorgemunoz/IH35-TMS-clean |
| Money: settlements detail, bills, invoices, driver-profile finance | CC-1 | /Users/jorgemunoz/IH35-TMS-cc3 (cc1 worktrees) |
| Dispatch board + Banking + design tokens | CC-2 | /Users/jorgemunoz/IH35-TMS-cc2-live |
| Seed + Customers/Vendors roll-ups + Company settlements backend | CC-3 | /Users/jorgemunoz/IH35-TMS-cc3 |
| Telematics/Samsara (active-set + USMCA re-scope) — Maintenance DONE 3/3 | CODEX | /Users/jorgemunoz/IH35-TMS-codex-seat |
| Lists / Reports / Planners + Customers/Vendors landing filters | **DEVIN** | **/Users/jorgemunoz/IH35-TMS-devin** |

---

## CURSOR (me) — M=6
1. DEPLOY API (srv-d7rpem7avr4c73fhp4n0) + FE to tip; post healthz git_sha.
2. USMCA/Transportation reconciliation — DONE: 21 pre-08/07 loads quarantined (soft-void, WORM), 39 active USMCA all pickup ≥ 08/07, 0 in USMCA factoring. (proof posted)
3. L.1d — Load Costs board `th` sticky (position:sticky; top:0), measured.
4. L.4b — Dispatch top bar per DESIGN-CONTRACT-DISPATCH-BOARD §B + guard.
5. L.5 — Driver settlement detail FE per reference (6×93px KPI, register per section, + Add rows, inline edit while OPEN, lock at Close) + guard.
6. L.6 — Company settlements list+detail /accounting/company-settlements on CC-3 M.3 shapes.

## CC-1 (money read models) — M=7
1. S.1 — settlement lines read model: join driver_bills on source_driver_bill_id, return miles/rate/pay (earnings + deadhead); FE shows real numbers; guard. NOTE: deadhead-accrual (settlement-line-buckets.ts) is ALREADY ON MAIN — do not re-merge; build on it. (#11,#28)
2. S.2 — /accounting/bills/driver reads driver_finance.driver_bills; All-bills union with Source col; void hidden; guard = screen count == live count. (#13)
3. S.3 — Invoices Factored column (Not factored/Submitted/Advanced/Settled) + factor name; dash never blank; guard. (#14)
4. D.3 — driver-profile banner position fix (h1 at top, above status strip). (#26)
5. D.1 — Deductions grouped BY DRIVER (table, not per-settlement card list). (#24)
6. D.2 — Escrow view /drivers/escrow + by-driver ledger + profile card (Pending/Held/Released/Balance/cap); quarantine test driver "Juan USMCA-Battery" (is_sample_data, never delete). (#25)
7. D.4 — Earnings & Debt history per load + per settlement from bills/lines/deductions/escrow; totals foot; Export. (#DP)

## CC-2 (dispatch board + banking + tokens) — M=8
1. L.4a — dispatch board all 33 cols, group headers ASSIGNMENT·HOS·LOAD·TELEMETRY·STATUS, Location→Live loc, drag+resize, sticky first 4; delete DEFAULT_VISIBLE_BOARD_KEYS; guard. (#7)
2. L.4a-fix — header truncation (min-width real), gear/column-chooser; OWNER-REMOVE Commodity/Linehaul/Pre-settlement/Status from defaults; Driver as initials (full name hover); Driver Status codes Off/On/Drv/SB/Pre/UA; Live loc 180px; GPS un-glued; 1px #C7D2DC outer frame; guard numbers. (#7,#37)
3. verify-usmca-load-cutover-floor.mjs — FAILS if any active USMCA load has earliest pickup < 2026-08-07; wire in verify-steps (CC-2 band mod-4≡3); baseline green = 0 below 13508. (TODAY)
4. L.4g — verify-additive-only.mjs + additive-baseline.json in gate. (#10)
5. B.2 — banking filters: one 28px toolbar height for ALL controls incl Money in/out; type = multi-select (checkboxes/chips, server-side); date range visible on landing; guard rendered. (#19)
6. B.1 — banking matcher: suggest exact cents ±5d to expenses/bills, many-to-one fuel-card, vendor alias; suggested_* + confidence; POST /banking/transactions/suggest; Accept→match never auto-post; guard. (#18)
7. 2.2 — design tokens encode design-contract values + ratchet. (#23)
8. L.4c — Round Trips timeline recovered from 22a266132 + 67faa3dcd, keep 82fda7c90; guard. (#9)

## CC-3 (seed + customers/vendors + company settlements) — M=6   [telematics MOVED to Codex 2026-09-05, U1 dropped]
1. SEED the 20 MISSING USMCA loads: 13512,13513,13515,13520,13522,13525,13528,13530,13532,13535,13536,13537,13541,13542,13544,13551,13553,13554,13555,13556 — pickup dates from signed docs, addresses from docs, NEVER close (leave pre-settlement). (TODAY)
2. Seed script HARD FLOOR — reject any load pickup < 2026-08-07; fix seeded proforma issue dates (today→pickup date). (#29, TODAY)
3. Feed rulings R1/R2 — lumper vendor = delivery location (cash); missing customer = create from document. (#27)
4. V.1 — vendors + customers roll-ups (append-only view cols): vendors Purchases YTD/Last purchase (never updated_at); customers Loads/Booked YTD/Last load; Transactions tab; guard sums foot to live. (#15,#16)
5. M.3 — company settlements backend (service+read model, 5784 waterfall, GET endpoints, close human-confirmed via journal-entries.service); shapes to Cursor L.6. (#12)
6. (Telematics MOVED to Codex — Love's 604 import stays under Codex's telematics vertical.)

## CODEX (Telematics/Samsara — USMCA) — M=5   [folder /Users/jorgemunoz/IH35-TMS-codex-seat]
> Maintenance X.7 (#20538 4427c966) · X.8 (#20548 8103343b) · X.9 (e272e9c) DONE 3/3. Owns integrations/samsara/**, telematics/**, active-driver-set/**, drivers.routes.ts (active_only), Drivers.tsx default. RULE 49 + §3b.
1. Reliable active-set engine — source telematics.vehicle_latest_position (captured_at ≤15d) + vehicle_driver_assignments window-overlap, scoped by units.currently_leased_to_company_id=USMCA; STOP using dead samsara_drivers.last_seen_at. Prove 16 units / 17–20 drivers.
2. Driver LIST + profile lists DEFAULT active-only (active_only param, Show-all toggle; 264-row DB retained). Units list default = 16 USMCA-leased in-service.
3. RE-SCOPE Samsara data to USMCA — idempotent CREATE-only migration re-tags telematics rows for USMCA-leased units 91e0bf0a→5c854333; point samsara_config ingestion at USMCA; RE-TAG never DELETE (WORM).
4. Reliable last_seen_at fix — keep fresh from the position ingestion path (not a one-off backfill); mark samsara_drivers with no USMCA unit link inactive (void, not delete).
5. verify-step guards (15d window join, lease-scope, count band 10–40) + deploy backend + healthz git_sha + live count proof.

## DEVIN (lists/reports/planners + counterparty landing) — M=5   [folder /Users/jorgemunoz/IH35-TMS-devin]
0. SETUP: `cd /Users/jorgemunoz/IH35-TMS-devin && git stash && git checkout main && git pull --ff-only origin main`. (currently on fix/stale-mileage-lane-change, 1 dirty, 6 behind)
1. K.9 — restore Customers & Vendors landing FILTER BAR from `git show 1e4a6282d7^:apps/frontend/src/pages/Customers.tsx` (and Vendors.tsx): inline, visible on first load, live-applied; keep later genuine fixes; guard = ≥5 visible filter controls above list at first load, 0 clicks. (#17)
2. K.4 — BRD-19 planners.
3. K.5 — BRD-20 planners.
4. K.6 — BRD-21 planners.
5. K.7 — BRD-23 planners.

---
DONE line format (all seats): `SEAT | STEP N of M DONE | <sha> | <live sha> | <measurements> | NEXT (N+1) of M`
