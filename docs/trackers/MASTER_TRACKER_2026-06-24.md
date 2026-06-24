# IH35-TMS — Master Tracker — 2026-06-24

Source: verified from git/gh/live-health/guard on 2026-06-24, no guessing.

---

## 1. Deploy state

| Item | Value | Status |
|---|---|---|
| Deployed backend sha | `741a6da` (`{"ok":true,"uptime_seconds":951,"version":"741a6da"}`) | — |
| `origin/main` HEAD | `741a6da0` | — |
| Match | `741a6da` is the 7-char prefix of `741a6da0` | **CURRENT (not lagging)** |
| Live frontend bundle hash | `index-C5QD5z8E.js` | live |

Backend deploy matches main HEAD. Frontend bundle hash recorded as the live reference for FE-deploy verification.

---

## 2. This session's shipped work (merged PRs)

### Group M-1 — money-input sweep (raw money `<input>` → shared `MoneyInput`)

| PR | Title | Date |
|---|---|---|
| #1384 | fix(dispatch): Book Load §A money fields → shared MoneyInput (M-1, fixes 350→$3.50 100x bug) | 2026-06-23 |
| #1387 | feat(forms): MoneyInput DOLLARS mode + Create WO/bills/expenses Cost fields → QBO format (M-1, display-only) | 2026-06-23 |
| #1388 | feat(accounting): invoice line money entry → inline QBO MoneyInput (M-1, replaces window.prompt) | 2026-06-23 |
| #1395 | feat(driver-finance): escrow override amount → QBO MoneyInput dollars-mode (M-1) | 2026-06-23 |
| #1396 | feat(banking): transfer amount → QBO MoneyInput dollars-mode (M-1) | 2026-06-23 |
| #1398 | fix(banking): M-1 money inputs → QBO MoneyInput dollars-mode (byte-for-byte) | 2026-06-24 |
| #1399 | fix(factoring): M-1 equipment-loan attribution/payment → modal + cents-mode MoneyInput | 2026-06-24 |
| #1400 | fix(accounting): M-1 payment-apply money inputs → MoneyInput (byte-for-byte) | 2026-06-24 |
| #1401 | fix(accounting): M-1 cash-forecast weekly estimates → cents-mode MoneyInput | 2026-06-24 |
| #1402 | fix(ap): M-1 bill-payment + multi-bill amount inputs → MoneyInput (byte-for-byte) | 2026-06-24 |
| #1403 | fix(expenses): M-1 Record Expense amount → MoneyInput (byte-for-byte) | 2026-06-24 |
| #1404 | fix(fuel,legal): M-1 amount inputs → MoneyInput (byte-for-byte) | 2026-06-24 |
| #1405 | fix(customers): M-1 customer payment + lane-rate money inputs → MoneyInput | 2026-06-24 |
| #1406 | fix(parts,items): M-1 cost inputs → MoneyInput (byte-for-byte; traced cents-vs-dollars) | 2026-06-24 |
| #1407 | fix(insurance): M-1 claim/lawsuit/policy money inputs → MoneyInput (byte-for-byte) | 2026-06-24 |
| #1408 | fix(safety,drivers): M-1 fine/dispute amount inputs → MoneyInput (byte-for-byte) | 2026-06-24 |
| #1409 | fix(lists,banking): M-1 item/account/recon money inputs → MoneyInput (byte-for-byte) | 2026-06-24 |
| #1410 | fix(advances,customers,banking): M-1 money inputs → MoneyInput (byte-for-byte) | 2026-06-24 |
| #1411 | fix(border,vendors,bills): M-1 money inputs → MoneyInput (byte-for-byte) | 2026-06-24 |
| #1412 | fix(users,dispatch): M-1 cost + lumper money inputs → MoneyInput (byte-for-byte) | 2026-06-24 |
| #1413 | [HOLD-FOR-JORGE] fix(accounting,banking): M-1 Manual JE debit/credit → MoneyInput | 2026-06-24 |
| #1414 | fix(factoring): M-1 FAIL#3 inline loan principal → cents-mode MoneyInput + recurrence guard (worklist) | 2026-06-24 |
| #1415 | fix(factoring,driver-finance,maint): M-1 cluster-1 money inputs → MoneyInput (byte-for-byte) | 2026-06-24 |
| #1416 | [HOLD-FOR-JORGE] fix(driver-finance): M-1 dispute resolution amount → MoneyInput | 2026-06-24 |
| #1417 | fix(drivers,ap): M-1 auto-deduction + CC bill-payment money inputs → MoneyInput (byte-for-byte) | 2026-06-24 |
| #1419 | fix(safety): M-1 Internal Fines inline amount → MoneyInput + guard inline blind-spot fix | 2026-06-24 |
| #1420 | fix(fleet,maint): M-1 cluster-2 sold-price + warranty-claim → MoneyInput (byte-for-byte) | 2026-06-24 |
| #1421 | fix(dispatch,customers,safety): M-1 cluster-3 money inputs → MoneyInput + guard rate-exclusion | 2026-06-24 |
| #1422 | fix(reports,banking,maint): M-1 cluster-4 filters + WO cost → MoneyInput; WIRE guard into CI | 2026-06-24 |

