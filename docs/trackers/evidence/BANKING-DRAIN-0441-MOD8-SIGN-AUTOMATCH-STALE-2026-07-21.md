# Banking drain — 0441-mod8 sign + auto-match: STALE evidence (2026-07-21)

**Builder role:** Cursor BUILDER. This PR is **docs/evidence only** — no code, no merge, no Neon-apply.
It reconciles two banking pile items that `docs/trackers/block-audit-piles-2026-07-21.json`
classifies as `GAP` (OPEN) but which are in fact **shipped on `origin/main`, guarded, and CI-wired**.

Base: `origin/main` @ `e2db37a74`.

---

## 1. `0441-mod8-plaid-sign-deposits-negative` → **STALE (fixed + guarded)**

**Pile audit-note (block-audit-piles-2026-07-21.json):**
> pile=GAP · module=banking · "OPEN: BankAccountDetail.tsx transaction table still needs
> is_credit-aware sign handling (deposits render as negative amounts)."

**Reality on `origin/main`:**

- `apps/frontend/src/pages/banking/BankAccountDetail.tsx` no longer renders an inert table. The
  route mounts the categorize-capable live register `BankingTransactionsDesignView` (KEYSTONE, #2371).
- Signed amounts are derived from `is_credit` via `spentReceived()` and
  `formatBankTransactionSignedAmount()`:

  ```
  export function spentReceived(tx: PlaidBankTransaction) {
    const amount = Math.abs(Number(tx.amount_cents ?? 0));
    if (amount <= 0) return { spent: 0, received: 0 };
    const isMoneyIn = tx.is_credit || Number(tx.amount_cents ?? 0) < 0;  // is_credit-aware
    if (isMoneyIn) return { spent: 0, received: amount };
    return { spent: amount, received: 0 };
  }
  ```

  Deposits (money-in / `is_credit`) render positive; withdrawals (money-out) render negative.
  The archived read-only table (kept importable, never routed) uses the same
  `formatBankTransactionSignedAmount`.

**Fix history:**
- `51eea4b86 fix(banking): BankAccountDetail is_credit-aware amounts (0441-mod8) (#2667)` (frontend)
- `4549c655e fix(banking): register Deposits/Withdrawals columns were swapped (signed amount_cents) (#1162)` (backend register API)

**Guards (both PASS on `e2db37a74`):**
- `scripts/verify-banking-bankaccountdetail-is-credit-amounts.mjs` — wired at
  `scripts/verify-steps/142-verify-banking-bankaccountdetail-is-credit-amounts.mjs`
  → `OK — BankAccountDetail txn amounts are is_credit-aware (spentReceived + formatUsdCents)`
- `scripts/verify-bank-register-sign.mjs` — wired via `.github/workflows/locked-guards.yml`
  (backend `banking.routes.ts`: deposits = `amount_cents < 0` (money in), withdrawals = `amount_cents > 0`)
  → `PASS verify-bank-register-sign`

**Verdict:** STALE. No fix required; the audit-note predates #2667/#1162. Financial-touching surface,
but no new GL math introduced by this reconciliation (docs only).

---

## 2. `0441-mod8-auto-match-button-dead` → **STALE (wired + guarded)**

**Pile audit-note:**
> pile=GAP · module=banking · "OPEN: Button remains disabled/dead; not wired to the
> auto_matched_candidates worklist flow."

**Reality on `origin/main`:**

- `apps/frontend/src/pages/banking/ReconciliationWorkspace.tsx` — the **Auto-Match Suggestions**
  button is enabled by `canOpenAutoMatchSuggestions` (session + companyId + `bank_account_id`) and
  navigates to `/banking/reconciliation?account_id=&period_start=&period_end=`.
- `apps/frontend/src/pages/banking/BankReconciliationPage.tsx` honors that deep link, loads the
  `auto_matched_candidates` worklist, and exposes **Accept** (`acceptBankReconMatch`) / **Reject**
  (`rejectBankReconMatch`) against the existing bank-recon poster.

**Fix history:**
- `dad7f5479 HOLD: fix(banking) wire Auto Match button to recon worklist (0441-mod8) (#2628)`
- `5ec240624 fix(banking): refetch reconciliation workspace after match/unmatch (0441-mod8) (#2640)`

**Guards (both PASS on `e2db37a74`):**
- `scripts/verify-bank-automatch-button-wired.mjs` — wired at
  `scripts/verify-steps/139-verify-bank-automatch-button-wired.mjs`
  → `PASS (Auto-Match Suggestions wired to auto_matched_candidates worklist)`
- `scripts/verify-bank-automatch-observable.mjs` — wired at
  `scripts/verify-steps/101-verify-bank-automatch-observable.mjs`

**Financial note:** Accept/Reject reuse the **existing** bank-recon matcher/poster (no new scoring,
no new GL math) — session period + account only. It was merged under the standard banking HOLD gate
upstream (#2628). This reconciliation adds no posting logic.

**Verdict:** STALE. No fix required; the audit-note predates #2628/#2640.

---

## Reconciliation action

Both items should move `GAP → STALE` in the next block-audit-piles refresh. The audit-notes were
written before the referenced PRs merged; live `origin/main` + passing CI guards are the proof.

No package.json / `locked-guards.yml` / `ci.yml` edits (Rule 17). No new guards added — the four
guards above already exist and pass. Unmerged by design (BUILDER).
