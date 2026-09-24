# 00-WORK-QUEUE — CLAIMABLE BACKLOG — NEVER IDLE
Maintained by Claude Lead. Last rebuilt 2026-09-23 7:05 PM CT (00:05 UTC).

## LAW: NO SEAT IS EVER IDLE. NO SEAT EVER WAITS FOR LEAD TO ASSIGN WORK.
When you finish, or when you are blocked and have filed the blocker, you
come HERE and CLAIM the next unclaimed item you are allowed to take.
You do NOT report "out of work". You do NOT wait for a box.

## HOW TO CLAIM — 30 seconds, no Lead round-trip
1. `git pull` so you see other seats' claims.
2. Pick the TOP unclaimed item you are allowed to take (see ALLOWED below).
3. Edit this file: change `[ ]` to `[<YOUR-SEAT> <UTC timestamp>]`.
4. Commit ONLY this file, message `claim: <item id> <SEAT>`, push immediately.
   If the push rejects, pull and pick the next unclaimed item. First push wins.
5. Start. Post progress to your OUTBOX, not here.
6. When done, change your claim to `[DONE <SEAT> <PR#>]` and claim the next.

## ALLOWED BY SEAT
CURSOR  — the feed only. Never claims from this queue. Sole writer of USMCA data.
CC-1    — anything tagged FINANCIAL, FEED-ENGINE, ACCOUNTING or GUARD.
CC-2    — anything tagged FRONTEND, GATE, BANKING or GUARD.
CC-3    — anything tagged ACCOUNTING, IFTA, GUARD or FINANCIAL.
CODEX   — anything tagged DISPATCH, IDENTITY, GUARD or FRONTEND.
DEVIN-A — anything tagged GUARD or REPORT.
DEVIN-B — anything tagged GUARD or REPORT.
If two seats are allowed the same item, first push wins. No negotiation.
NOBODY except CURSOR writes USMCA transaction data. Ever.

## RULES THAT APPLY TO EVERY ITEM
Gate green or the branch waits. No --no-verify. No GitHub Git Data API
publishing. Never weaken a guard or regenerate a baseline to pass.
Every guard: baseline 0 · shrink-only · --write-baseline FORBIDDEN ·
self-arming population exemption · wired into money-pr-local-gate.mjs ·
RED-BEFORE-GREEN with BOTH runs pasted · UNNUMBERED filename.
Guards read as ih35_ci_readonly, never neondb_owner.
SET LOCAL app.bypass_rls='lucia' INSIDE a transaction. AN EMPTY RESULT IS
RE-RUN BEFORE IT BECOMES A STATEMENT.
A blocker inside your own work is YOURS to fix with a LANE_CROSS. Do not
post a finding and wait. Exception: another seat already inside that file.
Never work in the shared main checkout.

---

