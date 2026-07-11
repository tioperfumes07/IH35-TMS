# Settlement-Engine Canonical Decision & Retirement Plan

**Block:** Tier-1 0091-c1-1 (two-settlement-engines) · **Status:** DESIGN ONLY — no code/behavior change in this PR.
**Date:** 2026-07-10 · **Classification:** TIER-1 FINANCIAL — decision requires owner ratification.
**Companion:** `docs/specs/repairs/REPAIR-SETTLEMENT-ENGINE-RECONCILIATION.md` (2026-07-05 analysis). This doc
**supersedes nothing**; it records the canonical selection + retirement sequence and re-verifies the REPAIR
doc's findings against live `main` (several had drifted — see §5).

---

## 1. The problem: three settlement code paths, verified live (file:line, `main`, 2026-07-10)

| # | Path | file:line | Writes to | Flag gates | Wired to prod? |
|---|------|-----------|-----------|------------|----------------|
| **A** | `postSettlement` | `apps/backend/src/payroll/driver-settlement.service.ts:403` | `accounting.bills` + `accounting.bill_payments` (Bill+Payment), driver-bond **escrow**, optional paired JE, status→`posted` on **`payroll.driver_settlements`** | `SETTLEMENT_GL_POSTING_ENABLED` (`:449`, kill-switch, returns `blocked_flag_off` when OFF); `SETTLEMENT_CAPPED_RECOVERY_ENABLED` (`:538`) | **YES — LIVE.** `POST /api/v1/payroll/driver-settlements/:id/post` → `driver-settlement.routes.ts:62`, registered `index.ts:1023` |
| **B** | `postSettlementToGl` (FIN-18) | `apps/backend/src/accounting/settlement-posting/settlement-posting.service.ts:213` | a single **balanced JE** in `accounting.journal_entries` + `journal_entry_postings` (Dr driver-pay / Cr deduction buckets / **Cr driver-payroll clearing**); reads canonical **`driver_finance.*`** | `SETTLEMENT_GL_POSTING_ENABLED` (`:221`) + FLSA consent gate + block-not-cap floor | **NO — DORMANT.** `settlement-posting.routes.ts:56` is **never registered** in `index.ts` (verified: no import, no autoload). Tests only. |
| **C** | `closeLoadBookendedSettlementForDriver` | `apps/backend/src/driver-finance/settlements-load-bookended.service.ts:220` | **`driver_finance.driver_settlements`** (status→`closed`), `settlement_lines`, deduction ledger, abandonment chargebacks; **NO `accounting.*` GL** | `SETTLEMENT_DEDUCTION_APPLY_FLAG` (`:342`), contract-terms flag (`:323`) | **YES — LIVE**, but posts **no GL**. Reg `index.ts:829/831` via `closeSettlementForFinalLoad`. Calls **neither** A nor B. |

**The divergence risk (why this block exists):** the *record/lifecycle* model that production actually runs (C,
on `driver_finance.*`) is **not** the model that posts GL money (A, on `payroll.*`). A future dispatch could
wire B, or extend A, and the two would drift on deduction math, floor policy, and clearing treatment. Two of the
three even read different deduction ledgers. This is a latent double-books hazard, not a today-outage.

---

## 2. Canonical decision (proposed — awaiting owner ratification)

Consistent with the REPAIR doc §2.1 and the canonical-tables mapping
(`IH35-TMS-MASTER-LINKAGE-WIRING-REFERENCE-2026-07-10.md`: `driver_finance.*` canonical, `payroll.*` retired):

1. **THE settlement record/lifecycle model = `driver_finance.*`** (`driver_settlements` +
   `driver_settlement_deductions` as the single deduction ledger). Path **C** is the canonical close.
   *Evidence it is already the live lifecycle:* REPAIR doc §2.1:168 — *"THE engine = Surface A `driver_finance.*`
   as the settlement lifecycle + record model."*

2. **GL posting is DRIVEN FROM the `driver_finance` settlement, not from `payroll.*`.** Re-home Engine A's
   Bill+Payment posting muscle so it is invoked *by* the `driver_finance` close (C) against the `driver_finance`
   record — rather than from the parallel `payroll.driver_settlements` row. REPAIR doc §2.1:181-184:
   *"Re-home its posting muscle … and freeze `payroll.driver_settlements` / `payroll.driver_settlement_line_items`
   as read-only legacy."*