### Group Create-WO render-v5 (maintenance)

| PR | Title | Date |
|---|---|---|
| #1380 | fix(maint): Create WO footer render-v5 labels — Save draft + Create work order (FIX-6, safe relabel) | 2026-06-23 |
| #1381 | feat(maint): Create WO §A Priority field (routine/urgent/immediate) — render-v5 (FIX-5) | 2026-06-23 |
| #1382 | feat(maint): Create WO §C Cost Breakdown columns → render-v5 labels (WO mode only) (FIX-4) | 2026-06-23 |
| #1383 | fix(maint): WO footer = Cancel \| Create work order \| Save WO & Create Bill (FIX-6 option-a re-apply) | 2026-06-23 |
| #1394 | feat(maint): Create WO §A Close date/time → closed_at (W-FIX-8, ship-on-green) | 2026-06-23 |

### Group Other (dispatch enrichment, vendor quick-create, gated migrations, GUARD tooling, docs)

| PR | Title | Date |
|---|---|---|
| #1385 | feat(maint): vendor quick-create — split Display name + Company/Vendor name (FIX-7a) | 2026-06-23 |
| #1386 | [HOLD-FOR-JORGE] chore(mdata): qbo_vendors render-v5 §D columns (FIX-7b migration) | 2026-06-23 |
| #1389 | feat(dispatch): side-panel §B Equipment enrichment via read-only joins (W-FIX-3a) | 2026-06-23 |
| #1390 | feat(dispatch): Book Load persists selected trailer → mdata.loads.trailer_id (W-FIX-3b) | 2026-06-23 |
| #1391 | feat(dispatch): Book Load Trip Type full-width banner (A3) | 2026-06-23 |
| #1392 | feat(mdata): vendor quick-create render-v5 §D fields end-to-end (W-FIX-7b) | 2026-06-23 |
| #1393 | [HOLD-FOR-JORGE] chore(mdata): loads.temperature_type (Frozen/Fresh) — W-FIX-1 migration | 2026-06-23 |
| #1397 | feat(dispatch): §B reefer "Temperature type" Frozen/Fresh segmented field (W-FIX-1) | 2026-06-24 |
| #1418 | chore(dev): GUARD crawl test-record seed script (build-only; execution gated) | 2026-06-24 |
| #1424 | docs(guard): EscrowForfeit allowlist note → accurate finding (forfeit route missing) | 2026-06-24 |

> Note: PR #1423 and #1425 are absent from the merged list (no record returned by `gh`).

---

## 3. M-1 money-input sweep — status

| Item | Value |
|---|---|
| Guard at floor | **PASS (exit=0)** — `verify:money-fields-use-moneyinput PASS — no raw money <input> outside MoneyInput (modal + inline)`. Zero offenders. |
| Frontend files using `MoneyInput` | **69** (`*.tsx` under `apps/frontend/src`, excluding `MoneyInput.tsx`) |
| Recurrence guard CI-wired | **YES** — `.github/workflows/locked-guards.yml` lines 215–216 (`verify:money-fields-use-moneyinput`) |
| Allowlist entries (tracked debt) | **exactly 1** |

> The original count attempt with an unquoted `--include=*.tsx` errored under zsh glob-expansion and falsely reported 0; the quoted re-run gives **69**.

### The ONE allowlist / tracked-debt entry

- `apps/frontend/src/pages/safety/components/EscrowForfeitModal.tsx`

**Why allowlisted (per in-script comment, lines 29–35):** It is a TIER-1 GL-posting path (B9-ESCROW-DESIGN — a forfeit posts an expense/receivable JE). The modal emits a bare `{amount}` number and `forfeitEscrow` converts downstream, so the **emit-unit is not decidable from the modal**: the `escrow_ledger` destination is cents, but the display is `$.toFixed(2)` dollars, and the forfeit route is registry-mounted (not greppable). Converting on inference would repeat "the PartsMasterData trap."