# P0 — THE FEED CANNOT BE TRUSTED WITHOUT THESE
[DONE CODEX PR#22476] Q01 GUARD  verify-costs-are-expenses-not-handwritten-jes.mjs — FAIL a JE
      debiting 5xxx/6xxx with no accounting.expenses row; FAIL a cost JE
      crediting 1090/1100/1150; PASS on 1295/2510/2500/1000. RED fixture:
      the 10 live fuel JEs crediting 1090, $7,250.20, bare-UUID memos.
[CODEX 2026-09-23T23:40:23Z] Q02 GUARD  Tighten guard 45 — a bare UUID is NOT a document reference.
      Require a load number (134xx), settlement (57xx/58xx), Faro invoice,
      driver name, vendor name, or unit (Txxx). RED fixture: the live memo
      "Fuel event 56627fdf-6bf6-476b-a6ee-d8b5452ac1cf (diesel...".
[DONE DEVIN-A 2026-09-24T00:15:00Z, PR #22474 -- CC-3 claimed first (23:22:02Z) and built an
      independent working version, but #22474 landed and merged first with a stricter, document-
      level scope matching parity exactly (0 of 95 loads in scope right now, PASS); CC-3 verified
      #22474 live rather than duplicate it, and filed a real latent gap found in it instead:
      docs/audit/GUARD-WORKORDERS.md PL-COST-OF-REVENUE-INSURANCE-PERMANENTLY-UNSATISFIABLE-
      UNDER-LOAD-SCOPE (insurance_expense can never post-check-green once documents start
      closing, per its own per-load INNER join)] Q03 GUARD  Feed-scope verify-pl-cost-of-revenue.mjs — same shape as
      E12.3-R3. Read the CLOSED FEED SET the parity guard already computes.
      Print "P&L scope: N of X loads in scope, M skipped NOT FED YET".
[DONE CC-1 2026-09-23T23:29:52Z, PR pending merge (blocked on Devin-B's Q03 collision, not mine)] Q04 FEED-ENGINE  Feed-day executor IDEMPOTENT + RESUMABLE. Key on Faro
      invoice number + purchase date, never row counts. Derive the next
      unfed day from LIVE STATE. Guard verify-feed-day-is-idempotent.mjs,
      proven by feeding 8/10 twice on a REHEARSE branch. DO NOT RUN THE FEED.
[DONE CC-1 2026-09-23T23:29:52Z, PR pending merge (blocked on Devin-B's Q03 collision, not mine)] Q05 FINANCIAL  WO normalization at
      apps/backend/src/factoring/faro-csv-import.ts:426 — strip whitespace,
      leading '#', leading zeros, case-insensitive. Never match on amount.
      0 or >1 -> STOP that invoice. Guard
      verify-faro-po-match-is-normalized.mjs.
[CC-2 2026-09-24T01:06:00Z] Q06 GATE  Gate live reads connect as ih35_ci_readonly, never
      neondb_owner — six seats read prod while the feed writes and
      owner-role reads contend with its locks.
      BUILT + LIVE-VERIFIED, pushing now: scripts/money-pr-local-gate.mjs
      resolveGuardDatabaseUrl() on cc2-gate-scope-03-refix (FINDING: GATE-F005).

# P1 — GUARDS THAT STOP TODAY'S DEFECTS COMING BACK
[DONE DEVIN-A 2026-09-24T00:15:00Z, PR #22474] Q07 GUARD  verify-every-void-route-reverses.mjs
[DONE DEVIN-A 2026-09-24T00:15:00Z, PR #22474] Q08 GUARD  verify-no-voided-doc-has-live-postings.mjs (baseline 0)
[DONE DEVIN-A 2026-09-24T00:15:00Z, PR #22474] Q09 GUARD  verify-baselines-are-post-wipe.mjs
[DONE DEVIN-A 2026-09-24T01:30:00Z, PR #22480] Q10 GUARD  verify-no-stale-literals-in-guards.mjs — §9.0.17 sweep. Four
      hardcoded-count defects surfaced today: 333-vs-92, fuel 589/$253,271.24,
      purge-window 9 then 11, and "47 documents". Allowlist only by
      `// STALE-LITERAL-OK: <reason>`.
[CODEX 2026-09-23T23:48:51Z] Q11 GUARD  verify-purge-era-closures-still-hold.mjs — re-assert tasks
      19/21/24/25/26/29/30/31/39 and SCALE with the live load count. Print
      "closure re-measured at N live loads". "Zero now" on a 6% fed book is
      not "fixed".
[CODEX 2026-09-23T23:54:58Z] Q12 GUARD  verify-one-canonical-active-load-set.mjs — four-arm ratchet,
      selftest RED against current code first.
[CODEX 2026-09-24T00:30:00Z] Q13 GUARD  verify-load-costs-board-excludes-settled.mjs
[CODEX 2026-09-24T01:15:00Z] Q14 GUARD  verify-loves-geofences-seeded.mjs — assert >=604 Love's
      geofences + their mdata.locations halves + a stated radius each.
      611 live today; this protects finished work from a future purge.
[DONE CODEX PR#22481] Q15 GUARD  verify-no-capability-regression.mjs — 14 capabilities; fail on
      missing symbol, moved file, OR duplicate definition.
[DONE CC-3 2026-09-24T01:26:26Z, PR #22484] Q16 GUARD  verify-no-driver-merge-without-hard-identifier.mjs
[DONE CC-1 2026-09-23T23:49:16Z, PR #22467 -- built and merged earlier this round (TASK 27), already live and self-arming] Q17 GUARD  verify-settled-load-carries-settled-status.mjs

# P1 — DISPATCH / READ PATH
[CODEX 2026-09-24T01:40:00Z] Q18 DISPATCH  Canonical active-load set — ONE module. Predicate:
      status NOT IN ('draft','invoiced','paid','closed','cancelled') AND NOT
      (load carries an invoice with status NOT IN
      ('draft','proforma','void')). Delete all 10 private copies including
      the misnamed ACTIVE_LOAD_FILTER. Narrower views derived in the same
      module. No UI filter. Read path only.
[ ] Q19 DISPATCH  Report whether at_pickup / in_transit / at_delivery /
      assigned_not_dispatched are dead vocabulary. No load_status_history
      exists — file the finding, never silently drop them.
[CC-2 2026-09-24T01:06:00Z] Q20 FRONTEND  VOID-BUTTON-01 — QBO split button Cancel / Void / Delete by
      module, SAME options on the multi-selector, system-wide.
[CC-2 2026-09-24T01:06:00Z] Q21 FRONTEND  FILTER-MULTI-01 — finish: guard + live-Chrome screenshots
      + the 8 remaining pages. In flight on cc2-filter-multi-01: shared
      components + Bills/Expenses/Invoices/Banking/Journal-Entries retrofits +
      guard done (5 of 12); 7 pages + screenshots remain.
[CC-2 2026-09-24T01:06:00Z] Q22 FRONTEND  Settlement / Presettlement column on EVERY accounting,
      financial and dispatch surface — list, table, drawer, modal, report.
      Settlement via driver_settlements + settlement_lines.load_id (NOT the
      dead driver_bills.settled_in_settlement_id). Presettlement via
      mdata.loads.presettlement_link_id. ONE guarded sweep, ONE generalized
      guard. §9.0.17.
[ ] Q23 DISPATCH  Every load auto-assigned to a tour at creation. Find and
      fix any booking/creation path leaving tour_id null.

# P2 — ACCOUNTING ENGINES
[DONE CC-3 2026-09-24T01:16:32Z, NO PR -- ALREADY DONE, confirmed live, verified not built] Q24 ACCOUNTING  Task 17 — deductions.routes.ts + settlement voids through
      the EXISTING dispatcher (all five engines). Never a sixth.
[CC-2 2026-09-24T01:06:00Z] Q25 BANKING  Task 16 — banking /void routes through that same dispatcher.
      BUILT + TESTED, pushing now: apps/backend/src/accounting/void-document.service.ts
      new bank_categorization_reversal case (thin pass-through to the SAME
      reverseJournalEntryNoFlip) on cc2-task16-banking-void-dispatcher (FINDING: BANK-F30303).
[CC-1 2026-09-23T23:49:16Z] Q26 ACCOUNTING  Task 38 — JE memo WRITER only. No backfill. One file.
      Do it before the feed writes many more.
[CC-2 2026-09-24T01:06:00Z] Q27 BANKING  Task 48 — Relay deposit fetch + DAILY cron. State its UTC
      cron expression and next fire time. In-app scheduling, never an
      in-process timer. Guard 47 self-arms when it lands.
[ ] Q28 IDENTITY  Task 32 — Genaro Guerrero Chavez duplicate. TWO driver rows
      still live. One atomic script, 10 tables, collisions RESOLVED not
      skipped, duplicate ARCHIVED not deleted, per-table count assert before
      COMMIT.
[ ] Q29 IDENTITY  Task 33 — Morales / Carlos Mauricio trio stays OPEN. Never
      merged on name similarity. Devin-B verified the duplicates are still
      present and that is CORRECT.
[DONE CC-3 2026-09-24T01:27:09Z, CLOSED STALE -- confirmed docs/bus/OUTBOX-CC-3.md:1458
      "CC-1 → CC-3 · 2026-09-22 · voidDocument() signature compiles, here it is — you're
      unblocked", already posted and consumed two days ago] Q30 ACCOUNTING  Task 12 — post the signature owed to CC-3's OUTBOX, or
      confirm it stale and close it.

# P2 — IFTA, NEVER BUILT
[CC-3 2026-09-24T01:27:09Z] Q31 IFTA  Task 34 — gallons over integrations.relay_fuel_transactions,
      now 1,707 rows. Transaction-reference join FIRST, then exact address
      only, NEVER prefix. No jurisdiction unresolvable until Relay + the
      Dreamline statement (397 rows with a real State column) + the Love's
      604-store seed are ALL joined.
[ ] Q32 IFTA  Task 36 — catalogs.ifta_states is 0 rows beside 96 live
      reference.ifta_tax_rates. Seed it or retire it. Decided, not empty.
[ ] Q33 IFTA  Task 37 — reports.ifta_filings has 1 row. Build the filing
      chain or scope it. Gallons per jurisdiction, NEVER dollars. DEF/urea
      is not a motor fuel.

# P3 — INFRASTRUCTURE
[CC-2 2026-09-24T01:06:00Z] Q34 GATE  Bus channel — NOW-<SEAT>.md 4KB cap, archive the 83-548KB
      INBOX/OUTBOX files, verify-bus-files-are-readable.mjs with the 48-hour
      staleness arm. That arm is what would have caught Codex idling 12 days
      and CC-2 idling on a dead signal.
      BUILT, rebasing onto Q38's now-committed bus files and pushing next on
      cc2-bus-channel-e13-2-r.
[DEVIN-A 2026-09-24T01:35:00Z] Q35 REPORT  Walk EVERY module live in Chrome — dispatch, load costs,
      loadboards, accounting, banking, fleet, maintenance, safety, reports.
      One finding per defect with a live screenshot and the measured number.
      File them; do not fix outside your lane. This queue never empties
      while this item exists — re-claim it whenever nothing else is open.

[CC-1 2026-09-23T23:29:52Z] Q36 FEED-ENGINE  Wire determineNextUnfedFaroDay into the actual resume
      path. CC-1 found it in his own REMAINING: the helper exists and NO
      CALLER INVOKES IT, so resumability is built but not real. Self-
      identified, approved, CC-1 claiming.
[DONE CC-1 2026-09-23T23:49:16Z, NOT A BUG -- confirmed live] Q37 GUARD  The 10 original fuel JEs carry reversal entries and net to
      0.00, but voided_at on the originals read 0 at 2026-09-23 23:30:30Z —
      reversed but not stamped. Confirm live. If still 0, it is a gap in the
      reversal engine: a reversed document that does not carry its void
      stamp is invisible to every void-aware guard. Fix the engine, then
      guard it.
      CLOSED, not fixed: re-confirmed live (bypass_rls) -- all 10 still
      voided_at=NULL/status='posted' with reversed_by_je_id set. This is the
      DOCUMENTED Option-1 reversing-entry model in journal-entries.service.ts
      ("voiding a posted JE NEVER mutates/flips the original... a status
      flip would SILENTLY DROP the entry from every GL report filtering
      status <> 'voided'"). verify-void-stamp-columns.mjs already declares
      `journal_entry: null` (no status-flip expected) for exactly this
      reason -- already correctly modeled, not an unguarded gap. Not fixing
      something that isn't broken.
[DONE CC-1 2026-09-23T23:49:16Z, PR #22477] Q38 GATE  Commit the bus files to main. They exist in every working tree
      as UNTRACKED files and are absent from origin/main — a fetch does not
      see them and `git clean -fd` deletes them. CC-1 verified this. Docs
      only: 00-LEAD-ROUND.md, 00-SEQUENCE.md, 00-WORK-QUEUE.md, and all
      NOW-*.md. Blocking every seat's ability to read its own orders.
