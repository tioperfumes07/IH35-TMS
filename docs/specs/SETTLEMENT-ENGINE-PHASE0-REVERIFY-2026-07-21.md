# Settlement engine — Phase 0 re-verification + canonicalization-drop audit

**Date:** 2026-07-21 · **Author:** BUILDER (Cursor) · **Block:** FOUNDATION-FIRST work order, Priority 2 / Phase 0
**Scan base:** `origin/main @ 9cc079606` · **Prod base:** Neon `br-fancy-credit-akjnd07a` (RLS-bypassed, same-txn `set_config('app.bypass_rls','lucia',true)`)
**Companions:** `SETTLEMENT-ENGINE-CANONICAL-BLUEPRINT-2026-07-15.md`, `SETTLEMENT-ENGINE-READER-WRITER-INVENTORY-2026-07-16.md` (this doc closes its §1 UNVERIFIED item and refreshes its §2 delta)
**Scope:** READ-ONLY. No writer repoint, no migration, no settlement-logic change. Output = the Phase 1/2 checklist.

---

## 1. Window reproof — the 0-row window is STILL OPEN (verified live 2026-07-21)

Method: single transaction, `SELECT set_config('app.bypass_rls','lucia',true)`, then exact `COUNT(*)` per table
(catalog-driven `query_to_xml`, not `reltuples` estimates) across every relation in the four namespaces.

| Namespace | Tables counted | Rows |
|---|---:|---|
| `driver_finance.*` | 33 | **0 in all 32 settlement tables**; sole exception `driver_bills` = **2** (both `status='open'`, created 2026-06-16 / 2026-06-27 — same two drafts as the 07-15 baseline) |
| `payroll.*` (`driver_settlements`, `driver_settlement_line_items`) | 2 | **0 / 0** |
| `settlement.*` singular (`settlement`, `settlement_line`, `settlement_deduction`) | 3 | **0 / 0 / 0** |
| `settlements.*` plural (`settlement_disputes`, `team_split_configs`, `team_split_load_overrides`) | 3 | **0 / 0 / 0** |

Wider window anchors (same session, RLS-bypassed):

| Fact | Verified value |
|---|---|
| `accounting.journal_entries` | **7** rows |
| `catalogs.accounts` with non-zero `opening_balance_cents` | **0** |
| `mdata.loads` by status | 4 assigned_not_dispatched · 2 booked · 1 dispatched · 1 in_transit · **1 delivered** · 1 cancelled |

> Delta vs the work order's "0 delivered loads": prod now shows **1 delivered load** (verify-first — prod wins).
> It has no settlement rows anywhere, so the settlement window is unaffected; but the window is narrowing.
> All repoints remain pure code changes today.

This closes inventory §1's `UNVERIFIED-NEEDS-PROD-READ`.

---

## 2. Reader/writer inventory refresh — delta @ `9cc079606` vs inventory @ `4e6b0c237`

Re-grepped all three RETIRE namespaces across `apps/backend/src` (SQL verbs, comments classified REF).
**The 07-16 inventory remains accurate.** Confirmations and refinements:

| Item | Status @ `9cc079606` |
|---|---|
| Payroll create/post routes | Still permanent **308 → canonical** (`payroll/driver-settlement.routes.ts`); still registered at `index.ts:1060`. No SQL. Full unmount = P3. |
| `driver-settlement.service.deprecated.ts` | Unmounted; only its own `__tests__/` import it. Live payroll WRITEs exist **only** here (L349 INSERT header, L380 INSERT lines, L645 UPDATE header) — allowlisted in inventory §10. |
| `auto-deductions/apply.ts` | Fully on `driver_finance` (policies `FOR UPDATE`, lines INSERT, header UPDATE). **P2a semantic residual stands:** it writes deductions as negative `settlement_lines` (`line_type='auto_deduction'`, dollars) instead of the `driver_settlement_deductions` sub-ledger (cents, running balance) — blueprint §1: "deductions are NOT negative pay lines". Owner decision needed in P2a. |
| `team-splits/apply.ts` | Writes only `driver_finance.settlement_lines`; still **reads** `settlements.team_split_configs`/`team_split_load_overrides` (P2b/P2f residual). |
| `approval.service.ts` | Fully repointed to `driver_finance` header/lines/escrow. `settlement.*` singular = comment REFs only, repo-wide. **Blueprint problem #4 resolved in code**; P1 columns note below. |
| `settlements/disputes/disputes.routes.ts` | **Still live-writing** `settlements.settlement_disputes` (INSERT L96, UPDATE L226/L271) and still **mounted** (`index.ts:862`) alongside the canonical dispute routes. P2e unchanged. |
| `settlements/team-splits/team-splits.routes.ts` | Still writes `settlements.team_split_configs` (L105/L163) + `team_split_load_overrides` (L202). Not registered in `index.ts` (no `registerTeamSplit*` call found) — writes are dead code unless re-mounted; retire-route-mount allowlist (§12) already watches re-mounting. P2f unchanged. |
| Remaining `payroll.*` READERS | `driver-finance/settlement-pdf-renderer.service.ts` (L115 header, L189 lines — prefer-payroll fallback), `mdata/driver-aggregate.service.ts` (L369/377/387), `payroll/aggregated.routes.ts` (L18), `payroll/settlement-shadow.service.ts` (L77, mounted at `index.ts:1061`). All P2c/P3. |
| Guards | `verify-canonical-table-writes.mjs` (G4), `verify-no-payroll-settlement-writes.mjs`, `verify-settlement-engine-inventory.mjs` (allowlists §10–12) present and wired. |

