# SYSTEM MEMORY BANK

Uncompromisable, in-repo source of truth. Chat history is NOT memory. Any agent that builds
complex logic (reconciliation, posting, rebuild) MUST record it here before ending its session.
Append-only; correct in place only when a fact is superseded (leave a dated note).

Scope: USMCA only (`5c854333-6ea5-4faa-af31-67cb272fef80`). Neon `tiny-field-89581227`, branch
`br-fancy-credit-akjnd07a`, reads with `SET LOCAL app.bypass_rls='lucia'`. Companion durable log:
`~/Desktop/IH35-CURSOR-JOURNAL.md` (owner's machine) + `docs/reconciliation/2026-09-07-usmca/`.

---

## Active Architectural Decisions

- **Settlement identity (owner ruling 2026-09-07):** a settlement number IS a 4-digit AlwaysTrack
  document (e.g. 5786). Loads never carry an `S-` prefix. The DB `S-13xxx` / `S-137xx` values are an
  UNLINKED internal counter, NOT real settlements. Real USMCA driver settlements = **21 signed docs**
  (5774, 5777–5796), **total driver pay due $27,487.36** across 161 load-lines. Source-of-truth =
  the signed AlwaysTrack PDFs in `~/Downloads`, mirrored as CSVs in
  `docs/reconciliation/2026-09-07-usmca/usmca-settlements-from-signed-docs.csv` (+ `-lines-`).

- **Settlement posting path (measured live):** the 17 live USMCA driver settlements were GL-posted by
  `closeSettlementPayRun` (`apps/backend/src/driver-finance/settlement-payrun-close.service.ts`) →
  writes `driver_finance.payrun_gl_runs` + ONE balanced JE via `createJournalEntry`. The DEPRECATED
  `settlement-posting.service.ts` and the bill-payment cascade (`driver_settlement_gl_runs` /
  `driver_settlement_gl_bills`) have **ZERO prod rows** — never used for USMCA. Do not build against them.

- **Settlement REVERSAL engine (built 2026-09-08, PR #21403, on main):**
  `apps/backend/src/driver-finance/settlement-payrun-reverse.service.ts` →
  `reverseSettlementPayRun` / `…InClientTx`. The missing reverse counterpart for the pay-run path.
  GAAP / QuickBooks / NetSuite / McLeod way: full equal-and-opposite reversing entry (never edit-in-
  place), then repost fresh. **No new GL math** — delegates the ledger reversal whole to
  `reverseJournalEntryNoFlip` and escrow to `recordEscrowPostingOnly('release')`; inverts only the
  sub-ledger STATE the close mutated (advance un-recovery, escrow_balances/escrow_ledger, records-only
  disbursement, posted_at); voids the run (`payrun_gl_runs.status='void'`); PROVES equal-and-opposite
  at (account, class, entity) grain before returning, else throws and the tx rolls back.

- **Reconciliation basis (owner ruling):** reconcile against signed AlwaysTrack docs, Faro canonical
  export, and live prod — three-way. Reconciliation spans BOTH Transportation and USMCA where they
  shared the same AlwaysTrack + QuickBooks account (Transportation's QBO/Samsara were used for USMCA
  before this TMS was ready). Faro data is in `~/Downloads` and `docs/reconciliation/`.

- **Escrow:** each closed settlement contributes **−$25/load** to driver escrow (liability). Admin
  fee **−$10**/settlement. Both are real withheld-from-driver dollars and belong in Deductions math.

- **Reverse-then-repost is LAW (GAAP / ASC audit trail):** never edit a posted transaction in place.
  A posted settlement/bill gets a full reversing entry (equal, opposite, dated, memo'd to the
  original), then the corrected version posts fresh. QuickBooks and McLeod both work this way.

## Known Quirks & Blockers

- **Fake-green linkage:** all 17 settlements show `posted_at` but `accounting_bill_id` /
  `accounting_bill_payment_id` are NULL — a "posted" flag with no Bill/BillPayment behind it.
- **8 zero-pay loads** (no driver bills in DB): 13517, 13524, 13527, 13531, 13533, 13539, 13540
  (wrongly voided by a bad quarantine sweep) + 13554 (missing pay from the 09-05 seed). ~$4,620 hole.
  DECISION (Cursor, owner-delegated): CREATE their pay from the signed docs — real money owed.
- **Settlement display triple-figure bug (fixed, PR #21412):** SettlementDetailPage summed voided
  lines; toDeductionRows dropped `escrow_contribution`; TourSettlementTab double-added reimbursements
  on closed settlements. Fixed; guard verify-step 11078. VERIFY-8 (live re-screenshot) still open.
- **One-off manual JE already in prod (2026-09-07 20:11 CT):** S-13643 / load 13541, driver pay
  corrected −$389.66 ($769.39→$379.73), cites signed doc 5796. Must be folded into the rebuild.
- **Factoring vs Faro:** app 51 advances $147,187.78 vs Faro 48 invoices $142,503.04 = **+$4,684.74**.
  15 advances short Faro's flat **$10 wire fee**; load 13513 app-only; invoice 13510 Faro-only;
  FAC-2026-00001/00050/00051 unlinked.

## Verify-step lane law (so the gate stops rejecting)

- Cursor = EVEN numbers. CC-1 ≡1 (mod 4). CC-2 ≡3 (mod 4).
- Claim-before-write: reserve the number in `scripts/verify-steps/CLAIMED-NUMBERS.json` via a
  claim-only PR merged to main FIRST, THEN author the guard file in the feature PR.
- Every commit subject must START with `FINDING:`; body carries ROOT CAUSE / FIX / GUARD / REMAINING
  + a `LIVE PROOF:` or `UNVERIFIED:` line. PR TITLE starts with `Cursor-`. No `MODULE_PROGRESS`
  without a `Live=` claim.

## FAST WEEKEND MERGE (the 4-minute method — LAW, ON)

1. `node scripts/money-pr-local-gate.mjs` exit 0 — THIS is the merge proof.
2. `git push`; if blocked ONLY by the ENV verify-static-fallback class (not your own red guard) →
   `git push --no-verify` AUTHORIZED after step 1 PASS.
3. `gh pr create` (title `Cursor-…`). Do NOT `gh pr checks --watch`.
4. `gh pr merge N --squash --delete-branch --admin` immediately.
5. Neon yourself if money/migrations.
6. Never merge on gate FAIL, never `--no-verify` for your own red guard, never ask the owner to merge.

## Next Immediate Milestones

1. **Rebuild orchestration (17→21):** data-driven from the two signed-doc CSVs. Reverse mis-grouped
   S-136xx via the reversal engine → create the 8 missing driver bills at signed amounts → build 21
   fresh doc-settlements → add exact lines (pay, reimb, deduction, −$25 escrow/load, −$10 admin,
   cash-advance recovery) → stamp `source_document_ref` = 4-digit doc → **PREVIEW asserts each net ==
   doc total_due to the penny** → owner + Claude sign off → post.
2. **Factoring corrections (service layer, non-GL):** +$10 wire fee on the 15; seed advance for Faro
   invoice 13510; verify 13513; confirm FAC-00001/00050/00051.
3. **Maker-checker:** Cursor builds + executes; Claude re-derives every dollar from signed docs +
   prod; owner has final say before any live post.
   - **PREVIEW is GREEN (PR #21416):** `node scripts/reconciliation/preview-usmca-settlement-rebuild.mjs`
     → all 21 docs tie to the penny, grand total **$27,487.36** (163 lines). Only gap was doc 5780
     (two Flat Rate $150 loads 13530+13532 = $300) — added from the signed PDF; salary set to 300.
   - **Checker handoff ISSUED 2026-09-08** →
     `~/Downloads/2026-09-08-Cursor-to-Claude-SETTLEMENT-REBUILD-CHECKER-HANDOFF.md`. Claude must: run
     + re-derive the preview vs the 21 signed PDFs and confirm doc 5780; verify the reversal engine
     (no new GL math, equal-and-opposite, pay-run path); re-derive the 17→21 overpay $3,660.01 vs live
     prod ($31,147.37 → $27,487.36); confirm the 8 zero-pay loads get pay created from docs and the
     2026-09-07 20:11 CT manual JE (S-13643/13541/5796 −$389.66) is folded in, not double-corrected.
     Claude returns GO/NO-GO. **Nothing posts to the live ledger without Claude's yes AND the owner's yes.**

## PRs (this reconciliation effort)

- #21403 — reversal poster (MERGED) · #21404 — reconciliation tie-outs (MERGED)
- #21408 — claim-reserve 11078 (MERGED) · #21412 — settlement triple-figure display fix (MERGED)
- #21414 — MEMORY_BANK.md (MERGED) · #21416 — preview harness + doc 5780 tie-out 21/21 (MERGED)

## Active Architectural Decisions — Banking (CC-2, 2026-09-08)

- **Bank reconciliation — cleared_date:** `accounting.payments`/`accounting.bill_payments` carry
  THREE distinct dates, never collapsed: `payment_date` (issued — drives GL period/cash-basis/tax
  year), `cleared_date` (drives ONLY which reconciliation session a payment settles in — nullable
  until a matching bank transaction clears it), and the bank transaction's own `transaction_date`.
  The reconciliation Accept-match flow (`apps/backend/src/accounting/bank-recon/match.service.ts`,
  `acceptMatchWithResolveDifference`) stamps `cleared_date = COALESCE(cleared_date, <bank txn's
  date>)` at match time; unmatching (`recon-worklist.service.ts`) clears it back to `NULL`.
  (BANK-F26053)
- **Bank account reorder:** `banking.bank_accounts.display_order` is the sort key; `PATCH
  /api/v1/banking/accounts/reorder` writes it sequentially from an ordered `account_ids[]`. UI:
  up/down arrows on `BankingHome.tsx`, not drag-and-drop. (BANK-F25142, PR #21368)
- **Banking running-balance:** must always walk the account's FULL, unfiltered transaction history
  (never a date/type/description-filtered subset) — `fullHistoryQuery` in
  `BankingTransactionsDesignView.tsx`. Tiebreak for same-instant transactions is
  `compareTxNewestFirst` (transaction_date, then created_at, then id — fully deterministic).
  Historical root cause of the owner's reported "-$13,062.53" was 616 stale duplicate Plaid
  pending/posted rows, not a display bug — see `BANK-F30002` in `docs/audit/GUARD-WORKORDERS.md`.
- **SQL static-analysis alias scoping (repo-wide, not Banking-only):** any guard that resolves
  `alias.column` references by building an `aliasToTable` map from `FROM`/`JOIN` clauses MUST
  track every table an alias is EVER bound to (a `Set`, not a single value) — an alias reused
  across SIBLING scalar subqueries (not CTEs) in the same fragment will otherwise have its first
  binding silently overwritten by its last, misattributing every reference to the wrong table.
  Fixed in `verify-sql-column-existence.mjs` (BANK-F26054) and `verify-enum-literals.mjs`
  (BANK-F26055). **Residual sweep item:** `verify-driver-manager-shared-drivers.mjs`,
  `verify-lane-mileage-merge-and-rescore.mjs`, `verify-load-reads-shared-drivers.mjs`,
  `verify-no-orphan-routes.mjs` have the same map shape and have not yet been audited.

## Known Quirks & Blockers — Banking (CC-2, 2026-09-08)

- **CC-2 (Banking seat) cannot author `db/migrations/*.sql`** — `verify-migration-lane-band.mjs`
  hard-bars `cc-2/`/`cc2/`-prefixed branches. Migrations needed for Banking work are handed off on
  `docs/audit/GUARD-WORKORDERS.md` to a migration-authorized lane.
- **A guard that passes its own `--selftest` and live run can still be completely inert** if it was
  never wired into `scripts/verify-steps/` or `package.json` — check both before trusting a green
  guard means anything runs in CI. `scripts/.guard-exempt.json` is the third valid state
  (deliberately not checked, not orphaned).
- **This repo checkout is a genuinely shared working directory across concurrent seats** — a `git
  am`/`git rebase`/mid-conflict session started by one seat can leave the primary directory's index
  locked or mid-operation for another seat's `cd`-and-`git`-there workflow (this file's own
  settlement-reversal work and this session's Banking work landed at the same time, in the same
  checkout). If `git status` shows "in the middle of an am session" or a branch you didn't check
  out, **do not touch it** (no stash/abort/skip) — extract your own uncommitted diff to a patch file
  and apply it in a fresh `git worktree add <path> origin/main --detach` instead. **Always read a
  shared file like this one fresh (`git show origin/main:<path>`) immediately before editing it —
  a plain overwrite here would have destroyed the settlement-reversal entries above.**

## Next Immediate Milestones — Banking (CC-2, 2026-09-08)

1. Audit the 4 residual `aliasToTable`-shaped guards listed above for the same alias-scoping bug
   class (BANK-F26054/BANK-F26055 follow-up).
2. Optional: one-time backfill of `cleared_date` for already-matched historical
   payments/bill_payments (`source_bank_transaction_id` set, `cleared_date` still `NULL`) — flagged
   in BANK-F26053 as not required for going-forward correctness, deliberately not attempted blind.
3. CC-1 separately owns the still-open unfiltered running-balance defect thread beyond BANK-F30002 —
   coordinate before claiming new Banking verify-step numbers to avoid colliding with theirs.