**Blocked because:** the forfeit backend route is missing. The frontend `forfeitEscrow` (`apps/frontend/src/api/driverFinance.ts:294`) POSTs to `/api/v1/driver-finance/escrow/{driverId}/forfeit`, which is **unimplemented server-side** — the only `forfeit` reference in `apps/backend/src` is a doc comment in `escrow-history.service.ts:14`. Clicking Forfeit will 404. This is a financial (`accounting.*` + `driver_finance.*`) change → per CLAUDE.md §1.4 a STOP / HOLD-FOR-JORGE item. It is blocked until Jorge confirms the forfeit endpoint + amount unit, then to be converted as a `[HOLD]` (TIER-1). The script comment states the allowlist must be kept EMPTY except genuinely-blocked fields — every entry is debt to remove.

Relevant paths:
- `/Users/jorgemunoz/IH35-TMS-clean/scripts/verify-money-fields-use-moneyinput.mjs`
- `/Users/jorgemunoz/IH35-TMS-clean/.github/workflows/locked-guards.yml` (lines 215–216)
- `/Users/jorgemunoz/IH35-TMS-clean/apps/frontend/src/pages/safety/components/EscrowForfeitModal.tsx`

---

## 4. GATED / HOLD-FOR-JORGE queue

### 4.1 Open [HOLD-FOR-JORGE] PRs awaiting Jorge

**NONE.** The open-PR queue (5 PRs) contains zero `[HOLD-FOR-JORGE]` titles and zero GATED/financial-approval labels. The HOLD queue is fully drained on the open side.

Open PRs (none HOLD):
- #1426 feat(maint): Create WO modal → render-v5 A–E card layout (match approved render) — no labels
- #1313 chore(deps): Bump the production-dependencies group across 1 directory with 32 updates — `dependencies`
- #1312 chore(deps): Bump the development-dependencies group across 1 directory with 15 updates — `dependencies`
- #1311 chore(ci): Bump actions/checkout from 6 to 7 — `dependencies`
- #852 chore(deps): bump the npm_and_yarn group across 3 directories with 3 updates — `dependencies`, `javascript`

### 4.2 [HOLD-FOR-JORGE] PRs MERGED after approval (newest first)

23 merged HOLD PRs found by title search:

| PR | Title | Date |
|---|---|---|
| #1416 | [HOLD-FOR-JORGE] fix(driver-finance): M-1 dispute resolution amount → MoneyInput | 2026-06-24 |
| #1413 | [HOLD-FOR-JORGE] fix(accounting,banking): M-1 Manual JE debit/credit → MoneyInput | 2026-06-24 |
| #1393 | [HOLD-FOR-JORGE] chore(mdata): loads.temperature_type (Frozen/Fresh) — W-FIX-1 migration | 2026-06-23 |
| #1386 | [HOLD-FOR-JORGE] chore(mdata): qbo_vendors render-v5 §D columns (FIX-7b migration) | 2026-06-23 |
| #1361 | feat(dispatch): Book Load §B reefer/flatbed conditional panels (render-v6) [HOLD-FOR-JORGE] | 2026-06-23 |
| #1360 | feat(dispatch): load-stop Zip Code (render-v6 §C) — postal_code [HOLD-FOR-JORGE] | 2026-06-23 |
| #1319 | feat(dispatch): §7 blue eradication + guard coverage-gap [HOLD-FOR-JORGE — keystone] | 2026-06-22 |
| #1318 | feat(fleet): trailer profile to spec + per-WO links [HOLD-FOR-JORGE — keystone] | 2026-06-22 |
| #1317 | feat(fleet): vehicle/trailer profile §7 blue eradication [HOLD-FOR-JORGE — keystone] | 2026-06-22 |
| #1316 | feat(maint): Arriving Soon hybrid table + In-Transit flat table [HOLD-FOR-JORGE — keystone] | 2026-06-22 |
| #1315 | feat(maint): Fleet table keystone ODOMETER·NEXT PM·OPEN WO [HOLD-FOR-JORGE — awaits GUARD] | 2026-06-22 |
| #1299 | [HOLD-FOR-JORGE] CHAIN-03 STEP-2: canonical bill resolver + flag-gated Bill→GL post | 2026-06-22 |
| #1298 | [HOLD-FOR-JORGE] CHAIN-03 STEP-1: Create Bill → GL DRAFT-JE proof (writes nothing) | 2026-06-22 |
| #1289 | [HOLD-FOR-JORGE] telematics: Samsara odometer ingest (Block E #13) | 2026-06-21 |
| #1287 | [HOLD-FOR-JORGE] catalogs: Cargo Claim Reasons (#8) — table + CRUD + page | 2026-06-21 |
| #1286 | [HOLD-FOR-JORGE] catalogs: DOT Violation Types (#7) — table + CRUD + page | 2026-06-21 |
| #1281 | [HOLD-FOR-JORGE] gate v2: target-aware ALTER own-new-table neutral | 2026-06-21 |
| #1278 | [HOLD-FOR-JORGE] gate: CREATE-TABLE-only neutral (additive new-table migrations) | 2026-06-21 |
| #1270 | [HOLD-FOR-JORGE — TIER 1] HOLD-05 (CHAIN-07) settlements 500 diagnosis + GL tie-out design | 2026-06-20 |
| #1269 | [HOLD-FOR-JORGE — TIER 1] HOLD-04 (CHAIN-06) Invoice→AR→Receive chain design | 2026-06-20 |
| #1268 | [HOLD-FOR-JORGE — TIER 1] HOLD-03 (CHAIN-05) bank feed categorize→match→post design | 2026-06-20 |
| #1267 | [HOLD-FOR-JORGE — TIER 1] HOLD-02 (CHAIN-04) Bill Payment tie-out design + draft JE | 2026-06-20 |
| #1266 | [HOLD-FOR-JORGE — TIER 1] HOLD-01 (CHAIN-03) Create Bill → GL design + draft JE proof | 2026-06-20 |

