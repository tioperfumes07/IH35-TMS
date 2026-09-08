# USMCA ↔ AlwaysTrack ↔ Faro — Reconciliation State of Record

- **Author:** Cursor (lead)
- **Date:** 2026-09-07 (Laredo) / 2026-09-08 UTC
- **Scope:** USMCA only (`5c854333-6ea5-4faa-af31-67cb272fef80`)
- **Source of truth:** Neon `tiny-field-89581227` branch `br-fancy-credit-akjnd07a`, read with `SET LOCAL app.bypass_rls='lucia'`; AlwaysTrack tie-out `IH35-SETTLEMENT-TIEOUT-2026-09-04.xlsx`; Faro purchase ledger `export (3).csv`.

This file is a measured snapshot, not a plan. Every number below was read live.

---

## 1. FACTORING — RECONCILED TO THE PENNY (register), GL posting OFF

Faro used ONE account across the Aug-7 Transportation→USMCA transition (same QuickBooks, same AlwaysTrack). The full combined Faro purchase ledger is reconciled into the app:

| Source | Invoices | Gross | Advance | Reserve | Fee | Chargeback |
|---|---|---|---|---|---|---|
| Raw Faro `export (3).csv` | 51 | $151,740.00 | — | — | — | — |
| App `accounting.factoring_advances` (all `advanced`) | 51 | $151,740.00 | $147,187.78 | — | — | — |
| App `factor.faro_daily_imports` (08/10–09/04) | 51 | $151,740.00 | $147,187.78 | $2,276.11 | $2,276.11 | $0.00 |

All three agree: **51 = 51, $151,740.00 = $151,740.00**. Transportation-origin invoices are included (FAC-2026-00050 ITS #007 $350, FAC-2026-00051 MPH #016 $3,800, FAC-2026-00036 FLS #008 $525) alongside the USMCA load invoices.

### OPEN (owner-authorized money op): factoring not yet in GL
- `FACTORING_GL_POSTING_ENABLED` = **OFF** for USMCA (default false, no per-entity override).
- Effect: advances/reserves/fees live in the **factoring subledger/register** and reconcile to Faro, but there are **no factoring journal entries in the GL** yet (Factoring Advance liability, Factoring Reserve asset, Factoring Fees / Transaction-Wire Fees expense).
- To satisfy "all must be in GL + register + reconciled": enable the flag for USMCA and back-post the 51 advances through the **existing gated factoring poster** (no new GL math), then re-verify GL = register = Faro. This is a Tier-A money operation.

---

## 2. LOADS — real load numbers already match AlwaysTrack

- Real USMCA loads (`is_sample_data=false`) begin at **13508** — matching "first load booked under USMCA on Aug 7."
- Load numbers in the app are the **same numbers as AlwaysTrack** (the tie-out keys on the identical load numbers, 13508…13581).
- Loads **13471–13507** and scattered early ones exist in USMCA only as `is_sample_data=true, cancelled` placeholders (pre-cutover Transportation tours). 13502/13507 do not exist. These are the Transportation-era loads, correctly NOT real USMCA rows.
- Going forward, dispatch mints plain-digit load numbers via `allocateNextLoadNumber` — same convention as AlwaysTrack (GO-10 REV-B / GO-19).

---

## 3. SETTLEMENTS — number model NOT yet identical to AlwaysTrack (open)

- **AlwaysTrack settles per completed tour** (NB opens a settlement; TR/SB legs join the same tour), 4-digit numbers **5753, 5760–5796** (37 in the 09-04 tie-out + 5796 correction = 38). Driver and Company settlements for a tour share ONE number.
- The app seed created **one mega-row per driver** and merged several tours onto it, then tagged each mega-row with only ONE of its AlwaysTrack numbers (`source_document_ref`). Example: app **S-13643** carries AlwaysTrack **5767+5774+5784+5794+5796** but is tagged only `5784`; **S-13645** carries **5771+5777+5783+5789** tagged only `5783`.
- **Safe to re-cut:** `driver_settlement_gl_runs = 0` and `settlement_payment_events = 0` for USMCA — no GL posted and no payments recorded behind any "closed" settlement. "Closed" here = grouped + net computed only. So void/redo is a data regroup, not a GL reversal.
- **Authoritative mapping** to re-cut against (from `IH35-SETTLEMENT-TIEOUT-2026-09-04.xlsx`, BY LOAD sheet), 37 signed settlements → 81 loads, each with a TOTAL DUE (doc). The re-cut must exclude sample/Transportation-only loads and match each real USMCA load to its signed number, with started/closed dates.

### OPEN: re-cut app driver+company settlements to 1:1 AlwaysTrack tours
- Each AlwaysTrack signed number becomes its own app settlement (same loads, same net), `source_document_ref` = signed number, driver+company sides share it, started/closed dates from the tour.
- Mechanism: existing `confirmPresettlementLink` (`create_new` / `link_existing`) — no new write path (`docs/audit/TOUR-SPLIT-PLAN-2026-09-06.md`).

---

## 4. PR / DEPLOY STATE (2026-09-08 00:15Z)

- Merged this session: ACCT-F5723 void-reversal FK fix (PR #21355, sha d95dbc37) — **backend LIVE**; Claude-1 docs INV-01+VC-06 (PR #21343, sha 1e329202).
- Held: Dependabot group bumps PR #21260 (prod, 22 updates) and PR #21347 (dev, 14 updates) — both **FAIL `build-typecheck`** (npm ERESOLVE class); merging would break the deploy. Need dependency-resolution fix before merge.
- Backend `srv-d7rpem7avr4c73fhp4n0` and frontend `srv-d7s46dbrjlhs7383i150` deployed to main tip `48b535e4` (ACCT-F26031: AR tie-out closed 10/10, healthz `ledger.ar_tieout` + `ledger.posted_without_posting` green).

---

## 5. REMAINING TO REACH "IDENTICAL TO ALWAYSTRACK"

1. **Enable factoring GL posting** for USMCA + back-post 51 advances through the gated poster → factoring in GL + register + Faro all equal. (Owner-authorized; Tier A.)
2. **Re-cut driver + company settlements** to 1:1 AlwaysTrack tour numbers (38), same loads, same net, started/closed dates. (Safe regroup — 0 GL, 0 payments.)
3. Load numbers + go-forward dispatch numbering: **already identical** to AlwaysTrack.