3. **`payroll.driver_settlements` / `payroll.driver_settlement_line_items` → FROZEN read-only legacy.** No new
   writers. Additive-only: archive, never delete (§7 product lock). Existing rows and the CI lock
   `verify-driver-settlement-uses-bill-not-je.mjs` stay in force until step 4 is ratified.

4. **⚠️ OPEN DECISION — Bill vs JE for the GL detail (yours, Jorge).** This is the one locked-vs-locked conflict
   the REPAIR doc explicitly deferred (§7 Q1:381-386) and I do **not** resolve here:
   - **Option Bill (recommended, status-quo):** keep the A/P **Bill + BillPayment** as the canonical GL artifact
     (it is what's live, QBO-synced, and CI-locked). FIN-18 (B) becomes the **GL-detail / reversal companion** or
     is archived. Lowest migration risk; preserves QBO parity.
   - **Option JE:** promote FIN-18's **balanced JE with net-pay clearing** to canonical, wire its route, and make
     the Bill a downstream mirror. Cleaner GL semantics (explicit clearing) but breaks the current Bill lock and
     QBO-sync assumptions; larger blast radius.
   - **Recommendation:** **Bill wins**, driven from `driver_finance`, FIN-18 held as reversal/detail companion —
     matches REPAIR §7 and minimizes disruption to live QBO-synced posting. **Awaiting your yes/no.**

---

## 3. Retirement / migration sequence (no step ships without its own gated PR + your OK)

- **S0 (this doc).** Ratify §2.1–§2.3 and pick §2.4 (Bill vs JE).
- **S1 — kill-switch coherence (DONE).** Engine A already gates on `SETTLEMENT_GL_POSTING_ENABLED`
  (`driver-settlement.service.ts:449`, shipped SETTLE-GATE #2312). Engine B already gates on the same flag
  (`:221`). No wiring of B. ✅ verified live.
- **S2 — re-home posting (code, Tier-1, HELD).** Introduce a `driver_finance`-driven invocation of the Bill+Payment
  poster (reuse existing `createBill`/`payBill`; **no new GL math** per §2 constitution), so path C can post via the
  canonical record. Keep behind the existing OFF flag; byte-identical output when ON.
- **S3 — freeze `payroll.*` writers (code, Tier-1, HELD).** Add a CI guard that fails if any **new** writer targets
  `payroll.driver_settlements(_line_items)`; existing writer path A becomes reversal-only or is superseded by S2.
- **S4 — FIN-18 disposition (per §2.4).** If Bill wins: mark B reversal/detail companion (or archive under
  additive-only). If JE wins: register B's route + migrate. Either way a separate Tier-1 PR.
- **S5 — floor + deduction-ledger unification** (REPAIR §3/§4): one floor resolver, default **5%** editable at
  apply-time; single `driver_finance.driver_settlement_deductions` ledger with per-line `load_id`.

Each of S2–S5 is its own HELD PR with tests + Neon-branch proof; **none self-merges** (financial).

---

## 4. What this block does NOT do

- **No code, no behavior change, no migration** in this PR (design-only, per the block's acceptance).
- Does **not** delete Engine B or `payroll.*` (additive-only; archive-not-delete).
- Does **not** flip any flag (owner-only).
- Does **not** resolve §2.4 — that is your call.

---

## 5. Re-verification of the REPAIR doc vs live `main` (drift found — prod/repo wins over the 2026-07-05 doc)

- **Line numbers drifted:** `postSettlement` is at `:403` (doc said `:390`).
- **H3-4 "raw `lib.feature_flags` read" finding is STALE/FIXED:** `settlementCappedRecoveryEnabled` now routes
  through `isEnabled()` (`driver-settlement.service.ts:127-139`), not a raw `SELECT default_enabled`.
- **The "deduction applier has no non-test caller" finding is FIXED:** it is now wired into the live close
  (`settlements-load-bookended.service.ts:346`, behind `SETTLEMENT_DEDUCTION_APPLY_FLAG`, OFF) — the REPAIR-A
  overpay gap is closed in code, flag-gated.
- **UNVERIFIED (gated):** per-entity live flag state and QBO-149 tie-out were not read from prod Neon this session
  (§1.5). By design all three settlement money flags default OFF; live override state must be confirmed before S2.

---

## 6. Acceptance (this block)

- [x] Design doc committed (`docs/specs/SETTLEMENT-ENGINE-CANONICAL.md`) with the decision + retirement plan.
- [x] No code/behavior change.
- [ ] **Owner ratification of §2 (esp. §2.4 Bill-vs-JE) — pending Jorge.**
