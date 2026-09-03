# BANKING MATCH FLOW AUDIT — CC-2, 2026-09-03

Block 02 (`CC-2/02-MATCH-FLOW-AUDIT.txt`). Read-only. No schema change, no writes to `banking.*`,
no new components built. Live evidence run against USMCA (`5c854333-6ea5-4faa-af31-67cb272fef80`)
on prod, `bypass_rls`, every count run twice.

## 0. Status carried in from Block 01

`banking.bank_transactions` USMCA: total 400 · voided 57 (9 pre-existing + 48 duplicate-Plaid-
connection rows purged this session, PR #20142, `695416e`) · active 343. Confirmed live via the
UI this pass: the "For review" tab pill reads **343**, matching the DB exactly. The header banner
still reads **"For-review backlog: 352 transaction(s)"** — that mismatch is the pre-existing,
still-open `BANK-F9995` (filed earlier today), not something this pass touched or re-files.

## 1. MatchDrawer.tsx — full trace

| Hop | File:line | What it does |
|---|---|---|
| Opens from | `apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx` (row action → `MatchDrawer` open state); live-confirmed via the "Open match drawer" control on the inline row panel at `/banking/transactions` | Row action, not a separate page |
| Fetches candidates | `MatchDrawer.tsx:83-91` → `getMatchCandidates()` (`apps/frontend/src/api/banking.ts:481-498`) → `GET /api/v1/banking/transactions/:id/match-candidates` | Read-only |
| Backend handler | `apps/backend/src/banking/p7-wave2.routes.ts:175-214` | `financeUser` auth + `assertCompanyMembership(user.uuid, operatingCompanyId)`, then calls `findCandidates()` |
| Candidate query | `apps/backend/src/accounting/bank-recon/match.service.ts:842-932` (`findCandidates`) → `fetchLedgerCandidates()` at `:337-541` | Unions 6 sources: `accounting.payments` (money-in only), `accounting.bill_payments`, `accounting.bills` (open-balance only), `accounting.expenses`, `banking.transfers` (direction-scoped), `accounting.journal_entries` (both directions) |
| Confirm POST | `MatchDrawer.tsx:104-122` → `acceptBankReconMatch()` (`api/banking.ts:1406-1422`) → `POST /api/v1/bank-recon/accept-match` → `apps/backend/src/accounting/bank-recon/recon-worklist.routes.ts:70-106` → `acceptReconMatch()` (`recon-worklist.service.ts:180-205`) → `acceptMatchWithResolveDifference()` (`match.service.ts:934-1041+`) | UI only enables Confirm when `amount_gap_cents === 0` and kind ≠ `bill` (`MatchDrawer.tsx:234-236`) |
| Columns written on `banking.bank_transactions` | `review_state='matched'`, `reviewed_at=now()`, and exactly one of `matched_load_id` / `matched_bill_id` / `matched_settlement_id` / `matched_expense_id` / `matched_transfer_id` / `matched_journal_entry_id` per `MATCHED_COLUMN_BY_KIND` (`match.service.ts:1012-1030`) | Plus a row in `banking.reconciliation_matches` via `storeMatch()` (`:597-639`) |
| Embedded "Or categorize instead" | `MatchDrawer.tsx:339-390` → `categorizeBankTransaction()` (`api/banking.ts:568+`) → `POST /api/v1/banking/transactions/:id/categorize` (`categorization.routes.ts:324`) | This is the **live** categorize path — see §2 |

## 2. CategorizeDrawer.tsx — dead code, not the live path

`apps/frontend/src/pages/banking/components/CategorizeDrawer.tsx:1` is headed
`// @archived — Workflow-B: superseded by MatchDrawer inside BankingTransactionsDesignView.
Enforced by verify-banking-workflow-b-archived.mjs.` It calls a different function
(`categorizeTransaction`, not `categorizeBankTransaction`) and exposes 8 action types
(create_expense / apply_bill / bill_payment / transfer / driver_settlement / split_transaction /
factoring_advance / manual_je) that are **not reachable from the live UI today**. The real,
live Categorize affordance is the small embedded panel inside `MatchDrawer.tsx` (§1 last row):
vendor (optional) + Chart-of-Accounts category (required) only, and it posts through the same
`/categorize` route already traced in this session's Block 01/02086 findings —
`maybePostBankCategorizationToGl` → `postSourceTransaction` → a real balanced JE, gated by
`BANK_FEED_GL_POSTING_ENABLED` (confirmed live-ON for USMCA again this pass via the account's own
`/api/feature-flags/check` network call, live network log, `/banking/transactions`).

## 3. The six questions, with file:line evidence

**Q1 — Does the candidate query filter `operating_company_id`? Cross-entity leak?**
NO leak. Every one of the six unioned sources in `fetchLedgerCandidates` filters
`operating_company_id = $1::uuid` where `$1` is the route's validated + membership-guarded
`operatingCompanyId`: `match.service.ts:360` (payments), `:385` (bill_payments), `:417` (bills),
`:454` (expenses), `:489` (transfers), `:518` (journal_entries). `loadTransaction` (`:289-311`,
called by both `findCandidates` and `acceptMatchWithResolveDifference`) also scopes on
`bt.operating_company_id = $2::uuid`. **Verdict: OK.**

**Q2 — Excludes `voided_at IS NOT NULL` on BOTH sides?**
Candidate side: yes for 5 of 6 — `payments.voided_at IS NULL` (`:362`),
`bill_payments.revoked_at IS NULL` (`:387`), `bills.revoked_at IS NULL` (`:419`),
`expenses.voided_at IS NULL` (`:457`), `transfers.revoked_at IS NULL` (`:491`). The
`journal_entries` candidate query (`:509-525`) has **no** void/reversed filter at all.
Bank-transaction side: **`loadTransaction` (`match.service.ts:280-312`) never checks
`bt.voided_at`.** Directly relevant to this session's own Block 01 purge — one of the 48 rows just
voided as a duplicate can still be opened in MatchDrawer, still returns live candidates, and (per
Q4/Q5 below) nothing in `acceptMatchWithResolveDifference` stops it from being matched or posting
a JE. **Verdict: BLOCKER** on the bank side (a voided/duplicate row is fully matchable/postable
today), **GAP** on the JE-candidate side.

**Q3 — On confirm, service, raw-INSERT, or nothing?**
`accounting/bank-recon/match.service.ts` is one of the Money Contract's 13 grandfathered
raw-INSERT files — its `INSERT INTO accounting.journal_entries` (`postDifferenceJournalEntry`,
`match.service.ts:731` / `:761`) is contract-compliant, not a violation. But it only fires for a
**non-zero variance**: `if (input.variance_cents === 0) return null;` (`:684`). Every Confirm the
live UI actually allows today has `amount_gap_cents === 0` (the only case `canConfirm` is true,
`MatchDrawer.tsx:236`), so **live, every Confirm click posts nothing** — pure link + clear via
`storeMatch` + the `matched_<kind>_id` stamp, exactly matching the UI's own copy ("no journal
entry is posted"). The variance-posting branch is real code, contract-compliant, and currently
UI-unreachable (see Q6). **Verdict: OK** — accurate self-description, not a defect.

**Q4 — Can one bank txn match two documents, or one document match two bank txns?**
`banking.reconciliation_matches` has exactly one unique constraint:
`UNIQUE (bank_transaction_id, ledger_entry_kind, ledger_entry_id)` (live schema, `pg_constraint`
`reconciliation_matches_bank_transaction_id_ledger_entry_kin_key`). Bank side is protected by an
app-level check, not the constraint: `acceptMatchWithResolveDifference` throws
`bank_transaction_already_matched` when `txn.review_state === 'matched'`
(`match.service.ts:956-958`), so one bank row can only ever be confirmed once. **The document side
has no protection for 4 of 6 kinds.** `fetchLedgerCandidates` excludes an already-matched document
from being *offered again* only for `bill` (`:423-428`) and `expense` (`:459-464`) via a
`NOT EXISTS` filter — `payment`, `bill_payment`, `transfer`, and `je` candidates carry no such
filter, and no DB constraint stops a second bank transaction from being matched to the same
`ledger_entry_id`. **This is currently dormant** — USMCA has 0 rows in all six source tables
(confirmed live: `accounting.payments`/`bill_payments`/`bills`/`expenses`/`journal_entries` and
`banking.transfers` all `0`, run twice) — **but it will be live risk the moment the owner starts
creating expenses and bills**, which is exactly the workflow this audit is for. **Verdict:
DEFECT.**

**Q5 — Is the match reversible? Unmatch path — void or delete?**
An unmatch endpoint exists — `POST /api/v1/banking/reconciliation/:sessionId/unmatch`
(`apps/backend/src/banking/reconciliation.routes.ts:1116-1230`) — but it is scoped to a *formal
reconciliation session* (`sessionId`, and the bank transaction's date must fall inside
`session.period_start`/`period_end`, `:1157-1160`). It correctly clears all 6 `matched_*_id`
columns (a 2026-08 fix widened it from 3 to 6, per its own comment) and writes a `'rejected'` row
into `reconciliation_matches` — never deletes the underlying document, never deletes the match
history. **But it never reverses/voids a JE that a variance match posted** — it only nulls
`matched_journal_entry_id` on the bank row (`:1162-1170`); the JE itself stays posted, permanently,
now orphaned from any bank transaction. There is no reversal call to
`journal-entries.service.ts`'s `reverseJournalEntryNoFlip` anywhere in this unmatch path. A session
can be opened ad hoc via `POST /api/v1/banking/reconciliation/start` (`:284`), so this is a
workflow gap, not a hard block — but the MatchDrawer confirm flow itself needs no session, so a
plain accept-match today has no *direct* undo without first standing up a session for that period.
**Verdict: GAP** (link is reversible with an extra step; a posted variance JE is not reversible at
all through this path).

**Q6 — Partial payment / variance tolerance — real concept, or silent accept?**
Real concept, not silent. `toleranceForAmount(txn.amount_cents)` sizes an auto-match tolerance band;
`acceptReconMatch` (`recon-worklist.service.ts:180-205`) requires a `variance_account_id` whenever
`preview.variance_cents !== 0`, throwing `variance_account_id_required` otherwise; and
`postDifferenceJournalEntry` posts a real balanced two-leg JE (cash leg vs. the chosen difference
account) for the variance. **None of this is reachable from the live UI today** — `MatchDrawer.tsx`
disables the Confirm button outright for any `amount_gap_cents !== 0` (`:236`, `:308-327`), labeled
`"Variance posting pending balanced-JE proof (Tier-1)"`. So today: a partial/variance match cannot
be completed by any user through this drawer at all. **Verdict: GAP**, intentionally fail-closed —
correct to leave held, but worth tracking so the wiring isn't lost when Tier-1 proof lands.

## 4. Live check against the real 343-row USMCA queue

DB proof (bypass_rls, run twice, both times identical): `accounting.payments` = 0,
`accounting.bill_payments` = 0, `accounting.bills` = 0, `accounting.expenses` = 0,
`accounting.journal_entries` = 0, `banking.transfers` = 0, for USMCA. Every one of
`fetchLedgerCandidates`' six sources is empty — the correct answer for **every** row is
**0 candidates**.

Live-confirmed in Chrome on `/banking/transactions` (production, USMCA Freight Solutions Inc,
authenticated session), one representative row:
`bank_transaction_id = 0c631fb7-a8b1-4fac-afda-366efa326206`, "BANK OF AMERICA ATM 09/03
#XXXXX0004514 WITHDRWL LAREDO", $300.00, 09/03/2026. Inline row panel: **"No match candidates
found for this transaction."** Opened the full MatchDrawer: **"No matchable records found in the
±7-day window for this transaction."** No defect — matches the DB exactly.

One real defect found in this same check: toggling **Search all** visibly changed state (button
went active/dark, "Reset to recommended" appeared) but the empty-state copy still read **"±7-day
window"** — it should reflect the widened window (up to 365d) once Search all is active. Filed as
F11 below; did not chase the root cause further (network capture was inconclusive on whether a
second request even fired) since this is a read-only audit, not a fix pass.

No writes were made: closed the drawer without touching Categorize, Confirm, Payee, or Category.

## 5. Findings — most-severe first

| # | file:line | What it does | What it should do | Severity | Proposed fix |
|---|---|---|---|---|---|
| F2 | `match.service.ts:280-312` (`loadTransaction`) | Loads any `banking.bank_transactions` row by id+company regardless of `voided_at` — used by both `findCandidates` and `acceptMatchWithResolveDifference` | Exclude voided rows from both the candidate-fetch and the accept-match path | **BLOCKER** | Add `AND bt.voided_at IS NULL` to `loadTransaction`'s `WHERE`; return a clear `bank_transaction_voided` error from `acceptMatchWithResolveDifference` if it slips through anyway |
| F4 | `match.service.ts:356-534` (`fetchLedgerCandidates`) | `NOT EXISTS (...reconciliation_matches...)` guard only present for `bill` (`:423-428`) and `expense` (`:459-464`); `payment`/`bill_payment`/`transfer`/`je` have no such filter, and no DB constraint stops the same document being matched to 2+ bank rows | Extend the `NOT EXISTS` filter to all 6 kinds, or add a partial unique index on `(operating_company_id, ledger_entry_kind, ledger_entry_id) WHERE match_state IN ('auto_matched','user_matched')` | **DEFECT** (dormant — 0 documents exist for USMCA today; live risk the moment the owner creates the first expense/bill) | Extend the filter before real documents land |
| F3 | `match.service.ts:509-525` | Journal-entry candidates carry no reversed/voided filter | Exclude a JE with `reversed_by_je_id IS NOT NULL` (or the equivalent void marker) from candidates | **GAP** | Add the filter alongside the other 5 sources |
| F5 | `reconciliation.routes.ts:1116-1189` vs. `recon-worklist.routes.ts:70` | Unmatch requires an active reconciliation session scoped to the txn's date; a bare MatchDrawer accept-match needs no session | A MatchDrawer confirm should be reversible without first standing up a formal session | **GAP** | Either build a session-independent unmatch endpoint, or auto-open/reuse a session transparently when MatchDrawer needs to undo |
| F6 | `reconciliation.routes.ts:1162-1170` | Unmatch nulls `matched_journal_entry_id` but never reverses the JE itself — a posted variance JE stays live and orphaned forever | Call `reverseJournalEntryNoFlip` (journal-entries.service.ts) for the JE/variance case during unmatch | **GAP** | Wire the JE-kind branch of unmatch to the reversal service |
| F9 | `CategorizeDrawer.tsx:1` (archived) vs. `MatchDrawer.tsx:339-390` (live) | The rich 8-action categorize component described by convention/packet naming is dead code; the real live Categorize surface is a 2-field (vendor + GL account) panel embedded in MatchDrawer | Whoever builds the next block should build against `MatchDrawer.tsx`'s embedded panel, not `CategorizeDrawer.tsx` | **DEFECT** (documentation/expectation mismatch, not a runtime bug) | Note in the block/queue file so nobody rebuilds against dead code |
| F8 | `MatchDrawer.tsx:236,300-327` vs. `match.service.ts` variance path | Variance/partial-match posting is fully implemented at the API (contract-compliant, grandfathered raw INSERT) but the UI hard-disables Confirm for any non-exact amount | Intentional fail-closed hold ("Tier-1 balanced-JE proof") — leave as-is, but track so the UI wiring isn't dropped when the hold lifts | **GAP** | When Tier-1 proof lands: enable Confirm for `!isExactMatch`, add a `variance_account_id` picker |
| F11 | `MatchDrawer.tsx` empty-state copy | "Search all" visibly toggles active but the empty message still reads "±7-day window" | Template the empty message off the actual `window_days`/`searchAll` state | **DEFECT** | Small copy/state fix in `MatchDrawer.tsx` |
| F7 | `match.service.ts:684` | Exact-match (`variance_cents===0`) confirm posts nothing — pure link+clear | Working as designed; documents Q3 | **OK** | n/a |
| F1 | `match.service.ts:360,385,417,454,489,518` | Every candidate source filters `operating_company_id` correctly | No cross-entity leak | **OK** | n/a |
| F10 | live Chrome + DB, `bank_transaction_id 0c631fb7-a8b1-4fac-afda-366efa326206` | 0 candidates offered, matching 0 rows in every source table | Correct today | **OK** | n/a |

## 6. Fix order (do not build yet — this is the order for the next block)

1. **F2** — voided bank transactions must be unreachable by match/accept (BLOCKER, and directly
   protects this session's own Block 01 purge from being silently undone).
2. **F4** — close the document-side double-match hole before the owner creates the first real
   expense/bill (the exact workflow this audit was commissioned for).
3. **F6** — wire unmatch to actually reverse a posted variance JE, not just unlink it.
4. **F5** — make undo reachable without a formal reconciliation session for the common ad-hoc
   MatchDrawer case.
5. **F3** — exclude reversed JEs from match candidates.
6. **F11** — fix the "Search all" empty-state copy.
7. **F8** — wire variance Confirm into the UI once Tier-1 balanced-JE proof is signed off (not
   blocked on anything else in this list; sequenced last because it's owner-gated, not a defect).

Nothing above was built this pass. `docs/law/00-READ-FIRST-BUILD-ORDER.txt` (new, this session):
no seat opens Chrome to book/drive workflows going forward — this pass's one live Chrome check was
explicitly called for by `CC-2/02-MATCH-FLOW-AUDIT.txt` item 4 and is reported, not repeated.
