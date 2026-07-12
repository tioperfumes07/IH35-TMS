# Flag verify-then-flip — state table + safe flip order (2026-07-12)

Per owner approval (verify → GUARD-proof → flip). **No flag flips in code here** — this is the required
state table + order. Every flip stays owner-gated and happens ONLY after live proof on the prod branch
(GUARD signs off). "code-guard" = the static CI guard runs green locally now; "live-proof" = the posting/void
path verified balanced on real data (prod, owner-gated) — NOT done here.

## State table

| Flag | Module | Code-guard | Live-proof | Ready to flip? |
|---|---|---|---|---|
| FINANCE_HUB_UI_ENABLED | FH shell UI (gates all FH tabs) | UI-only (no posting) | needs prod | after live-load check |
| FINANCE_HUB_CALCULATOR_ENABLED | FH-4 Calculator | ✅ PASS (no-posting) | needs prod | UI-safe |
| FINANCE_HUB_LOAN_WIZARD_ENABLED | FH-2 Loan Wizard | ✅ PASS (no-posting) | needs prod | UI-safe |
| FINANCE_HUB_AMORTIZATION_ENABLED | FH-3 Amortization UI | ✅ PASS (no-posting) | needs prod | UI-safe |
| FINANCE_BREAK_EVEN_UI_ENABLED | FH Break-even UI | UI-only | needs prod | UI-safe |
| FIXED_ASSET_AUTOPOST_ENABLED | FH-1 depreciation autopost (POSTS) | ✅ PASS | needs prod | after live-proof |
| AMORTIZATION_GL_POSTING_ENABLED | FH-3 amortization GL post (POSTS) | ⚠️ **no guard** | needs prod | **build guard first** |
| PREPAID_EXPENSES_POST_ENABLED | FH prepaid post (POSTS) | ⚠️ **no guard** | needs prod | **build guard first** |
| VOID_ENFORCEMENT_ENABLED | VOID core enforcement | ⚠️ **no general guard** | needs prod | **build guard first** |
| MONEY_CONTROL_VOID_REVERSAL_ENABLED | VOID reversing entries (inv/JE/bill/expense/settlement) | ⚠️ **no guard** | needs prod | **build guard first** |
| VOID_QBO_MIRROR_ENABLED | VOID QBO mirror | UI/mirror-only | needs prod | after live check |
| WO_VOID_ENABLED | Work-order void | ⚠️ **no guard** | needs prod | **build guard first** |
| BILL_PAYMENT_GL_POSTING_ENABLED | CHAIN-04 bill-payment post | ✅ PASS | approved live test | after live-proof |
| BANK_FEED_GL_POSTING_ENABLED | CHAIN-05 bank-feed categorize→post | ✅ PASS | approved live test | after live-proof |

## Recommended flip order (safest first)

**Wave 1 — UI-only, zero posting risk** (flip after a live page-load check, no GL impact):
1. `FINANCE_HUB_UI_ENABLED` (gates the FH tabs; must precede the FH sub-flags)
2. `FINANCE_HUB_CALCULATOR_ENABLED`, `FINANCE_HUB_LOAN_WIZARD_ENABLED`, `FINANCE_HUB_AMORTIZATION_ENABLED`, `FINANCE_BREAK_EVEN_UI_ENABLED`

**Wave 2 — posting paths WITH a passing guard** (flip per-entity only after GUARD live-proves a balanced JE in both registers on the prod branch):
3. `BILL_PAYMENT_GL_POSTING_ENABLED` (CHAIN-04 — approved live test)
4. `BANK_FEED_GL_POSTING_ENABLED` (CHAIN-05 — approved live test)
5. `FIXED_ASSET_AUTOPOST_ENABLED` (FH-1)

**Wave 3 — BLOCKED until a guard is built** (do NOT flip; these posting/void paths have no static guard,
so "never flip onto an unverified path" applies). Build + pass a `verify-*.mjs` for each first, then treat as Wave 2:
6. `AMORTIZATION_GL_POSTING_ENABLED`, `PREPAID_EXPENSES_POST_ENABLED`
7. `VOID_ENFORCEMENT_ENABLED` → `MONEY_CONTROL_VOID_REVERSAL_ENABLED` → `WO_VOID_ENABLED` (void core before per-type)
8. `VOID_QBO_MIRROR_ENABLED` (last — only after the void core + QBO parity are proven)

## Owner actions required (gated — not doable in code here)
- Provide prod-branch access (per-connection OK) so GUARD can live-prove each Wave-2 path posts a balanced JE landing in both registers.
- The per-entity flag flips themselves (owner-entered), in the order above, one wave at a time.

## Coder next steps (non-financial, buildable now)
- Build the missing guards for Wave-3 flags (AMORTIZATION_GL_POSTING, PREPAID, VOID_ENFORCEMENT, MONEY_CONTROL_VOID_REVERSAL, WO_VOID) so they can advance to Wave 2. Each as its own PR with a `verify-*.mjs`.
