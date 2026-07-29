# ACCT-F16 — two held posting flags had NO poster behind them

**Finding:** ACCT-F16 (ranked, accounting) · **Lane:** FINANCIAL-HOLD → AUTO (owner ruling 2026-07-29:
auto-apply on green CI, self-merge OK, no `JORGE-APPROVED` gate) · **Date:** 2026-07-28

## The defect

Two money flags existed, were seeded DEFAULT OFF, and were treated as "held, ready to flip". Neither had
anything behind it. Flipping either would have produced no accounting at all, or an error:

| Flag | State before | Consequence of flipping it |
|---|---|---|
| `PREPAID_EXPENSES_POST_ENABLED` | `prepaid-expenses.routes.ts` **hard-refused** create with `422 gl_posting_not_implemented` | Prepaid expenses module becomes unusable — you cannot even create the asset |
| `FINANCE_HUB_AMORTIZATION_POST_ENABLED` | no poster existed anywhere | Silent no-op: loans + schedules persist to `finance.*`, the principal/interest split **never reaches the GL** |

`scripts/verify-fh3-no-posting.mjs` asserted only the *absence* of posting in the FH-3 engine, so the
missing poster was indistinguishable from a healthy state — the guard would have passed forever with the
poster never built. `scripts/verify-prepaid-post-flag-gate.mjs` locked in the placeholder refusal as if it
were the intended design.

## The fix (this PR)

1. **Prepaid purchase entry** — `postPrepaidPurchase()` in the shared FIN-21 spine
   (`amortization-posting.service.ts`), called by the create route on the SAME transaction:
   `Dr prepaid_assets.asset_account_id / Cr prepaid_assets.payment_account_id` for `total_amount_cents`,
   linked back via `prepaid_assets.purchase_je_id` + `posting_status`. Flag ON with either account
   missing REFUSES the whole create (`422 gl_accounts_required`) — an asset is never capitalized
   off-ledger. Period amortization stays on `AMORTIZATION_GL_POSTING_ENABLED` (unchanged).
2. **FH-3 loan-payment entry** — `apps/backend/src/accounting/finance-hub-amortization-posting/`
   (math + service + routes): the 3-leg entry
   `Dr finance.loans.gl_liability_account_id (principal) + Dr gl_interest_expense_account_id (interest)
   / Cr payment_account_id (payment)`, assembled from the **already-persisted**
   `finance.loan_amortization_rows` split. NO new GL math: the header, the balanced lines, the source
   links and the closed-period cutoff are the shared spine's. The FH-3 engine itself still posts nothing.
3. **Guards flipped from "prove absence" to "prove presence + gating"** — see below.

## Guards

| Guard | Now asserts |
|---|---|
| `scripts/verify-fh3-no-posting.mjs` (ci.yml) | (A) the FH-3 engine still posts no GL **and** (B) the poster EXISTS, is gated on `FINANCE_HUB_AMORTIZATION_POST_ENABLED`, reuses the shared `insertJournalEntryHeader` spine (no second header INSERT), calls `assertBalanced`, sources its three legs from the `finance.loans` FKs, and ships a `export default fp(...)` route file so the autoloader mounts it |
| `scripts/verify-prepaid-post-flag-gate.mjs` (locked-guards) | flag-ON POSTS via `postPrepaidPurchase` (not a route-local poster), fails CLOSED on missing accounts, keeps the stale `gl_posting_not_implemented` refusal deleted, and keeps the flag seeded default OFF |
| `scripts/verify-no-silent-noop-posting.mjs` (locked-guards) | the new poster is in `POSTING_FILES` |

Both guards carry a `--selftest` whose bad fixture is the *old* posture (refusal / absent poster), so they
fail on the defect and pass on the fix.

## Remaining

- Both flags stay **DEFAULT OFF**. Enabling them is the owner's call; that is what makes them "held".
- `LIVE PROOF` for the first real entry is **UNVERIFIED** until a flag is enabled on a real entity —
  see "How to prove the first JE" in the PR body.
- No CoA-role work was needed here: both posters resolve their accounts from **row FKs**
  (`prepaid_assets.asset_account_id` / `payment_account_id`, `finance.loans.gl_*_account_id`), never from
  a role binding, so this PR adds no `COA_ROLE_VALUES` entry and no migration. `prepaid_asset_default` /
  `amortization_expense_default` (picker defaults only, deliberately absent from `ROLE_FALLBACKS`) land
  separately in the ACCT-F19 held-flag CoA PR — this poster does not depend on them.
- `prepaid_expense_default` was NOT added: the prepaid expense account already comes from
  `prepaid_assets.expense_account_id`.
