# ACCT-R-01 — driver escrow balance sync fix (2026-07-25)

**Block:** `0007-pattern-5-split-brain-engines` (financial pile, NEEDS-PROD → GAP-CONFIRMED per
`docs/trackers/NEEDS-PROD-NEON-VERDICTS-2026-07-21.md` §8).
**Design HOLD this resolves:** `docs/specs/DESIGN-HOLD-0007-ESCROW-SPLIT-BRAIN-2026-07-21.md` (see its
"ACCT-R-01 update (2026-07-25)" section for full detail — this file is the short-form pointer).
**PR:** `fix/acct-r01-escrow-canonical-sync`.
**LANE:** FINANCIAL (money-posting logic change to `accounting.*` write path — Claude/Jorge review before merge).

## FINDING

The 2026-07-21 HOLD framed this as "pick a canonical schema between `accounting.escrow_*` and
`driver_finance.escrow_*`." Live code archaeology (reading every write path, not re-guessing from the
schema list) found this framing was incomplete: the two schemas are **not duplicates** — they serve
distinct, both-legitimate purposes (operational running balance vs. GL-linked liability balance) — but
they were **silently out of sync**, which is the real, more dangerous defect.

## ROOT CAUSE

- `driver_finance.escrow_balances` / `escrow_ledger` = the operational per-driver running-balance store.
  Written by `driver-finance/settlement-payrun-close.service.ts`'s `recordEscrowContribution()` (the
  live $2,000-cap pay-run contribution) and `settlements/approval.service.ts`'s `updateEscrowBalance()`
  (D1 per-line approval hold). Read by the banking escrow visualizer, the driver escrow history tab, and
  the settlement-cap check (`readDriverEscrowBalanceCents()`).
- `accounting.escrow_accounts.balance_cents` = the GL-linked liability balance.
  `driver-finance/escrow-separation.service.ts`'s `releaseDriverEscrowSeparation()` reads THIS as the
  authoritative current balance before calling the existing `releaseEscrow()` (Block-23), which itself
  throws `escrow_release_exceeds_balance` if the requested release exceeds it.
- Neither of the two writers above ever updated `accounting.escrow_accounts.balance_cents`. It only moves
  via `depositEscrow()`/`postEscrowTransaction()`, which nothing on the contribution path called.
  **Effect:** a driver who genuinely accumulates escrow via real settlement pay-runs would have the JE
  correctly credit their liability sub-account, but `accounting.escrow_accounts.balance_cents` would stay
  at 0 forever — so on separation the release computation would return **$0** (or throw
  `escrow_release_exceeds_balance` for any nonzero attempt), even though the company owes them real money.
  This was live and dormant (both engines are 0 rows on prod today per the Neon verdict) but would have
  fired on the FIRST real driver separation+release.

## FIX

- `accounting/escrow/service.ts`: new `recordEscrowPostingOnly()` — inserts ONE
  `accounting.escrow_postings` row (no second JE) so the EXISTING `accounting.apply_escrow_posting_delta()`
  AFTER-INSERT trigger (migration `0234_block_23_escrow_posting_flow.sql`) atomically applies the balance
  delta to `accounting.escrow_accounts.balance_cents`. Fails loud unless `failSoft: true`.
- `driver-finance/settlement-payrun-close.service.ts`: calls it right after the settlement's own JE posts
  (linking `linked_journal_entry_id` to that JE — same economic event, no double-posting).
- `settlements/approval.service.ts`: calls it (fail-soft — legacy D1 flow may run before a driver's
  `accounting.escrow_accounts` bridge is provisioned) with `linked_journal_entry_id: null` (this path
  posts no JE of its own, per its existing file-header doc comment).
- **No table redirected, no writer removed** — Rule 07. Both schemas remain exactly as-is; only the sync
  gap between them closes.
- **No migration** — both tables and the trigger already exist on prod (verified `to_regclass` in the
  2026-07-21 Neon verdict). This is an app-code fix only.

## GUARD

`scripts/verify-acct-r01-escrow-canonical-write-path.mjs` (verify-step **1489**): fails CI if any backend
file writes `driver_finance.escrow_balances`/`escrow_ledger` (a contribution/hold) without also
referencing `accounting.escrow_accounts` / `accounting.escrow_postings` / `recordEscrowPostingOnly` in the
same file (or an explicit `ESCROW-SYNC-EXEMPT:` comment). Selftest 5/5 PASS. Verified to FAIL against the
pre-fix code (both writers flagged) and PASS against the fixed code.

## LIVE PROOF

- Guard run against the fixed tree: `OK — 2317 backend files scanned, 2 driver_finance escrow-balance
  writer(s) found, all synced to accounting.escrow_accounts (ACCT-R-01).`
- Guard run against the pre-fix tree (via `git stash` of the 3 fix files): FAILS on exactly the 2 files
  identified above — confirms the guard catches the real defect, not a cosmetic pattern.
- No Neon read needed for this PR: both `accounting.escrow_accounts`/`escrow_postings` and
  `driver_finance.escrow_balances`/`escrow_ledger` are 0-row on prod today (§8 of the 2026-07-21 verdict)
  — this fix lands BEFORE either engine takes live money, which is exactly the risk window that verdict
  flagged.

## REMAINING

None for this finding. The `driver_finance.driver_escrow_separations` / release side was already correctly
wired to the canonical GL engine (`releaseEscrow()`) before this PR — only the deposit/contribution side
had the gap.
