# BANK-ECON-04 — reconciliation_sessions ops density (schema LIVE — not Neon-hold)
**FINDING:** BANK-ECON-04 (P0) · **Lane:** NON-FINANCIAL ops/browser (schema unblocked) · **Module:** banking.
**REWRITE 2026-07-25:** migration `202608030000_bank_accounts_rls_bypass_lucia` is **APPLIED on Neon**. Drop Neon-apply hold language. Remaining work is **ops-density / browser only**.

## RESPOND-BEFORE-CODING (Rule 00/02)
Spec sources reviewed: Banking recon design · #3417 zero-diff · LAW-OF-THE-LAND · Rule 23 (no SURF/ECON PASS without live rows + browser)
Approved screens: Reconciliation workspace
Tab count: unchanged
Deviations: None
NEW SPEC: None — projection / bank-feed posting flags stay OFF

## PROD TRUTH  [GUARD-VERIFIED 2026-07-25]
- Schema fix for `banking.bank_accounts` lucia bypass escape: **applied** (`202608030000`).
- Neon lucia: `banking.reconciliation_sessions` still **0** — now an **operator/use** gap (or residual app bug), **not** “migration unapplied.”
- Do **not** re-open FINANCIAL Neon-apply hold for this migration.

**Step 1:** Start a recon session on live TRANSP (and USMCA if that entity has bank accounts) → zero-diff close path → lucia `reconciliation_sessions > 0`. If start still 404s, that is a **code** bug chase with fresh evidence — not a re-apply of 202608030000.

## LINKAGE
1. `banking.reconciliation_sessions` · `banking.bank_accounts` · statement lines · bank_transactions
2. Hubs: org.companies · catalogs.accounts (cash bind) · identity.users
3. Banking Recon workspace F+R
4. Deployed SHA: coder fills

## STANDARD
QuickBooks Reconcile · NetSuite bank recon controls · RLS.

## THE FIX (ops/browser — schema done)
1. Operator (or scripted smoke) creates ≥1 session with zero-diff closure on prod.
2. If start still fails post-deploy SHA that includes 202608030000: root-cause the **application** path (GUC order, company membership) — new guard, not re-migrate.
3. Scoreboard: move off Neon-apply HOLD language → **FAIL/UNVERIFIED until sessions>0 + browser** (Rule 23). `owner_hold` for Neon-apply = **false**.

## GUARD
Existing: `verify-bank-accounts-rls-bypass-lucia` · `verify-banking-recon-start-session-wired`. Add/keep density honesty: sessions>0 or explicit ops-empty FAIL.

## GIT-GATE COMMIT KEYS
FINDING: BANK-ECON-04
LANE: NON-FINANCIAL
DOD-D / VERIFY-6: UNVERIFIED until sessions>0 live
MODULE_PROGRESS: banking N of M
ITEMS_TOUCHED: BANK-ECON-04
MIGRATE: **APPLIED** `202608030000` — no further Neon-apply for this mig
ROOT CAUSE: sessions=0 was schema-blocked; schema now live — remaining is ops/browser (or residual app bug)
FIX: exercise recon start/complete on prod; chase app bugs with evidence if still 404
GUARD: existing recon wiring + RLS bypass guards
LIVE PROOF: UNVERIFIED: reconciliation_sessions=0 lucia 2026-07-25 (ops)
REMAINING: browser recon + density > 0
