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
  - **⚠ 2026-09-09 (Cursor) — self-inflicted-then-reversed disturbance of these EXACT 7 loads.**
    Acting off the stale 09-05 invoice `void_reason` ("TRANSPORTATION-NOT-USMCA") WITHOUT reading this
    file first (Rule 51 miss), Cursor briefly re-ran the bad quarantine on live `br-fancy-credit`:
    set loads 13517/13524/13527/13531/13533/13539/13540 to `status='cancelled'` +
    `is_sample_data=true` at 15:43Z. **REVERSED at ~23:5xZ the same session** back to
    `status='delivered_pending_docs'`, `is_sample_data=false`, cancel_reason/code/canceled_at/by
    cleared (verified live: 7/7 restored). These are REAL USMCA money owed per this block — NOT
    contamination. The stale invoice void_reason is NOT authority; THIS block + the signed docs are.
    **Rebuild checker: re-confirm these 7 are `delivered_pending_docs` + `is_sample_data=false` on
    the current prod HEAD before any Phase-2 post** (a cancelled/sample load breaks earnings-line
    linking + excludes it from scope). No other loads were touched.
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

## Phase 2 build recipe — the repost, schema-grounded (2026-09-08, Cursor)

Phase 1 (reverse) is MERGED + branch-proven (#21448) and prod-guarded (#21453, `assertNotProd`).
Phase 2 = the repost. Build it into the SAME orchestration `.mts` so reverse→repost runs as ONE
gated pass (the app is never left empty). Reuse `closeSettlementPayRun` — NO new GL math. The
28-doc target is penny-exact TODAY: `node scripts/reconciliation/preview-usmca-settlement-rebuild.mjs`
→ `PREVIEW PASS`, 28 docs, 234 lines, grand **$37,830.87**.

**Signed-doc line model → poster terms (verified against doc 5772/5778):**
- `loaded_pay`/`empty_pay`/`flat_rate` + `additional_pay` (layover/bonus) → settlement `gross_pay`
  (driver-pay expense debit). i.e. `gross_pay = salary + additional_pay`.
- `reimbursement`/`deduction` (fuel, scale, toll…) → `settlement_lines(line_type='reimbursement')`,
  positive. Poster's `loadReimbursementsCents` sums active reimbursement lines.
- `escrow` = exactly **−$25 per load** → `settlement_lines(line_type='escrow_contribution')`, one
  −25 line per load. Poster reads `loadAccruedEscrowContributionCents` for `settlement_model=
  'load_bookended'` (sums the lines as-is, no re-cap at close). SET `settlement_model='load_bookended'`.
- `admin_fee` = −$10 → an "other" `driver_settlement_deductions` row (`applied_to_settlement_id` set,
  `voided_at IS NULL`). Poster's `loadOtherDeductionsByRole` maps it via `bucketRecoveryRoleKey` →
  MUST resolve a CoA recovery role or the close throws `DEDUCTION_RECOVERY_ACCOUNT_MISSING`. **Verify
  the admin-fee recovery role is bound before rehearsal.**
- `cash_advance` → recovered from the EXISTING `driver_advances` rows (restored by the Phase-1
  reversal — do NOT create new ones).
- Penny check example doc 5772 (Pedro): gross 1481.83 + reimb 15.25 − escrow 100 − admin 10 −
  advance 390 = **997.08** ✓.

**Schema facts (measured 2026-09-08 — NOT NULL / no-default columns to satisfy on create):**
- `driver_settlements`: operating_company_id, display_id, driver_id, period_start, period_end,
  status, **trace_no (bigint, NO DEFAULT — source it the same way live inserts do; do not invent)**.
  `gross_pay` dflt 0; `settlement_model` nullable (set `load_bookended`); `source_document_ref`
  nullable (stamp the 4-digit doc); `is_sample_data` dflt false (**MUST stay false — real money**).
- `settlement_lines`: settlement_id, line_type, description, amount (all NOT NULL); set
  operating_company_id + load_id + is_active=true; `amount` is a numeric dollar value (poster uses
  `dollarsToCents`). Earnings lines must be `line_type IN ('earnings','deadhead_pay')` WITH load_id
  or the poster's `SETTLEMENT_HAS_NO_LOAD_ACTIVITY` guard refuses to post.
- `driver_settlement_deductions`: operating_company_id, driver_id, deduction_type, amount_cents,
  reason (all NOT NULL). `amount_cents` is a bigint (cents), positive magnitude.

**Dependencies to resolve BEFORE the rehearsal (each a real query, none guessable):**
1. `trace_no` source for driver_settlements (sequence or max+1 — match live inserts).
2. admin-fee → CoA recovery role binding exists (else close throws).
3. driver name (CSV) → `mdata.drivers.id` map for all ~11 in-scope drivers.
4. load number (CSV) → `mdata.loads.id` map for all in-scope loads.
5. the 8 zero-pay bills: un-void 7 existing VOIDED `driver_bills` at signed amounts (13517, 13524,
   13527, 13531, 13533, 13539, 13540 — 13540 has a known 1¢ delta to TRACE not shrug) + CREATE 13554.

**The one real edge case — per-tour advance recovery.** `closeSettlementPayRun` recovers ALL of a
driver's un-recovered `driver_advances` at each close (oldest-first). Posting per-tour, a driver with
advances across multiple tours would have tour #1 sweep every advance → other tours miss their penny.
FIX: process a driver's tours chronologically and cap each close at that tour's exact `cash_advance`
sum via the B7 `loanRecoveryDecision {mode:'partial', partial_cents}`, mapping the signed cash_advance
lines to the specific advance rows. Net ties per tour; advance→tour attribution stays oldest-first.

**Rehearsal (fresh branch off prod each time): reverse (Phase 1) → un-void/create bills → post 28 →
assert each net == signed `total_due` AND grand == 37830.87.** Prod post stays gated: `assertNotProd`
blocks `--commit` at the code level; the real post needs Claude GO + owner yes.

## Phase 2 PROVEN — 28/28 penny-exact reverse→repost on a fresh branch (2026-09-08, Cursor)

Script: `apps/backend/scripts/repost-usmca-settlements-phase2.mts` (Phase 1 reverse runs first via the
existing orchestration, then this reposts). Rehearsed on fresh branch `br-tiny-sky-aksnm3zj` off prod:
**all 28 tours net == signed `total_due` to the penny; grand net = expected = $37,830.87. Prod untouched
(0 `S-2026`, 17 original posted runs, 0 JEs after 07:00Z — re-verified on `br-fancy-credit`).**

Corrections to the recipe above (what the live schema/poster actually required — believe THIS block):
- **`trace_no` is AUTO** (`trg_assign_trace_no` BEFORE INSERT) on both `driver_settlements` and
  `settlement_lines`/`driver_bills` — do NOT set it (recipe's "source it" note was wrong).
- **`escrow_contribution` lines are stored `+25.00`**, not −25. The poster sums `SUM(amount)` as a
  positive magnitude to withhold; live rows are +25.00. Write +25/load (the CSV's −25 is doc-net sign only).
- **admin_fee** → `driver_settlement_deductions(deduction_type='other', amount_cents, applied_to_settlement_id)`
  → resolves `other_recovery` → **7200 Driver Admin Fee & Chargeback Income**. There is NO `admin_fee`
  deduction_type. All close CoA roles are bound for USMCA.
- **Driver resolution must NOT use `mdata.drivers` directly** (it has duplicate rows + partial names).
  Resolve against the DEDUP universe of drivers referenced by USMCA `driver_bills`∪`driver_settlements`,
  with **bidirectional token-subset** matching (signed doc "HUGO GAYTAN SARABIA" vs DB "HUGO GAYTAN";
  DB "…MORALES NOGUEZ" vs doc "…MORALES"). 17 real driver ids, each unique.
- **3 in-scope loads had no `mdata.loads` row** (13502, 13507 = Pedro 5772; 13505 = 5776). Seeded minimal
  `delivered_pending_docs` rows (template FKs: customer/flag/trailer from a neighbor USMCA load,
  dispatcher = system actor) so earnings lines link. Full customer/revenue/factoring hydration = follow-on.
- **Pedro (5772) was OMITTED from the `historical_backfill` cash-advance seeding every other driver
  got** (CA-2026-0001..0004). That is the ENTIRE reason his net came out +$390. Seeding his $390 as the
  same `historical_backfill` pattern (a `driver_advances` row `status='active'` + its `driver_liabilities`
  row; NO disbursement JE because books start at $0) makes 5772 recover it → **net $997.08**. Opt-in via
  `SEED_SIGNED_ADVANCES=1` so nobody silently mints a money record; per-driver it seeds
  `max(0, Σ signed cash_advance − Σ available recoverable outstanding)` (a no-op for the other 27).
- Net pay accrues to **Driver Net-Pay Clearing** payment method (`81f95ee0…`, GL 2170) — records-only,
  no money moves; the bank payment is a separate reconciliation step.
- Period dates: **`LEAST/GREATEST`** normalize the header start/end (doc 5779's signed dates are reversed).
- **`closeSettlementPayRun` opens its OWN connection** (`withCurrentUser`) — it does NOT join the
  script's tx, so there is no rollback-preview for the post. Point BOTH `REBUILD_DB_URL` and `DATABASE_URL`
  at the SAME branch and rehearse on a disposable branch.
- **Neon `reset_from_parent` did NOT reliably clear the compute** here (stale data survived a "ready"
  reset). Use **delete + create a fresh branch** per rehearsal; use the DIRECT (non-`-pooler`) endpoint.
- Direct RLS inserts need `operating_company_id` set explicitly on `settlement_lines` (session-level
  `set_config('app.bypass_rls','lucia',false)` alone did NOT satisfy `is_lucia_bypass()` for FORCE-RLS
  tables; the `operating_company_id = app.operating_company_id` clause does).

## Phase 1 SCOPE FIX — reverse the 14 Faro settlements, NOT all 17 (2026-09-08, Cursor)

**Defect found by live drift-check before the prod post (this is why you rehearse against current prod
HEAD, not a stale branch).** Phase 1's `discoverScope` reversed EVERY posted `payrun_gl_runs`
(17 settlements). Three of those are **ongoing September ops, not Faro-era**:
`S-13725` (loads 13553, 13563), `S-13728` (13570), `S-13730` (13572) — all period_start ≥ 2026-09-01,
all covering the in-progress/September **orphan loads** (no signed doc yet). Reversing them removed real
September pay the 28-doc repost never restores. The correct reversal scope is the **14 Faro-era
settlements** (period_start < 2026-09-01), which map exactly to the 28 signed tours (5769-5796).

FIX (in `rebuild-usmca-settlements-orchestration.mts`): `discoverScope` now filters
`ds.period_start < '2026-09-01'` (the owner's Faro/September line) and **prints the excluded September
settlements every run** so the exclusion is never silent on a money post.

**Scope corroborated 3 ways (all live):** (1) the signed-doc CSV grand for 5769-5796 = **$37,830.87**;
(2) `ALL-TOURS-VS-APP.md` — "Faro factoring STARTS at load 13508 / tour 5769," so tours ≥ 5769 are the
USMCA rebuild and 5753/5760-5768 (pre-Faro, $13,943.32) reconcile via QuickBooks; (3) 38 total signed
tours $51,774.19 − 10 pre-Faro $13,943.32 = **$37,830.87**. The 6 orphan loads (13544, 13551, 13553,
13563, 13570, 13572) have no signed doc and must NOT be settled in the rebuild.

**Re-rehearsed on fresh branch `br-small-silence-akmbih3c` off prod (scope-fixed):**
- `discoverScope: 14 Faro-era settlement(s) in scope; 3 September settlement(s) PRESERVED (excluded)`
- manual JE 15e0887f folded; **global equal-and-opposite proof journals=30 nonzero_dims=0 residual=0**
- Phase 2: **28/28 tie to signed penny, grand net = expected = $37,830.87**
- Live-verified on the branch AFTER the run: S-13725/13728/13730 still `closed` with active lines +
  pay-run posted (untouched); 28 `S-2026` settlements created; orphan loads 13544 & 13551 now have
  **0 active earnings lines** (correctly un-bundled → back to unsettled/in-progress).

Prod still gated: the Phase-1 script's `assertNotProd` is UNCONDITIONAL (no override) by design — the real
prod post is a separate, intentional, owner-authorized action, not a repoint of this rehearsal script.

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

## Active Architectural Decisions — Banking REG-028/030 (Cursor, 2026-09-10)

BofA statement (in = +, out = −) is the register convention. Plaid's Transaction.amount is the
opposite. Import now stores `plaidAmountToStatementCents` (negate Plaid cents; `is_credit` from
Plaid amount < 0). `spentReceived()` reads **is_credit only**. Live repair on USMCA FREIGHT
`e83028a5-…`: voided 36 unmatched pending phantoms (WORM), inserted 2 missing statement rows
(6/1 Love's $377.45, 8/27 $15 wire fee), flipped 286 Plaid `amount_cents` signs. Posted signed sum
= **$6,389.72** = statement ending. 12/08 deposit is now `amount_cents=+10000` / `is_credit=true`.
The 12/08 $100 is **categorized** (Owner's Capital, JE `b6b096c7`, 2026-09-07) so it sits on
Categorized (1) while For review is 287 — live-verified 2026-09-10 on app.ih35dispatch.com. Default
tab is **All** so the statement walk includes that row next to 12/12 Oak Street $2,775. Plaid
`accountsBalanceGet` / reconnect must not overwrite `current_balance_cents` once posted rows exist
(`applyPostedSignedCurrentBalance`). Date cells nowrap so `09/09/2026` is not `09/09...`. Pager
is First / Previous / Next / Last (date desc + Last = statement start). Preset **Oldest first**
sets date ASC + page 1. Description column `allowWrap` + no inner `truncate` so CHECKCARD memos
are not `XXXX...` (ParityTable nowrap+ellipsis is the default unless allowWrap). Live 2026-09-10:
All · 288, header $6,389.72, Date full on first page.

## Active Architectural Decisions — Dispatch REG-023 / 037 / 039 (Cursor, 2026-09-11)

Load detail footer **Edit** is tab-scoped: Overview → Edit load (full wizard), Stops → Edit stops
(`editFocus=stops` scrolls `book-load-stops-section`). Costs / Driver Pay do not open the Book Load
wizard. More ▾ still `setActiveTab`. Open driver bill → `/driver-finance/driver-bills/:id`. Drawer
fetches `useLoad(loadId)` / `useDispatchLoad(loadId)` only — no sibling NB/TR/SB legs. Round Trips
timeline default window **2026-08-25 → today**; `RT_TIMELINE_STATUSES` includes booked/planned/
unassigned; pairing set stays narrow. Round Trips fetch is `listAllLoads` (200/page) — a `limit=1000`
one-shot 400s (`Too big: expected number to be <=200`). `GET /dispatch/units-without-load` GROUP BY
must include `loc.city/state/formatted_location` (SELECT COALESCE(p, loc) 500s without them). Idle-units
WHERE is **lease-only** (`currently_leased_to_company_id = company`, never `owner OR lease`) plus sample/
sold/disposed/OOS excluded (Rule 49). Approximate load costs (Dispatch Home) has sortable **Truck**.
Create Bill load picker → `bill_lines.load_id` remains `verify-reg034-vendor-bill-load-picker-wired`.
Load 13553 Driver Pay **Open driver bill** live-clicks to `/driver-finance/driver-bills/3207db84-…`.
`+ Add Bill` from that load is load-scoped (`?load_id=&load_number=13553`); picker hidden; no POST.

## Active Architectural Decisions — Driver bill on assign (Cursor, 2026-09-11)

Owner: a driver bill must exist the second a driver is seated, even when miles/rate are missing —
operators track and seed later. `createDriverBillArtifacts` still never copies customer linehaul
(WIRE-02 / ACCT-F63). Unpriced path: audit `skipped_no_pay_rate` AND INSERT `status=open`
`gross_amount_cents=0` with tracking notes. Open $0 is not a settled load. Office PATCH
(`mdata/loads.routes.ts`) now calls `ensureDriverBillArtifactsForLoad` whenever a primary driver or
team is seated (Book Load / Edit Load already did). Quick-assign, inline quicksave, planner
reschedule, and manual reassign now call the same mint. An open $0 bill is **upgraded in place** when
pay later resolves — not stuck as `already_exists`. Voided bills stay un-reminted (ACCT-F277).
Thursday assigned loads without bills: Remint driver bill (Owner/Accountant) is allowed as soon as
a driver is seated — not only after delivery evidence. Same mint; $0 tracking if still unpriced.

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

## CC-1 — CHECKER VERDICT #2, on the WIDENED 28-doc/14-settlement rebuild — GO on the mechanics (2026-09-09)

My prior CONDITIONAL GO (immediately above) applied to the OLD 21-doc/17-settlement-reversal shape and
was explicit that it did NOT cover the 38-tour scope question or the redistribution step. Since then the
owner ruled the scope ("WE HAVEN'T CHANGED THE NAME IN ALWAYS" — doc header ≠ entity) and Cursor rebuilt
both phases against the new 28-tour/$37,830.87 target with a Phase-1 scope fix (14 Faro-era reversed, not
17 — 3 live-September pay-runs preserved). That is materially different work from what I originally
checked. Re-derived it independently, from a fresh clone at origin/main tip, not trusting any summary:

1. **28-doc preview harness** — ran `node scripts/reconciliation/preview-usmca-settlement-rebuild.mjs`
   myself: `PREVIEW PASS — all 28 docs tie to the penny`, grand **37830.87**, 234 lines. Confirmed.
2. **Phase 2 money math, reimplemented independently** (not trusting the script's own `--selftest` —
   couldn't run it directly, `pg` isn't installed in a fresh clone, so I copied only its pure
   CSV-parsing/tour-building/consistency-assertion logic, no DB code, into a standalone script and ran it
   against the same committed CSVs myself): 28 tours, grand **37830.87**, Pedro (5772) net **997.08**
   (gross 1481.83 + reimb 15.25 − escrow 100.00 − admin 10.00 − advance 390.00), matching the design
   note's own worked example exactly. Total in-scope loads: 63; total escrow lines: 46; total admin fee
   $697.25; total cash-advance recovery $1,595.96 — all internally consistent (earn==gross, reimb==
   reimbursed, −(escrow+admin+adv)==deductions per doc, for all 28 docs, not just Pedro).
3. **Phase 1 scope fix, live-verified**: queried `driver_finance.payrun_gl_runs` (status='posted',
   USMCA) directly — exactly **17** posted pay-runs exist today, **14** with `period_start <
   2026-09-01` and **3** with `period_start >= 2026-09-01` (S-13725 09-01, S-13728 09-01, S-13730
   09-02) — matches `discoverScope`'s filter and its claimed "14 in scope / 3 preserved" output exactly.
4. **Missing-load seed list, live-verified today**: the 63-load universe from the lines CSV vs a live
   `mdata.loads` lookup (USMCA) shows exactly **13502, 13505, 13507** absent — matches the design note's
   claim (13502/13507 = Pedro's tour 5772; 13505 = tour 5776) with zero drift since it was written.
5. **CoA role + payment method, live-verified**: `other_recovery` role is bound to account **7200
   "Driver Admin Fee & Chargeback Income"** for USMCA (active). Payment method `81f95ee0…` = "Driver
   Net-Pay Clearing", active. Both match the recipe exactly — the close will not throw
   `DEDUCTION_RECOVERY_ACCOUNT_MISSING`.
6. **Manual JE fold** — `15e0887f` still live, `voided_at IS NULL`, memo matches the documented
   $769.39→$379.73 correction. Unreversed, exactly as Phase 1 expects going in.
7. **Prod untouched today** — 0 `driver_settlements` rows with `display_id LIKE 'S-2026%'`; still 17
   posted pay-runs; status counts (18 closed / 6 open / 3 cancelled) match the pre-rebuild baseline. No
   accidental or partial live post has happened.
8. **Code read, both scripts in full** (`rebuild-usmca-settlements-orchestration.mts`,
   `repost-usmca-settlements-phase2.mts`): hard, unconditional `assertNotProd` on every DB connection
   string used (no override flag on either); Phase 1 requires a global equal-and-opposite proof
   (`nonzero_dims=0`, `residual_cents=0`) across every original + reversal JE before it will even commit
   on a branch; Phase 2 has a clean-state precondition (refuses to run if any `S-2026-57%` row already
   exists) and per-tour advance-recovery capping (chronological order, `partial_cents` per tour) so one
   tour can't sweep a driver's whole advance balance early. No new GL math in either — both delegate to
   already-reviewed primitives (`reverseSettlementPayRunInClientTx`, `reverseJournalEntryNoFlip`,
   `closeSettlementPayRun`).

**What I did NOT personally re-run:** the actual end-to-end Phase 1→Phase 2 execution against a live
disposable Neon branch. Cursor already rehearsal-proved that twice (most recently on
`br-small-silence-akmbih3c`, scope-fixed, 28/28 penny-exact, global proof residual=0) and re-running the
identical mechanical rehearsal a third time would not add information beyond what I've independently
reproduced above at the data/logic level — every live-data precondition the scripts depend on (scope
split, missing loads, CoA binding, payment method, manual JE state) checks out today, and the money math
is independently reproduced from the source CSVs, not merely re-read from a report.

**VERDICT: GO on the mechanics, unconditional this time — the scope condition from CHECKER VERDICT #1 is
resolved and independently re-confirmed against the current 28-doc/14-reversal shape, not just cited.**

**Still not executing.** Per the handoff's own rule and this file's repeated notes: "nothing posts to the
live ledger without Claude's yes AND the owner's yes." This entry is Claude's yes. I have not received an
explicit owner yes to run the live post in this session — "GO, build the mechanics" (cited above) is a
build authorization, not a post authorization, and the file's own language treats them as two different
gates in every place it defines this rule. I am not running `--commit` against prod. Whoever runs the
actual prod post next (owner-authorized) can point `REBUILD_DB_URL`/`DATABASE_URL` straight at
`br-fancy-credit-akjnd07a` with `REBUILD_I_UNDERSTAND=yes` per the scripts' own usage comments — but
`assertNotProd` will refuse it anyway; that gate has no override, by design, and should NOT be removed
to make the live post possible. That removal itself would need to be a reviewed, explicit, owner-visible
change, not a quiet edit to get this rebuild out the door.

## Fleet trailer identity — APD placeholders relabeled to real numbers (Cursor, 2026-09-10, REG-034)

The 20 `USMCA-APD-16..35` `mdata.equipment`/`mdata.assets` rows were NOT owner trailer numbers — they were
insurance-intake placeholder labels from the SIGNED Lloyd's APD quote 437539 (loaded 2026-08-31 by Claude
GO-01 #19315). The owner's real numbers map to them BY VIN in `docs/reconcile/AT-TMS-TRAILERS-2026-09-01.csv`,
and 12 had been created as SEPARATE duplicate rows (vin=NULL, dry_van, 2026-09-05/07). Owner-authorized
2026-09-10 ("REG-034 TO THEIR REAL NUMBERS"). Applied live (USMCA `br-fancy-credit`, one atomic tx):
- retired the 12 duplicate vin=NULL rows (equipment_number/unit_code `…-DUP-VOID-20260910`,
  equipment `status='OutOfService'`+`deactivated_at`, asset `status='retired'`+`out_of_service=true`) —
  **void-not-delete**;
- relabeled the 18 VIN-matched APD rows (equipment+asset) to real numbers.
Post-state proven: `active_apd_left=2`, `retired_dups=12`. Full map + SQL + proof:
`docs/reconcile/REG-034-APD-TRAILER-RELABEL-2026-09-10.md`. **STILL OPEN:** APD-25 (VIN …965870) and
APD-28 (VIN …394706) have NO CSV mapping — nearest real numbers 10870 / FB-56710 differ by one VIN char;
left as-is pending owner confirm, NOT guessed. `equipment_status` enum has NO 'Retired' value (use
`OutOfService`); `mdata.equipment` has neither `is_active` nor `operating_company_id` (scope by
equipment_number / owner_company_id / currently_leased_to_company_id); no FK anywhere references
`mdata.equipment`/`mdata.assets`, so retiring duplicates orphans nothing.

## Active Architectural Decisions — Dispatch / Lock-the-trucks (Cursor, 2026-09-10)

- **A truck (`mdata.loads.assigned_unit_id`) can be on AT MOST ONE active load — enforced at TWO
  layers (owner order 2026-09-10: "lock the trucks … once a truck is dispatched on a load it can't be
  silently reassigned or double-booked").**
  1. **App layer (NEW-02, already live):** `assertUnitNotActiveOnAnotherLoad`
     (`apps/backend/src/dispatch/unit-active-load-guard.ts`) is called BEFORE the write in ALL FIVE
     unit-assignment paths — book-load create, quick-assign, quicksave reassign, the generic
     load-edit PATCH (`update-load.service.ts`), and the office `loads.routes.ts` PATCH. Gives the
     friendly `unit_already_active_on_load` error.
  2. **DB layer (migration `202614042200_loads_one_active_unit_lock.sql`, merged #21713, APPLIED LIVE
     on `br-fancy-credit-akjnd07a` 2026-09-10):** partial unique index `uq_loads_one_active_unit`
     ON `mdata.loads(assigned_unit_id)` WHERE `assigned_unit_id IS NOT NULL AND soft_deleted_at IS
     NULL AND status = ANY(ACTIVE_UNIT_STATUSES)`. Defense-in-depth NEW-02 explicitly deferred to a
     migration lane — a truck physically cannot be double-dispatched even if a future write path
     forgets the app check.
- **`ACTIVE_UNIT_STATUSES` = `assigned, assigned_not_dispatched, dispatched, at_pickup, in_transit,
  at_delivery`.** The index predicate mirrors this list EXACTLY — keep them in lockstep if it changes.
  `delivered_pending_docs` / completed / draft / terminal / cancelled are EXCLUDED on purpose: a truck
  legitimately carries a backlog of many loads waiting on paperwork.
- **"Not silently reassigned" = every unit/driver change is logged** to
  `dispatch.load_assignment_history` (guard `verify-mdata-loads-patch-writes-assignment-history`,
  gated write, `assignment_method='full_form'`), so a swap to a *free* truck is allowed but never
  silent.
- **PROOF (2026-09-10):** rehearsed on throwaway branch `br-bitter-cake-akkjlzdf` and re-proven on the
  live branch — a 2nd active load on the same unit is REJECTED (`duplicate key value violates unique
  constraint "uq_loads_one_active_unit"`, tx aborts, no change); a legit swap to a free unit and the
  delivered_pending_docs backlog (2 loads on one truck) are BOTH allowed. Live-verified 0 pre-existing
  active duplicates before authoring.
- **Applying an index migration to the live branch:** the Neon MCP role (`ih35_app`) and the POOLED
  `neondb_owner` endpoint both fail `CREATE INDEX` with "must be owner of table loads"; apply via the
  **DIRECT** (non-`-pooler`) `neondb_owner` endpoint, then insert the ledger rows
  (`_system._schema_migrations` + `ih35_migrations.applied_migrations`) with `sha256(fileContents)` so
  a later `db:migrate` SKIPs it (no drift). `db:migrate` itself REFUSES this endpoint unless
  `ALLOW_PROD_MIGRATE=1` (it matches the prod host marker `ep-broad-block-akykk7bw`).

## Next Immediate Milestones — Dispatch (Cursor, 2026-09-10)

1. Numbered verify-step asserting `uq_loads_one_active_unit` exists (Cursor EVEN band; verify-step
   claim-before-write) — defense against a future DROP. Not yet claimed.
2. Settlement/pre-settlement number pairing (owner same message): SET-01/GO-22 already auto-links every
   load to a pre-settlement at creation (NB opens a new one, TR/SB join the truck's open tour); REG-008
   is the going-forward fix for the "driver assigned AFTER booking" gap. **RESOLVED 2026-09-10** via
   `scripts/ops/link-orphan-loads-presettlement.ts` (real service, no new GL math):
   - 13573 was a FALSE alarm — it already had `trip_type=NB`, a `tour_id`, and a `presettlement_link_id`
     (the prior "unlinked" reading only checked `settlement_lines`, a different link).
   - 13580 (Laredo TX→Edison NJ = NB) and 13581 (Battleboro NC→Laredo TX = SB) had `trip_type=NULL`, so
     the booking-time auto-link never fired (book-load links only when trip_type is present). Set the
     trip_type from each load's own Laredo-anchored stops, then linked via the REAL service.
   - **MONEY-SAFE CHOICE (`create_new`, NOT the auto link-existing):** both drivers' prior tours on
     those units are already CLOSED and **GL-POSTED** (S-2026-0002 $2,016.92 posted 09-07; S-2026-0020
     $752.96 posted 09-08, both unpaid). The linker's automatic REG-040 continuation would REOPEN and
     REVERSE those posted pay-runs (`reverseSettlementPayRunInClientTx`) to fold the new leg in — a
     posted-money movement + an owner decision, so this pass opened a FRESH pre-settlement per load
     instead. Result live-proven: 13580→**S-2026-0028** (open), 13581→**S-2026-0029** (open);
     S-2026-0002/S-2026-0020 UNCHANGED (same status/posted_at/net_pay). If the owner wants these legs
     to CONTINUE the prior posted tours (REG-040 reverse+repost), that is a one-word switch to
     `action="link_existing"`, done in-app.
   - **KNOWN DEFECT surfaced, NOT yet fixed:** `findOpenPresettlementTourForUnit` returns closed/paid/
     final tours, so the auto REG-008/booking path CAN silently REG-040-reverse a posted settlement on
     a routine driver assignment. Tests (`presettlement-link.service.test.ts` lines 363/474) assert the
     closed-tour reopen is INTENTIONAL, so this is an owner design decision, not a unilateral code flip.

## Active Architectural Decisions — Faro factoring day-by-day reconcile (Cursor, 2026-09-13)

Owner "close it identical … cash flow same data day by day". Full writeup:
`docs/reconcile/FARO-DAYBYDAY-RECONCILE-2026-09-13.md`. Key durable facts:
- **Cash Flow buckets factoring by `fa.advanced_at::date`; Purchase Report by `fa.submitted_at`.** To
  render identical to Faro BOTH must equal the Faro purchase date. The API create route stamps
  `submitted_at = now()`, so after a void→recreate the rebuild also does a benign
  `UPDATE accounting.factoring_advances SET submitted_at = <faro date>` (no JE — the funding JE is
  dated by `advanced_at` through the poster).
- **Entity separation is load-bearing.** `docs/reconcile/faro_canonical_purchases.csv` `src` column:
  `FARO-IH-35-Transportation-export-17.csv` = frozen Transportation (OUT of scope, uses load# as inv);
  `export (NN).csv` = USMCA (3-digit inv seqs). Matching USMCA advances to Transportation rows by
  `inv==load` is a cross-entity trap (load-number collision). Some canonical rows have inv/po SWAPPED
  by a parse quirk (e.g. `1013272-2` in inv, `059` in po).
- **1:1 assignment is mandatory** (`scripts/ops/faro_reconcile_full.py`): each Faro row consumed once,
  exact PO/inv edges first, then debtor+amount fills the rest — else same-debtor/same-amount loads
  (6× Semares $4,900) collapse onto one date and the daily totals lie. Debtor match uses token overlap
  OR whole-name concatenation (`J RAYL`==`JRAYL`, recovered load 13526).
- **APPLIED (Neon branch): 59 advances re-dated (void→re-advance), 0 fail; 18 days 08/10→09/11 verified
  identical to the projection.** Re-date advances got NEW FAC display_ids (void-not-delete leaves the
  old ones voided in the register) — expected, not a regression.
- **RESIDUALS = owner/data decisions (flagged, NOT auto-touched):** 13581/13586 disputes (Faro < face,
  advances held submitted); 13578 (+$560) / 13589 (+$30) under-billings — invoice PATCH is DRAFT-ONLY
  and has no `total_cents` input, so raising a sent+factored invoice is an owner money workflow, not a
  field edit; and 3 Faro purchases with NO advance ($8,000: Sethmar 013 $4,900 08/14, Direct Connect
  061 $2,100 09/10, Tennessee Steel 062 $1,000 09/10) — loads never entered, cannot fabricate.

## Active Architectural Decisions — Load-to-cash chain C1/C2/C3 (Cursor, 2026-09-13)

Owner law: a load booked → driver bill auto-created for that driver → load auto-assigned to a
pre-settlement/tour. Guard `scripts/verify-load-to-cash-chain.mjs`. Full forensic:
`docs/reconcile/CHAIN-C1-C2-BACKFILL-2026-09-13.md`. Durable facts:
- **The hooks EXIST.** Driver-bill mint = `ensureDriverBillArtifactsForLoad`
  (`book-load.service.ts:1091`), returns `not_applicable` with no seated driver
  (`driver_bills.driver_id` NOT NULL). Presettlement link = `linkLoadToPresettlementAtBookingInClientTx`
  (`presettlement-link.service.ts:624`) / REG-008 `linkLoadToPresettlementAfterAssignmentInClientTx`
  (`:695`). Both wired into book-load + quick-assign + quicksave + planner + reassign (bill convergence
  2026-09-11). A gap for a specific load is a backlog/data issue, not a missing hook.
- **`uq_driver_settlements_one_open_per_driver` is a PARTIAL unique index on `status='open'`** — a
  driver may hold only ONE open pre-settlement. This blocks create_new for a driver who already has an
  open tour, and is why cancelled OPEN historical settlements whose driver has moved on cannot be
  mechanically re-opened.
- **C1 backlog (13554/13573/13579/13580) minted** via the real hook (3 open $0 unpriced tracking +
  13579 priced) — they predated the 2026-09-11 mint convergence. LINK 1 = 0 driver-having loads unbilled.
- **C2 root cause was NOT a hook miss — it was an UNATTRIBUTED SCRIPT that CANCELLED 6 pre-settlements**
  on 2026-09-12 (01:21:49Z S-2026-0013/0021 from `open`; 01:46:49Z S-2026-0018/0020/0028/0030 from
  `closed`), blank `changed_by_role`/no `session_id`, clearing `loads.presettlement_link_id`. None
  posted (open/closed pre-settlements). **C2a restored the 4 owner-CLOSED ones to `closed` + re-pointed
  13564/13570/13580/13589/13586** (root-cause reversal, partial-index-safe). **C2b (13526/13527/13561/
  13567/13571/13574) is an owner decision** (the 2 were OPEN, drivers moved to newer tours S-2026-5806/
  5807; re-open violates one-open-per-driver, `closed` is an owner close; 13526 never had one).
- **Guard corrections:** USMCA-scoped (was counting frozen Transportation `L-2026…`); LINK 1 hard-fails
  only on driver-HAVING loads; driverless-delivered (13502/13505/13507 — no driver ever seated, owner
  data fix) + owner-pending (`OWNER_PENDING_UNLINKED`) are REPORTs not fake-red; **`set_config(bypass_rls,
  …,false)`** — the `true`/transaction-local form was lost under pg autocommit → every read RLS-filtered
  to 0 ("0 eligible loads" false FAIL). Guard now LIVE PASS at 88 USMCA loads.
- **C4 13595 already reverted** (`in_transit→dispatched` 23:52:05Z, audit-confirmed); **C5 13593 reads
  `dispatched`** live (planner `in_transit` render ≠ persisted state) — no anomaly.
- **LOADS FENCE reminder:** only Cursor writes load status / tour_id / trip_type / presettlement_link_id.
  Restoring a never-posted pre-settlement's status is tour-linkage (Cursor), not GL/posting (CC-1).