> This session's four HOLD PRs (#1386, #1393, #1413, #1416) are all already merged.

### 4.3 Newest migration files (`db/migrations/`, last 8)

- `202606211400_vehicle_location_odometer.sql`
- `202606221000_block7_loads_piece_po.sql`
- `202606221100_block8_wo_vmrs_serialized_parts.sql`
- `202606221200_wo_enhancements_cancel.sql`
- `202606231300_load_stops_postal_code.sql`
- `202606231400_loads_reefer_tarp_detail.sql`
- `202606231500_qbo_vendors_renderv5_d_fields.sql`
- `202606231600_loads_temperature_type.sql` (newest — ties to merged HOLD PR #1393)

---

## 5. Create-WO render-v5 — #1426

| Item | Value |
|---|---|
| PR | #1426 feat(maint): Create WO modal → render-v5 A–E card layout (match approved render) |
| State | **OPEN, NOT merged** (`mergedAt: null`); no labels |
| Source layout present | render-v5 A–E card layout present on-branch — 9 marker hits, all four families: `data-testid="create-wo-render-v5"` ×1, `SectionCard badge` ×5 (A–E cards), `AssetLocationMap` ×2, `wo-pay-seg` ×1 |
| Live status | Since #1426 is still OPEN/unmerged, the render-v5 A–E layout is **not yet on main/live** |

### Two WO surfaces (distinct files/routes)

1. **/maintenance Create-WO modal** — `apps/frontend/src/pages/maintenance/components/CreateWorkOrderModal.tsx` — the render-v5 rebuild target (#1426).
2. **/work-orders console** — `apps/frontend/src/pages/work-orders/WorkOrdersConsoleListPage.tsx` (imported at `manifest.tsx:105`; routed at lines 1329 and 1736 — two route mounts). **Untouched by the render-v5 work.**

---

## 6. Carry-over / still-open from prior trackers

> Baseline: MASTER_TRACKER_2026-06-17 (prod build `596e85c`) is the most-recent prior tracker but ~7 days + ~320 commits stale. None of the three prior trackers reflect HEAD (#1422). Items below carry their VERIFY/status flag.

**MASTER_PROGRESS (06-16) follow-up backlog #876–#890:**
- #876 INS-COVERAGE assets-vs-units mismatch — **still-open / VERIFY**
- #877 COA-ACCOUNTS-UNAUDITED — **still-open** (Tier-1, financial, no self-merge)
- #878 SEC-PROD-APP-ROLE-BYPASSES-RLS (P1, biggest blast radius) — **still-open** (Tier-1)
- #879 EXPENSE-VOID-BLOCK-IF-LINKED (gate before VOID_ENFORCEMENT flip) — **still-open** (Tier-1)
- #880–#885 multi-entity COA commingling / Path-B / TRK-QBO-mapping — **still-open** (Tier-1)
- #886 Samsara trailer dual-write — **still-open** (deferred)
- #887 Fleet-tab-in-Safety — **still-open** (held, locked-count)
- #888 rehire workflow — **still-open** (deferred, migration)
- #889 BLOCK-6 demo/test purge — THE go-live gate — **still-open** (gated on GUARD + Jorge)
- #890 HOS `samsara_driver_id` unpopulated — **still-open** (deferred)

**MASTER_TRACKER_2026-06-17 — 224 shipped / 70 pending (~10 Tier-1):**
- §3a PARTIAL: Block-E/F crons, Block-Q DOCS upload UI, Block-Z import route, Block-K/AL class write-path, Block-AF help articles, AI-1 ledger-write period lock, AI-2/AI-3 financial cron probes — **still-open / VERIFY**
- §3b Tier-1 (LANE B, no self-merge): B1–B15 — COA partial-unique, EXPENSE_GL flip, Phase-3 QBO sync, void/reversal, period-close, #878 RLS bypass, recon/financial probes, audit hash-chain, bank reconcile-commit, owner-only opening balances, Block-35 Chart of Accounts — **still-open** (Tier-1)
- §3c Finance-Hub FH-3..FH-8 — **still-open**
- §3d 12 Wave-5 hardening — **still-open / VERIFY**
- §3e Phases 6/7/8 future — **still-open**
- §3f NEEDS-ROW: PERMISSIONS-DESIGN has no row — **still-open**

**PENDING-INVENTORY-2026-06-15 (true actionable ≈55–65, ~12 Tier-1):**
- FUEL sub-nav (#05-Block-U) routing fix — **VERIFY**
- DISPATCH sub-nav (#06-Block-V) routing fix — **VERIFY** (heavy dispatch-board/wizard work landed; confirm against live)
- Fuel / Accounting / Fleet catalogs (T11.21.6A/7A/8A) — **VERIFY** (catalog backlog #1280–#1287 shipped, some `[HOLD-FOR-JORGE]`; confirm these three sets specifically)
- cleanup-hyphen / list-error-states — **VERIFY**
- orphan triage — **VERIFY**
- A20 Insurance-500 — **still-open** (HELD)

**Likely-now-resolved (flag VERIFY against live code):**
- Catalogs Fuel/Accounting/Fleet (T11.21.6A–8A; PENDING-INV #128–134) — **VERIFY** (#1280–#1287 shipped)
- DISPATCH sub-nav routing (#06-Block-V) — **VERIFY** (#1335–#1378 work landed)
- HOS clocks / driver HOS block — **VERIFY** (#1355/#1358/#1363/#1373/#1378; #890 data-mapping likely still open)
- Block-E services catalog 500 (PENDING-INV #59/#359) — **VERIFY** (#1280 created `mdata.maintenance_services`; ETA cron remainder likely PARTIAL)
- Cancel-Load enum reason — **VERIFY** (#1335 fixed preValidation enum rejection)

> A fresh reconcile (`gh pr list --state merged` for #1020→#1422) is required before trusting any prior pending count.

---

## 7. Definition-of-done gaps still owed

- **EscrowForfeit (M-1 tracked debt):** forfeit backend route `/api/v1/driver-finance/escrow/{driverId}/forfeit` is unimplemented (only a doc comment in `escrow-history.service.ts:14`). Frontend `forfeitEscrow` will 404. Financial (`accounting.*` + `driver_finance.*`) → STOP / HOLD-FOR-JORGE; convert the modal to MoneyInput only after Jorge confirms the endpoint + amount unit (cents vs dollars). Allowlist must return to empty.
- **Design-parity guard re-point:** confirm the design-parity guard targets the render-v5 approved render for the Create-WO modal once #1426 merges (currently OPEN). VERIFY guard pointer.
- **GUARD live-verify of converted inputs:** the M-1 sweep is guard-PASS at floor and CI-wired, but live-verification of the 69 converted money inputs on prod (and the byte-for-byte cents-vs-dollars correctness per surface) is GUARD-owned and not yet recorded as done. VERIFY.
- **#1426 render-v5 not live:** the Create-WO A–E card layout exists on-branch only; not on main/live until #1426 merges.
- **/work-orders console parity:** the second WO surface (`WorkOrdersConsoleListPage.tsx`, two route mounts) is untouched by render-v5; parity with the maintenance modal is owed. VERIFY scope.