---

## 3. Canonicalization-drop audit (root-cause finding → Phase 2 checklist)

Diff basis: `payroll/driver-settlement.service.deprecated.ts` (the retired engine's safety properties) vs the
canonical `driver_finance` services that inherited each duty. Line numbers verified in code this session.

### 3.1 Safety properties the deprecated engine HAD

| # | Property | Deprecated evidence |
|---|---|---|
| D1 | Pending-deductions row lock before allocation | `FOR UPDATE` at **L289** (buildDraftLines recovery scan) and **L587** (postSettlement recovery scan) |
| D2 | Settlement-header row lock before post | `SELECT … FOR UPDATE` at **L446** (postSettlement header load) |
| D3 | Idempotency latch on re-post | **L453–459**: `status IN (posted,synced,paid) AND accounting_bill_id AND accounting_bill_payment_id` → return `{ idempotent: true }`, no second write |
| D4 | Kill-switch, no partial write | SETTLE-GATE **L464–473**: `SETTLEMENT_GL_POSTING_ENABLED` OFF → post NOTHING, stay `draft` |
| D5 | Balanced paired JE through the existing poster | `createJournalEntry` (debits==credits or abort), recovery Dr expense / Cr QBO-149, **L626–639** |
| D6 | Draft-only state gate before post | **L460**: `status !== 'draft'` → error |

### 3.2 Where each property lives (or is MISSING) in the canonical engine

| # | Canonical carrier | Verdict |
|---|---|---|
| D1 | `settlement-payrun-close.service.ts` L148 + L224 (`FOR UPDATE`); `settlements-load-bookended.service.ts` L96/L272 | **PRESENT** |
| D2 | `settlement-payment.service.ts` `loadSettlement()` (L43–54) — **plain SELECT, no `FOR UPDATE`** | **DROPPED** ← double-pay enabler |
| D3 | Payment transitions have **no latch**: state is read (L45), validated in JS (`validateTransition`), then UPDATEd — classic TOCTOU. Payrun-close claims idempotent advance recovery (header comment L275) — carried there, but NOT for payment. | **DROPPED for payment** |
| D4 | `settlement-payrun-close.service.ts` L301 (`isEnabled(SETTLEMENT_GL_POSTING_FLAG_KEY)`), guard `verify-settlement-gl-flag-gate.mjs` | **PRESENT** |
| D5 | Payrun-close L432 (up-front debits==credits assert) + L518 `createJournalEntry` | **PRESENT** |
| D6 | Payment service requires `status IN (locked, final)` before queue (L132) | **PRESENT (analog)** |

### 3.3 The 5 unprotected payment transitions (the work-order fix targets, verified)

`driver_finance/settlement-payment.service.ts` — every UPDATE's WHERE is `id + operating_company_id` **only**:

| Transition | UPDATE at | CAS predicate present? |
|---|---:|---|
| → `queued` (`queuePayment`) | L146–156 | **NO** |
| → `sent_to_bank` (`markSentToBank`) | L188–199 | **NO** |
| → `cleared` | L231–239 | **NO** |
| → `bounced` | L280–288 | **NO** |
| → `manual_paid` | L343–352 | **NO** |

Additional gaps verified:

- **Event idempotency — MISSING.** `settlement_payment_events` INSERT (L63–76) has no uniqueness on the logical
  transition. **Prod DDL proof:** only `settlement_payment_events_pkey(id)` + a non-unique
  `(operating_company_id, settlement_id, created_at DESC)` index exist. A race loser or re-run writes a second
  event + audit row today.
- **External ACH idempotency key — MISSING.** `markSentToBank` stores a caller-supplied `payment_bank_reference`
  (nullable text); there is no per-release idempotency key generated/enforced at the rail boundary.

### 3.4 Prod-truth correction to the work order (§0 verify-first — prod wins)

The order says the CAS must use `IS NOT DISTINCT FROM` because "the column is nullable, NULL coerces to
'unpaid'". **Verified on prod:** `driver_finance.driver_settlements.payment_state` is **`NOT NULL DEFAULT
'unpaid'`** with CHECK `payment_state IN ('unpaid','queued','sent_to_bank','cleared','bounced','manual_paid')`.
So no live row can hold NULL today — `=` would currently match. The TS type (`payment_state: PaymentState |
null`, coerced via `?? "unpaid"`) is what's out of sync with prod.

**Recommendation unchanged:** implement the CAS with `IS NOT DISTINCT FROM` exactly as ordered — it is
NULL-safe if any environment or future migration drifts, costs nothing, and matches the JS coercion semantics.
But Phase 2 acceptance should not *depend* on NULL behavior that prod forbids; the doc records the true DDL so
the test plan is honest.

---

## 4. Phase 1 checklist (additive migrations — HOLD, owner applies)

Derived from §3; each is `IF NOT EXISTS`, FORCED-RLS-preserving, idempotent, GRANTs to `ih35_app`:

1. **Unique event key** — partial unique index on `driver_finance.settlement_payment_events` over the logical
   transition (e.g. `(settlement_id, event_type)` for non-repeatable transitions; `retried` stays repeatable).
   Exact shape decided in the Phase 2 PR alongside the loser-writes-nothing test.
2. **ACH idempotency key** — column on `driver_finance.driver_settlements` (e.g.
   `payment_release_idempotency_key text`) + partial unique index, generated per release attempt in
   `markSentToBank`; a retry after partial failure reuses the same key so the rail sees one instruction.
3. **Approval columns** — `settlement-payrun-close.service.ts` L595 notes canonical-repoint migration
   `202607110220` is **HELD**; re-inventory what `approval.service.ts` needs that isn't live yet (its code
   already targets `driver_finance` columns — verify each exists on prod before Phase 2 approval work).
4. *(No schema needed for the CAS predicates or `FOR UPDATE` — pure code.)*

## 5. Phase 2 checklist (code, HOLD, one PR per feature)

| Item | Fix |
|---|---|
| CAS on all 5 transitions (§3.3) | `AND payment_state IS NOT DISTINCT FROM $expected` on each UPDATE; 0-row result → `invalid_payment_state_transition` (no event, no audit) |
| `loadSettlement()` | add `FOR UPDATE` (restores D2; precedent: payrun-close L148) |
| Event idempotency | INSERT … ON CONFLICT DO NOTHING against the Phase 1 unique key; loser writes no event/audit row |
| `markSentToBank` rail key | generate/persist idempotency key before send; duplicate release attempt with same expected-state must be a no-op |
| P2a residual | owner ruling: auto-deductions as sub-ledger rows (`driver_settlement_deductions`, cents) vs current negative pay-lines |
| P2b/P2f | team-splits reads + config routes → `driver_finance.team_settlement_splits` |
| P2c | repoint the 4 remaining payroll READERS (pdf-renderer, driver-aggregate, aggregated.routes, settlement-shadow) |
| P2e | converge disputes → `driver_finance.driver_settlement_disputes`; retire plural routes + internal dup table |
| Unit conversion gate | payroll `amount_cents` → `settlement_lines.amount` is **÷100**; deduction sub-ledger stays cents; known-amount end-to-end spot check is a hard acceptance gate |

## 6. Phase 4 guard checklist (self-merge, verify-steps only)

1. Extend G4 to hard-fail any INSERT/UPDATE into `payroll.*` / `settlement.*` singular / plural RETIRE tables
   (today parts are allowlisted-shrink, not absolute).
2. Transition-matrix pinning test for `allowedTransitions` (backlog `0091-g7-1`).
3. Static guard: every `payment_state` UPDATE in `settlement-payment.service.ts` must carry the CAS predicate.
4. Mounted-route guard: only canonical create + dispute routes may register (inventory §12 allowlist shrinks to empty at P3).

---

**Phase 0 verdict:** window OPEN (narrowing — 1 delivered load now exists), inventory CONFIRMED with the
deltas above, drop-audit complete. Ready for GUARD review; Phase 1 SQL will be drafted only after GUARD
signs off on this inventory and the owner ratifies the P2a sub-ledger question.
