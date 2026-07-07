# CHAIN-05 — Live Bank-Feed Tie-Out · DESIGN DOC (Tier-1)

**Status:** `[HOLD-FOR-JORGE — TIER 1]` — design doc + read-only guard only. **No posting code, no
migration, no flag flip, no live GL write, no cron rewiring.** (§1.4 / §1.7.)
**Date:** 2026-07-06
**Relationship to prior CHAIN-05 work:** `docs/specs/qbo-parity/CHAIN-05-BANK-FEED-POSTING-DESIGN.md`
(the categorize→GL posting engine) is a **separate, already-shipped** concern — `PR #1744`
(`feat(accounting): CHAIN-05 bank-feed categorize → GL`) and `PR #1756` (CI guard wiring) merged
2026-07-01, flag `BANK_FEED_GL_POSTING_ENABLED` OFF by default, static guard
`scripts/verify-bank-feed-gl-posting.mjs` running in `ci.yml`. **This doc does not touch that
work.** It answers a different question: *does the recorded feed (`banking.bank_transactions`)
actually tie out to the bank's live balance* — the "prove the live bank feed reconciles vs
recorded txns" task (tracker `CHAIN-05-bank-feed-live-proof` / "ACCOUNTING-CHAIN / TASK 5 — Bank
feed: prove categorize → match → post chain LIVE").

> **Scope note (verified, not assumed):** every function/column named below was read out of the
> live source tree on 2026-07-06 (`apps/backend/src/integrations/plaid/plaid.service.ts`,
> `apps/backend/src/cron/plaid-daily-sync.ts`, `apps/backend/src/banking/reconciliation.routes.ts`,
> `apps/backend/src/accounting/recon/recon-engine.service.ts`, `db/migrations/0072`, `db/migrations/0075`,
> `db/migrations/0182`).

---

## 1. What already exists (reuse map)

Three reconciliation surfaces already exist and are real, working code:

1. **Plaid transaction sync** — `syncTransactions()` (`plaid.service.ts:466`), run daily at 02:00
   America/Chicago by `initializePlaidDailySyncCron` (`cron/plaid-daily-sync.ts`). It pages
   Plaid's `/transactions/sync` cursor, upserts `added`/`modified`/`removed` rows into
   `banking.bank_transactions`, and on success calls `markPlaidItemSyncSucceeded(itemId)`
   (`plaid-sync-state.ts`), which stamps `banking.bank_accounts.last_synced_at = now()` and
   `sync_status = 'active'`. **This part is live and correctly time-stamped.**
2. **Manual bank reconciliation session** — `banking.reconciliation_sessions`
   (migration `0075`: `statement_balance_cents`, `book_balance_cents`, `variance_cents`,
   `status`). A human opens a session with a statement balance they read off a paper/PDF
   statement; `computeSummaryFromTransactions()` (`reconciliation.routes.ts:116`) sums
   matched-transaction credits minus debits into `book_balance_cents`; `variance_cents =
   statement_balance_cents - book_balance_cents` (`reconciliation.routes.ts:361,634`). This is a
   real, human-driven tie-out — but it is **not live/automatic**; nothing runs it on a schedule,
   and nothing pulls the balance from Plaid to seed it.
3. **RECON-01 (TMS↔QBO engine)** — `accounting/recon/recon-engine.service.ts`. Twice-daily
   (06:00 / 19:00 CT per the locked spec), compares TMS bank-txn count/sum **against the QBO
   mirror**, not against Plaid. Different axis: this proves TMS↔QBO parity, not
   TMS↔bank-of-record parity.

## 2. The gap (verified by direct code read, not assumed)

`getAccountBalance(bankAccountId)` (`plaid.service.ts:727`) calls Plaid's
`accountsBalanceGet` and writes the live `current_balance_cents` /
`available_balance_cents` + `last_synced_at` onto `banking.bank_accounts`. **It is defined but
is never called anywhere else in the codebase** (`grep -rn "getAccountBalance(" apps/backend/src`
returns only its own definition — no cron, no route, no test invokes it).

