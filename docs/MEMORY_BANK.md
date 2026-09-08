# SYSTEM MEMORY BANK

Uncompromisable, in-repo source of truth. Chat history is NOT memory. Any agent that builds
complex logic (reconciliation, posting, rebuild) MUST record it here before ending its session.
Append-only; correct in place only when a fact is superseded (leave a dated note).

Scope: USMCA only (`5c854333-6ea5-4faa-af31-67cb272fef80`). Neon `tiny-field-89581227`, branch
`br-fancy-credit-akjnd07a`, reads with `SET LOCAL app.bypass_rls='lucia'`. Companion durable log:
`~/Desktop/IH35-CURSOR-JOURNAL.md` (owner's machine) + `docs/reconciliation/2026-09-07-usmca/`.

---

## SCOPE — SETTLED, DO NOT RE-RECONCILE (owner 2026-09-08: "you are doing the same work for the 4th time")

The factoring reconciliation is ALREADY DONE and committed — `usmca-factoring-reconciliation.csv` +
`FINDINGS.md` §"Factoring tie-out vs Faro". Do not re-parse Faro or re-derive this. Settled facts:
- **Faro purchased ~47 of ~50 USMCA loads** (MATCH or the flat +$10 wire-fee AMOUNT_DIFF). The **3–4
  Faro did NOT purchase**: load **13513** (APP_ONLY, not in Faro) + unlinked advances **FAC-2026-00001 /
  00050 / 00051**.
- **USMCA rebuild scope = tours 5769–5796** (every tour with a Faro-purchased or direct-pay USMCA load =
  what's already in the app + the factoring CSV). **Pre-Faro tours 5753, 5760–5768 are TRANSPORTATION,
  already QuickBooks-reconciled — NOT in the USMCA rebuild.** Owner anchor: first USMCA Faro purchase
  ≈ Aug 7; the factoring CSV is the authoritative scope, not a hand-guessed date.
- Next action is the REBUILD ORCHESTRATION, not more reconciliation.

## SCOPE CORRECTION — the real tour universe is 38 docs, not 21 (measured 2026-09-08)

The earlier "21 signed docs / $27,487.36" window was a SUBSET (docs 5774,5777–5796) that tied to itself
but is NOT the real universe. Parsing EVERY signed `Driver_Settlement_*.pdf` in `~/Downloads` gives
**38 unique tours (5753, 5760–5796), grand due $51,774.19, 82 distinct loads** — see
`docs/reconciliation/2026-09-07-usmca/all-signed-driver-settlements.csv` + `ALL-TOURS-VS-APP.md`.
- The 17 live app settlements are per-DRIVER aggregates; **9 of them mix loads from 2–4 different tours**
  (misgrouped). Coverage: 13 FULL, 14 PARTIAL, 11 NONE. **36 loads have signed pay but are missing from
  the app.**
- **Faro three-way**: 48 invoices, $142,503.04 advance. **Faro factoring starts at load 13508 / tour
  5769**; tours **5753, 5760–5768 are pre-Faro / not factored** → the owner's "reconcile via QuickBooks"
  set. 4 factored loads (13564,13569,13571,13573) aren't in the app yet (active/Sept). 13541 = direct-pay
  (owner ruling), correctly not in Faro.
- **RESOLVED owner ruling 2026-09-08 ("WE HAVEN'T CHANGED THE NAME IN ALWAYS"):** the doc-header
  company name is NOT an entity discriminator. EVERY in-scope signed doc 5769–5796 is headed **"IH35
  Transportation, LLC"** — because the company name was never changed in AlwaysTrack, NOT because the
  tour is a Transportation entity. **All 28 Faro-era tours 5769–5796 are USMCA.** The entity boundary is
  the **Faro purchase line** (first purchase = load 13508 / tour 5769), NOT the header. Pre-Faro 5753 +
  5760–5768 stay Transportation/QBO **only because Faro didn't buy them**, not because of any name.
  → **CC-1's reclassification of Pedro / tour 5772 (and loads 13502, 13507) as "Transportation-entity"
  is SUPERSEDED** — it keyed off the stale header. Pedro/5772 is a REAL USMCA underpayment; the rebuild
  posts his full $997.08 (all 4 loads). USMCA rebuild scope = **28 tours 5769–5796, $37,830.87**.

## NAMING LAW — NEVER SAY "S-13xxx" (owner corrected Cursor AGAIN 2026-09-08)

- **A load = 5 digits** (13502, 13541). **A settlement/tour = the 4-digit AlwaysTrack doc** (5772, 5774).
- The DB `display_id` values like `S-13654` are the MISLABELED internal counter (load# with an `S-`
  prefix). They are NOT settlement numbers. **Never refer to a settlement as `S-13xxx` in any message,
  doc, or commit.** Always translate to the 4-digit tour doc (e.g. the row the DB calls `S-13654` IS
  **tour 5772**, Pedro Abraham Lopez Collado). The rebuild stamps `source_document_ref` = the 4-digit doc
  and that becomes the identity.

## DOMAIN MODEL — WHAT A SETTLEMENT IS (READ THIS FIRST — owner corrected Cursor 3× on 2026-09-08)

Source: `docs/specs/ARCHITECTURE-BLUEPRINT-2026-07-05.md` §2–§3 (LOCKED). If you find yourself reasoning
about settlements in "weeks" or calendar date-windows, STOP — you are wrong. Read this.

- **A settlement is a SET OF TRIPS — a TOUR.** A tour = a NORTHBOUND trip (loaded, into the US) +
  sometimes TRIANGULATION trip(s) (US-to-US legs) + a SOUTHBOUND trip (back to Laredo/Mexico). That is
  why each signed AlwaysTrack doc lists 2–3 loads: those are the LEGS of one tour.
- **HOS makes a weekly settlement IMPOSSIBLE.** A driver has 70 hours / 8 days and must take a 34-hour
  reset. A tour runs as long as the round trip takes around that reset — it never lines up with a
  calendar week. NEVER group or compare settlements by week/date-window.
- **Bill per LOAD** (`driver_finance.driver_bills`, one bill per load, numbered by load #, gross =
  the load's fixed fee from `accounting.bills.amount_cents`). **Multiple per-load bills aggregate into
  ONE settlement (the trip/tour).** Worked example in blueprint §3: Mecor, 3 loads → 1 settlement.
- **Settlements post as Bill + BillPayment — NOT a single JE (LOCKED, blueprint §3).** Driver = a
  VENDOR (A/P aging, W-8BEN on file). Canonical engine = `driver_finance.driver_settlements` +
  `driver_finance.driver_settlement_deductions`. Deductions apply **pay-first, then escrow**, and
  credit **that driver's OWN** sub-accounts (Cash-Advance ASSET sub, Driver Escrow LIABILITY sub).
  Net-pay floor = 5% editable per settlement.
- **⚠️ The 17 live USMCA settlements were posted the WRONG way** — via `closeSettlementPayRun` as a
  SINGLE JE through `payrun_gl_runs`, which contradicts the locked Bill+BillPayment architecture. The
  Bill+BillPayment cascade (`driver_settlement_gl_runs`/`driver_settlement_gl_bills`) has zero rows
  because the CANONICAL path was never used yet — not because it's dead. The rebuild must repost via
  the canonical Bill+BillPayment engine, not re-run the single-JE path.
- **Driver identity:** hired Mexican-B1 external contractors (W-8BEN), NOT owner-operators. Pay =
  per-load fixed fee, booked "Cost of Labor–Mexico Drivers" as Contract Labor (never Purchased
  Transportation, never payroll-with-withholding).
- **The "$3,660 over/under" week/aggregate delta is a mis-scoped comparison — but "NO driver is owed"
  is FALSIFIED (Claude, line-level, 2026-09-08).** At least Pedro Abraham Lopez Collado is genuinely
  UNDERPAID: his live settlement (DB `S-13654`) is a PARTIAL rebuild of **tour 5772** covering only 2 of
  4 loads; the other 2 (13502, 13507) — real signed pay — exist NOWHERE in `driver_bills`/`settlement_lines`.
  Reverse it without posting the full $997.08 of tour 5772 and he goes from wrongly-paid $756 to paid
  nothing. **Do NOT assume "everyone was paid correctly."**
  **BOTH audit gates now returned (2026-09-08):** CC-1 — no OTHER of the 17 shares Pedro's
  partial-rebuild shape (only 5772). CC-2 — exactly ONE standalone manual JE to fold (`15e0887f`),
  line-level confirmed by 4 independent searches, no second hidden one. Scope is now RESOLVED (not a
  growing parameter): **28 Faro-era tours 5769–5796, $37,830.87**, per the "WE HAVEN'T CHANGED THE NAME
  IN ALWAYS" ruling (doc header ≠ entity). Pedro/5772 rebuilds in full ($997.08, all 4 loads incl.
  13502/13507). Checker verdict = CONDITIONAL GO, condition (owner scope decision) now met. Still: no
  prod post without Claude's GO + owner's explicit yes.

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

## Rehearsal + remaining gates (2026-09-08)

- **Reversal engine REHEARSED on an isolated Neon branch (PR #21431).** Harness:
  `apps/backend/scripts/rehearse-settlement-payrun-reversal.mts` (runs the REAL engine on a fork,
  refuses non-Neon URLs, prints before/after + independent equal-and-opposite proof). Rehearsal on
  branch `br-small-lake-ak5keqpa`, S-13644: reversed, reversal JE 81ef03ff, advances_restored 2,
  escrow 2500¢, proof {nonzero 0, residual 0}, run posted→void, posted_at cleared. It caught + fixed a
  real `uuid=text` bug on `escrow_postings.source_id` that would have thrown on prod settlement #1.
  **Re-run this harness on a fresh branch before any prod post.**
- **PHASE 1 (REVERSAL) ORCHESTRATION BUILT + REHEARSED on an isolated Neon branch
  (`br-royal-grass-ak4y2evz`, 2026-09-08).** Harness:
  `apps/backend/scripts/rebuild-usmca-settlements-orchestration.mts` — scope is a PASSED-IN parameter
  (`--settlements=…`, default = every posted `payrun_gl_runs` for USMCA = the 17); PREVIEW by default
  (one txn, ROLLBACK), `--commit` gated behind `REBUILD_I_UNDERSTAND=yes`. It (A) reverses each
  in-scope settlement via `reverseSettlementPayRunInClientTx` then voids its `settlement_lines`
  (`is_active=false` + void register) + flips the header to `cancelled` with `reversed_at/by/reason` +
  unmatches any bank txn — MIRRORING the live `/settlements/:id/reverse` route exactly (no invented
  lifecycle); (B) explicitly folds the standalone manual correction JE `15e0887f` via
  `reverseJournalEntryNoFlip`; (C) proves the WHOLE reversed set (all originals + all reversals + the
  manual JE + its reversal) nets to ZERO at the (account, class, entity) grain with a hard throw.
  **Rehearsal proof:** PREVIEW + COMMIT both green — 17 settlements reversed, escrow 2500¢ each unwound,
  advances restored, lines voided; JE `15e0887f` folded; GLOBAL proof journals=36, nonzero_dims=0,
  residual_cents=0. Post-commit branch state: 17 runs `void`, 0 posted, reversed settlements
  `cancelled`, 0 active lines on them. **Idempotent:** a second pass found 0 posted runs and
  `reverseJournalEntryNoFlip` returned the EXISTING reversal (no double-reverse). Prod UNTOUCHED.
  **CLEARS the old "manual JE `15e0887f`" gate** — the fold is built + proven, not just planned.
- **Rebuild bills: un-void 7, create 1.** 7 of the 8 "zero-pay" loads already have VOIDED
  `driver_finance.driver_bills` rows matching the signed docs (13540 is 1¢ off — trace, don't shrug);
  only 13554 has no bill row. The rebuild un-voids the 7, creates 13554 — it must NOT blindly create 8.

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
   - **Independent verify of the manual-JE point, DONE 2026-09-08 (CC-2, line-level, not date-range)**
     → full verdict in `docs/bus/OUTBOX-CC-2.md`. Confirmed on Neon: JE `15e0887f-d94e-42a2-a248-
     1a14f951cde3` is standalone (not in `payrun_gl_runs`, `payrun_gl_runs.journal_entry_id` still
     points at the original `13ffbcff-...`); the −$389.66 IS folded in at the `settlement_lines`
     level (original $769.39 line voided, replacement $379.73 line created same instant, S-13643's
     stored `net_pay=$4,310.22` is internally consistent with the corrected figures); and **it is
     the ONLY standalone settlement-correction JE across the full 2026-07-03→09-07 window** — 4
     independent searches (by "Settlement S-" mention, by `source='manual'`, by
     `memo ILIKE '%correction%'`, and a broad "driver"-mentioning sweep) found nothing else besides
     6 unrelated, legitimate "Driver advance CA-2026-000N posting" JEs and 2 already-closed,
     properly-linked reversal JEs for load 13541's separate invoice-side re-rate (ACCT-F26031).
     Note: `15e0887f`'s own `source` column is `'auto'`, not `'manual'` — every USMCA JE ever posted
     uses `source='auto'`, `'manual'` is unused system-wide; a naming quirk, not a defect.

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
  (BANK-F26055). **Residual sweep CLOSED (2026-09-08):** the 4 flagged files
  (`verify-driver-manager-shared-drivers.mjs`, `verify-lane-mileage-merge-and-rescore.mjs`,
  `verify-load-reads-shared-drivers.mjs`, `verify-no-orphan-routes.mjs`) were audited and do NOT
  have this bug — each `alias` there is a fixed literal-string list checked with hardcoded needles
  (first two), an unrelated JS variable name (`aliasMap` in the third — application-code merge
  logic, not a SQL table-alias map), or import-alias resolution for JS `import { foo as bar }`
  (the fourth) — none dynamically parse `FROM`/`JOIN` into a table-lookup map the way
  `verify-sql-column-existence.mjs`/`verify-enum-literals.mjs` did. No further guard fix needed.

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

1. ~~Audit the 4 residual `aliasToTable`-shaped guards for the same alias-scoping bug class~~ —
   DONE 2026-09-08, closed clean (see Known Quirks entry above), no further action.
2. Optional: one-time backfill of `cleared_date` for already-matched historical
   payments/bill_payments (`source_bank_transaction_id` set, `cleared_date` still `NULL`) — flagged
   in BANK-F26053 as not required for going-forward correctness, deliberately not attempted blind.
3. CC-1 separately owns the still-open unfiltered running-balance defect thread beyond BANK-F30002 —
   coordinate before claiming new Banking verify-step numbers to avoid colliding with theirs.

## CC-1 — Pedro-shaped-gap audit across the 17, inside the (now-superseded) 21-tour window (2026-09-08)

Audited whether any of the other 16 driver-settlement rows share Pedro's shape (tour 5772: 2 of that
tour's 4 loads present, 2 absent). Full table: `docs/bus/OUTBOX-CC-1.md` (2026-09-08 06:1xZ). Result:
none do — every outside-5774–5796 tour referenced anywhere across the 17 (5753, 5761, 5764, 5765,
5767, 5768, 5769, 5770, 5771, 5772, 5773) was pdftotext'd from its real signed PDF and every load on
it is present live except tour 5772's 13502/13507.

**Pedro's own case is not a USMCA gap.** 13502/13507 are Transportation-entity loads under the
standing owner entity rule (13:36Z) — not USMCA rows at all. His real USMCA loads on tour 5772
(13512, 13513) are both paid and present. If 13502/13507 pay is owed, it's a Transportation-books
question, not a hole in this rebuild.

> **SUPERSEDED 2026-09-08 by owner ruling "WE HAVEN'T CHANGED THE NAME IN ALWAYS":** the above
> Pedro→Transportation reclassification keyed off the doc header "IH35 Transportation, LLC", which is
> a STALE AlwaysTrack label (never renamed), NOT an entity signal — EVERY in-scope doc 5769–5796 shows
> it. Entity is set by the Faro purchase line, not the header. **Tour 5772 is USMCA; loads 13502 &
> 13507 are USMCA and ARE a real hole in this rebuild.** Pedro is owed his full $997.08 (all 4 loads).

This audit was run against the OLDER 21-tour/5774–5796 framing before reading the SCOPE CORRECTION
section above — it does not address the 38-tour/36-missing-load finding. Reading the checker handoff
(`~/Downloads/2026-09-08-Cursor-to-Claude-SETTLEMENT-REBUILD-CHECKER-HANDOFF.md`) next.

## CC-1 — CHECKER VERDICT on the 21-doc rebuild handoff — CONDITIONAL GO (2026-09-08)

Independently re-derived the checker handoff (`~/Downloads/2026-09-08-Cursor-to-Claude-SETTLEMENT-
REBUILD-CHECKER-HANDOFF.md`), all 4 sections, myself — not trusting Cursor's summary:

1. **Tie-out harness** — ran `node scripts/reconciliation/preview-usmca-settlement-rebuild.mjs`
   myself: `PREVIEW PASS`, docs:21 lines:163, grand **27487.36**. Confirmed. pdftotext'd
   `Driver_Settlement_5780.pdf` myself: two Flat Rate $150 loads (13530, 13532), `TOTAL DUE: 300.00` —
   matches the harness's net exactly. Spot-checked the sign model against 5774/5780 real PDFs — holds.
2. **Reversal engine** (`settlement-payrun-reverse.service.ts`) — read in full. Confirmed: reverses
   via `reverseJournalEntryNoFlip` (no new GL math), proves equal-and-opposite at the full
   (account, class, entity) grain with a hard throw on failure, targets `payrun_gl_runs` (the path
   that actually posted the 17), correctly inverts advance recovery + both escrow sub-ledgers
   (GL-linked `accounting.escrow_accounts` via `recordEscrowPostingOnly('release')` AND the pay-run
   cap summary `escrow_balances`/`escrow_ledger`), clears `posted_at`. Well-built, matches the claim.
3. **17→21 delta** — queried live: `SUM(net_pay)` over the 17 closed USMCA settlements =
   **$31,147.37**. Minus $27,487.36 = **$3,660.01**. Confirmed exact.
4. **8 zero-pay loads + manual JE** — queried live: 7 of 8 (13517,13524,13527,13531,13533,13539,13540)
   already have VOIDED `driver_finance.driver_bills` rows at the exact signed-doc gross amounts
   ($471.97/$853.61/$696.15/$666.81/$500.22/$670.68/$760.59) — un-void, don't recreate. Only 13554
   has no bill row — create. Matches the plan exactly; confirms it must un-void 7 + create 1, not
   blindly create 8. Manual JE `15e0887f` (tour 5796, −$389.66) fold-in: not re-verified independently
   by me — already independently verified by CC-2 (`docs/bus/OUTBOX-CC-2.md`, line-level, 4 independent
   searches, confirmed standalone + folded into `settlement_lines` + no other correction JE exists
   2026-07-03→09-07) — citing, not duplicating that work.

**Verdict: CONDITIONAL GO.** Every mechanical claim in the handoff is independently confirmed —
dollar-for-dollar, PDF-for-PDF, code-read, live-queried. I am not withholding on the mechanics.

**The one open condition:** this file's own SCOPE CORRECTION section (above) — discovered the same
day, apparently after this handoff was written — says the real universe is 38 tours (not 21), 36
loads are missing across that wider set, and 9 of the 17 live rows mix loads from 2–4 different
tours. The 21-doc PREVIEW harness proves the TARGET state (21 fresh doc-settlements) is internally
consistent; it does not verify that reversing the 17 messy, tour-mixed rows and remapping their lines
onto the correct one of 21 new doc-settlements is itself correct — that redistribution step isn't
covered by anything I re-derived above. Executing the 21-doc rebuild now would be mechanically safe
but would leave the wider 38-tour gap (and the still-open "does everything before tour 5769 belong in
USMCA or is it Transportation/QBO-reconcile" question) unresolved immediately after — a real risk of
needing a second rebuild days later on the same ledger.

**Ask before posting:** the owner's decision on the 38-vs-21-tour scope question already flagged
above (`OPEN owner scope decision`). If the owner says "post the 21 now, the wider 38-tour question
is separate and later" — my GO is unconditional and this rebuild can execute as planned. If the
owner wants both handled in one pass, the orchestration needs to widen before posting. Nothing posts
without both yeses per the handoff's own rule; this is that rule being followed, not a stall.