Consequence: `banking.bank_accounts.current_balance_cents` / `available_balance_cents` are
**stale from the moment the account is linked** — they only ever change if some future code path
calls `getAccountBalance`, which today never happens. The daily sync cron refreshes
*transactions* (§1.1) but never *balance*. So there is currently **no automatic proof that the
transaction feed we recorded actually reconciles against what the bank says the account holds** —
the "live" half of "prove the live bank feed reconciles vs recorded txns" does not exist yet.

This is a live-data gap, not a math/posting bug — closing it does not touch the GL, it only
refreshes a balance field and computes a comparison. It is still flagged Tier-1 / HOLD because it
touches money-bearing data freshness on `banking.bank_accounts` and because any wiring change to
the daily Plaid cron is a live-system behavior change.

## 3. Proposed design (NOT built — Jorge's call on wiring)

**Reuse only — no new GL math, no new posting path:**

| Need | Reuse |
|---|---|
| Pull live balance | `getAccountBalance(bankAccountId)` — already exists, already writes `current_balance_cents`/`available_balance_cents`/`last_synced_at`. Just needs to be **called**. |
| Compute a book balance to compare against | Same shape as `computeSummaryFromTransactions()` (`reconciliation.routes.ts:116`) — sum `bank_transactions.amount_cents` (signed by `is_credit`) for the account, restricted to non-pending rows, from an anchor date forward. |
| Flag a divergence | `accounting.recon_runs` / `accounting.recon_exceptions` (RECON-01's existing tables, migration behind `accounting/recon/*`) — add a new `run_type` (e.g. `live_bank_balance_check`) and a new `exception_class` (e.g. `LIVE_BALANCE_MISMATCH`), reusing `insertRun`/`insertExceptions`/`logReconEvent` verbatim. **No new table.** |
| Schedule | Either append to the existing 02:00 CT `initializePlaidDailySyncCron` tick (call `getAccountBalance` for each account right after `syncTransactions`, same try/catch-per-account shape already there) or a new lightweight cron — Jorge's call (§4.2). |

**Draft comparison (illustrative, NOT executed):**
```
book_balance_cents(account, anchor_date) =
  anchor_balance_cents(account)                          -- OPEN DECISION §4.1, no source today
  + SUM(amount_cents * (is_credit ? 1 : -1))
      FROM banking.bank_transactions
      WHERE bank_account_id = account.id
        AND pending = false
        AND transaction_date >= anchor_date

variance_cents = live.current_balance_cents - book_balance_cents(account, anchor_date)

IF ABS(variance_cents) > tolerance_cents (§4.3):
  INSERT INTO accounting.recon_exceptions (..., exception_class='LIVE_BALANCE_MISMATCH', ...)
  -- read-only comparison + ONE flag-write, exactly RECON-01's existing pattern. No JE. No posting.
```

## 4. OPEN DECISIONS for Jorge (surfaced, not resolved)

1. **Anchor balance.** There is no `opening_balance_cents` / anchor column on
   `banking.bank_accounts` today (verified: `db/migrations/0072_p5_t1_1_banking_bank_accounts.sql`
   has only `current_balance_cents`/`available_balance_cents`, both mutable running fields, no
   immutable opening anchor). Per the locked opening-balance rule ("Opening balances are
   owner-entered only"), an anchor would need Jorge to enter it per account (the balance as of the
   date Plaid sync began, or as of the TMS cutover date 2025-01-01) — this is a new,
   owner-entered-only field, not something an agent can compute or guess.
2. **Wire `getAccountBalance` into the live daily cron now, or hold design-only?** Calling it adds
   one Plaid API call per active linked account per day (rate/cost-neutral at this scale) and
   starts keeping `current_balance_cents` fresh — a real, live behavior change to a money-bearing
   cron. Recommend: build behind a new OFF-by-default flag (e.g.
   `BANK_FEED_LIVE_BALANCE_CHECK_ENABLED`, same per-entity pattern as `BANK_FEED_GL_POSTING_ENABLED`)
   so it ships dark until you flip it, mirroring every other CHAIN block's rollout gate.
3. **Tolerance.** Pending transactions (`pending=true`) are excluded from the book-balance sum by
   design (Plaid pending amounts can change/vanish before posting) — that alone creates a normal,
   expected variance while transactions are pending. Needs a tolerance band or an explicit
   "pending total" surfaced alongside variance, not a false-positive alarm on every run.
4. **Where the exception surfaces in the UI.** RECON-01 exceptions already have a worklist
   (`accounting/recon/recon.routes.ts`) — confirm a `LIVE_BALANCE_MISMATCH` exception should land
   in the same worklist (recommended — one place to work exceptions) rather than a new UI surface.

## 5. What ships in THIS PR (buildable today, read-only, no Jorge wiring decision required)

Per the "design doc + read-only tie-out guard" instruction, this PR adds
`scripts/verify-bank-feed-live-tieout.mjs` — a read-only, DB-connected (CI Postgres / local dev,
never prod — §1.5) proof that the **shape** of the categorize→match→post chain is internally
consistent, i.e. the precondition for any live tie-out to mean anything:

- every `review_state='categorized'` row actually has a resolved GL account
  (`coa_account_id` or `categorization_gl_account_id`) — the "categorize" step really happened,
  not just a status label;
- every `review_state='matched'` row actually references *something*
  (`matched_invoice_id`/`matched_bill_id`/`matched_payment_id`/`matched_bill_payment_id`/
  `matched_transfer_id`/`matched_journal_entry_id`) — same reasoning for "match";
- no row is double-claimed by both a bill-side match (`matched_bill_id` /
  `matched_bill_payment_id`) **and** a bank-feed-GL post (`matched_journal_entry_id`) — the
  CHAIN-05 posting design's own dedupe contract (§10.2 of the posting design doc), verified
  against live rows, not just against the service code;
- every non-null `matched_journal_entry_id` resolves to a real, currently-posted, balanced
  `accounting.journal_entries` row — "post" produced a real, balanced entry, not an orphaned
  pointer.

These are hard-fail checks — if a bug ever lets the chain get into an inconsistent state, this
guard catches it in CI. It also prints an **informational** (non-failing) report of live-balance
freshness per active Plaid-linked account (`last_synced_at`, `current_balance_cents`, and a naive
30-day book-delta), explicitly labeled `[GAP — see design doc §2]` since we already know
`current_balance_cents` is stale by design today — this is not a bug the guard should fail on
until §4.2 is decided and built.

---

## Research (cited — same standard as the posting design)

**QuickBooks Online** reconciliation flow requires an ending statement balance to start a
reconciliation, and separately syncs a live "bank balance" indicator on the Banking screen
pulled from the institution — the two are shown side-by-side so the user can see drift before
they even open a reconciliation. **NetSuite** Bank Feeds similarly refreshes account balances on
each feed sync as a distinct step from transaction import. Both treat "is the transaction feed
current" and "does the running balance match the bank" as two different, both-required proofs —
which is exactly the split this doc identifies (transactions ARE kept current; balance is NOT).

Sources:
- [Reconcile an account in QuickBooks Online](https://quickbooks.intuit.com/learn-support/en-us/help-article/bank-reconciliation/reconcile-account-quickbooks-online/L6zsrbUJs_US_en_US)
- [NetSuite Bank Feeds (datasheet)](https://www.netsuite.com/portal/assets/public-pdf/ds-ns-bank-feeds.pdf)

---

## Guardrails (carry every session)
Reuse `getAccountBalance` + `computeSummaryFromTransactions`-style sum + RECON-01's
`recon_runs`/`recon_exceptions` tables · **no new GL math, no new posting path** · new flag OFF ·
anchor balance is owner-entered only, never agent-computed · no cron rewiring without Jorge's
explicit OK (§4.2) · `[HOLD-FOR-JORGE — TIER 1]`, never self-merged (§1.4).
