# ROUND 285 — THE FULL WORK SEQUENCE, EVERY SEAT, EVERY REMAINING ITEM
# Claude Lead · 09-30-2026 · Laredo CT
# OWNER LAW: full builds only. Mechanical, economic, money, wiring, connectivity, linkage.
# No handing off. No deferring. No patching. Nobody reports "no pending orders" while this file has lines.
# Your seat's section IS your queue. Work it top to bottom. When you finish one, start the next
# WITHOUT asking. Only stop if a line is genuinely blocked by another seat's un-merged PR, and say which.

---

# PART A — LIVE STATE, MEASURED 09-30-2026 UNDER REAL BYPASS. This replaces every earlier number.

Production Neon `tiny-field-89581227` / `br-fancy-credit-akjnd07a`, USMCA `5c854333-6ea5-4faa-af31-67cb272fef80`,
`SET LOCAL ROLE neondb_owner; SET LOCAL app.bypass_rls='lucia'`.

## THE VOID POPULATION IS 96% CLEARED. Measured by following `reversed_by_line_id`, not by counting flags.

| source | voided recs | GL lines | originals still unreversed | status |
|---|---|---|---|---|
| `accounting.invoices` | 24 | 72 | **0** | REVERSED — CLOSED |
| `accounting.expenses` | 958 | 3,416 | **0** | REVERSED — CLOSED |
| `fuel.fuel_transactions` | 276 | 296 | **0** | REVERSED — CLOSED, $177,665.44 reversed exactly |
| `accounting.factoring_advances` | 51 | 376 | **164 (41 records)** | **THE ONLY REMAINING POPULATION** |

**The remaining dirty money is $164,562.00 debit / $164,562.00 credit across 164 lines on 41 advances.**
It is internally balanced, which is why the trial balance never screamed. Zero reversal lines exist against
any of the 41 — nothing has been attempted on them.

**Lead's earlier "$766,834.16 / 1,065 records" is superseded.** It was true when measured; three of the four
tables have been reversed since. Do not quote the old number again. Do not re-derive it.

## LEAD RETRACTIONS — on the record, do not act on the withdrawn versions
- **282.2 IS NOT A GAP. RETRACTED.** `factoring_advance` and `fuel_transaction` are both wired in the
  `EXECUTORS` map on current `origin/main`, along with `bank_transaction`, `reconciliation_match`,
  `driver_bill`, `driver_liability`, `check_number_registry`, `bill_line`, `settlement_line`,
  `safety_incident`, `legal_contract_instance`, `relay_fuel_transaction`, `relay_fuel_transaction_line`.
  **`load: { supported: false }` is the only unwired entry and that is deliberate.** I read the file at my
  own branch's base, which is 855 commits behind main, and reported a gap that ROUND 274 had already closed.
  CC-1 was right to push back. Build nothing for 282.2.
- **282.1 IS LIVE.** `accounting.fn_block_void_with_live_postings()` applied to prod (PR #23210), rehearsed
  twice on throwaway branch forks including a real end-to-end reversal of an actual `factoring_advances` row.
  Guard `verify-void-live-posting-db-constraint.mjs` step 11749. **CLOSED.**
- **Lead's `board_scope: "all"` value is WITHDRAWN.** Cursor's 8915dd1d81 fixed 283 on main with two explicit
  scoped calls per non-Dispatch surface, which is the better design. A third scope value is one more thing a
  caller reaches for by accident, and the defect WAS a caller not being explicit.
- Guard counts: **5,427** files (not 5,285), **1,124** registration candidates (not 1,046), **131 of them DO
  execute** through the dynamic runner. My "1,046 orphans" and my "never ran" are both withdrawn.
- The canonical 17 are the numbered list in `00-ROUND-282-CANONICAL-GUARDS-AND-VOID-CONSTRAINT.md`. **Any 17
  named in chat, including by me, that differs from those numbers is a paraphrase and does not govern.**

---

# PART B — CC-1 · ACCOUNTING LANE · full sequence, in order

**285.1.1 — #1 — the 6 Faro invoices into `day_control.json`. UNBLOCKED, do it first.**
All 6 Faro figures are supplied and the join is closed: Faro's `PO` column = AlwaysTrack W/O =
`mdata.loads.customer_po_number`. Faro's own `Inv #` is its internal sequence and means nothing to us.
Tie-out already proven to the cent: 094→13622, 096→13617, 097→13618, 101→13620, 103→13625, 104→13626.
PROOF: the 6 rows in `day_control.json` and the live query showing each advance resolving to its load.

**285.1.2 — 280.2 — post the 12 invoices that never hit the GL. $52,960.00.**
EXCLUDES the Transportation block. 13525 is $0.00 — say why before posting it or leave it out and say so.
Post by DOCUMENT, never a JE. PROOF: 1100 before/after, the 12 invoice ids, trial balance still balances.

**285.1.3 — 280.3 — A/P with no bills cannot exist. $2,117.49 against zero bills.**
Root-cause WHICH engine posted to 2000 without a Bill. A Bill IS Accounts Payable — an expense posting must
never touch 2000. Fix the writer, then correct the $2,117.49 by document. This is canonical guard #9's
population. PROOF: the writer's file and line, 2000 = open bills exactly, paste both sides.

**285.1.4 — #11 — kill the 7-day wall-clock gate.**
No guard may decide anything on wall-clock. Find every guard and every engine path that gates on elapsed days
and replace the condition with the actual state it was standing in for. PROOF: the call sites, before/after.

**285.1.5 — #6 — reinstate the 10 AUTH-089 rows, 77 to the review queue.**
PROOF: the 10 live rows, the 77-row queue count.

**285.1.6 — 280.1 — BULK ACCEPT, the 920 uncategorized bank rows. THIS IS THE BIGGEST ITEM YOU OWN.**
920 of 927 `banking.bank_transactions` uncategorized, 0 reconciled. That one fact is the root cause of
Undeposited Funds $315,561.76, Dreamline $115,963.75 unposted and the Relay wallet reading negative.
**Owner law: only 100% identical matches get categorized. No automatch — suggest and accept.** Everything
ambiguous goes to the review queue for the owner, itemised, never guessed.
`banking.bank_transactions.amount_cents` IS ALREADY SIGNED — withdrawals are negative. Never re-negate it.
PROOF: categorized count before/after, 1090 before/after, the review-queue count with its dollar total.

**285.1.7 — 280.11 — the $7,860.24 bank difference. Only after 285.1.6.** It is a subset of the 920 and
itemising it before the bulk accept is wasted work. PROOF: the itemised rows summing to 7,860.24 exactly.

**285.1.8 — #52 follow-through and #3/#4 regression watch.** Both are DONE-VERIFIED (AUTH-132, PR #23153).
Re-measure Advanced MTD (was 106 vs 93) and the advanced-flag count (95 vs 93) after 282.4 lands, because
reversing 41 advances moves both. Report the new pair. Do not re-fix what is already fixed.

**CC-1 — item 6 / the $166,868.94 plug is CLOSED for you.** Handoff merged (PR #23215). Do not reopen it.

---

# PART C — CC-2 · BANKING / FACTORING LANE · full sequence, in order

**285.2.1 — 282.4, FINAL SCOPE — reverse the 41 factoring advances. $164,562.00 Dr / $164,562.00 Cr, 164 lines.**
Invoices, expenses and fuel are already reversed and out of scope — do not touch them, do not re-reverse them.
The 41 are the whole job. 282.1's constraint is live, so the reversal must run as ONE transaction per record:
post the reversing entry and clear the live posting together. The constraint is DEFERRED to COMMIT precisely
so that works — you do not need it disabled and you may not disable it.
Reverse, never delete. Original untouched at full amount, reversing entry dated the reversal date, linked both
ways, void reason preserved verbatim.
PROOF per batch: the record ids, `reversed_by_line_id` populated on every one of the 164, the guard reading 0,
2150 and 6300 before/after, trial balance still balances.

**285.2.2 — 282.3 — the wholeness ratchet, re-baselined to the truth.**
`verify-void-is-whole.mjs` now baselines against a population that is 96% cleared. Re-baseline it to
**164 lines / 41 records, shrink-only, target 0**, all four tables still in scope so a regression on the
closed three is caught. `REQUIRES_LIVE_DB`, no wall-clock. Follow `reversed_by_line_id` — counting `voided_at`
flags is what produced the wrong 1,065. PROOF: the guard output at 164, then at 0 after 285.2.1.

**285.2.3 — 284.2 — the $166,868.94 plug. Received from CC-1, PR #23215.**
12 real Faro wire-ins at `review_state='for_review'` totalling $191,929.68 sit unmatched while JEs
ACCT-F20260925i/j book Dr 1000 / Cr 1090 as one aggregate plug.
1. Match each of the 12 INDIVIDUALLY. 100% identical only. No batch, no automatch, no bulk accept on these 12.
2. Explain the $25,060.74 delta BEFORE reversing anything. CC-1 stated it as unknown and did not cherry-pick —
   hold that standard. Do NOT match a subset chosen to hit 166,868.94.
3. Then reverse ACCT-F20260925i and j. Never delete.
PROOF: 1090 reads 0, trial balance balances, the 12 matched rows.

**285.2.4 — #48 — $39,108 never swept out of Undeposited Funds. 8 of 15 done (AUTH-134), 7 remain.** Finish the 7.

**285.2.5 — #43 — the Faro purchase engine posts 5 different shapes for one event.**
The canonical shape is confirmed by the posting audit. Collapse all five to it at the writer. This is the
defect that produced #42's 25 duplicate funding JEs and #45's 41 missing Undeposited debits — both now folded
into 282.4. Fixing the writer is what stops it recurring; the reversal only cleans the past.
PROOF: the writer's file and line, and a live-posted advance showing the one canonical shape.

**285.2.6 — #50 — unique constraint on (advance, posting type).** Canonical guard #4. A funding may not post
twice. Real DB constraint, not a script. This is how $79,857.74 got in. PROOF: the constraint, and a rejected
duplicate attempt.

**285.2.7 — #51 — guard: every factoring JE matches one of the 4 canonical shapes.** PROOF: guard green live.

**285.2.8 — 280.10 — factoring → invoice FOREIGN KEY.** Canonical guard #8, a real FK, no advance without a
posted invoice. PROOF: the FK in `pg_constraint`, and a rejected insert.

**285.2.9 — #46 — 3 Faro banking accounts render nothing: Factoring USMCA, Escrow, 1235.**
1235 is CONFIRMED REAL at $135.41 and is not deleted. Make all three render. PROOF: the three live screens
with their balances, each tied to its query.

**285.2.10 — #13, #14, #15, #16 — UNPARKED, work them in this order.**
#13 check-number reconciliation, next is 1006. #14 bill payment engine to QBO parity. #15 ROUND 140.3.
#16 the Loves statement two-surface split with materiality. Each one full — engine, posting, UI, guard.

**285.2.11 — 282.5 — THE WIPE. Only after 285.2.2's guard reads 0.**
Owner-authorised. Archive first and the archive goes in git, not /tmp. Children before parents. A reversal is
deleted with its original. Void reasons preserved verbatim in the archive.
PROOF: the orphan check — every remaining posting resolves to a record that exists — plus trial balance
before and after, identical.

---

# PART D — CC-3 · TELEMATICS / DISPATCH LANE · full sequence, in order

**285.3.1 — 284.3 — `engine_state` is wrong AT INGEST. This is the root cause; the UI was the symptom.**
Measured live: 231 fresh `telematics.vehicle_locations` pings carry `engine_state='unknown'`, **171 of them
moving at up to 76.1 mph**, against only 166 reporting `'on'`. Every `idle`/`off` ping had `speed_mph = 0.0`.
a. Prove from the RAW provider payload which of three it is: the provider actually sent 'unknown' / it is our
   default for an absent field / it is a failed mapping of a value we do not recognize. Paste one raw payload
   for a moving-but-unknown ping beside the row we stored. No guessing between the three.
b. Fix at ingest. Map what the provider sends. If the field is absent, store **NULL** — 'unknown' and 'the
   provider did not say' are not the same thing and one of them is a lie in a column.
c. Normalize at ingest, never at read. No other surface should have to distrust the column.
PROOF: `engine_state` grouped counts, last 24h, before and after.
DO NOT touch `TruckLineBoard.tsx` — Lead owns it this round and the gate is already committed.

**285.3.2 — 280.12 — DREAMLINE, $115,963.75 of real payments never posted, 24 rows.**
Categorize, never a JE. 2510 lands near $25,233.48. PROOF: 2510 before/after, the 24 rows.

**285.3.3 — 280.13 — RELAY wallet reads NEGATIVE −$32,324.02. 78 of 84 rows uncategorized.**
Categorize the top-ups. A prepaid wallet is a real asset and cannot be negative — that is canonical guard #12.
PROOF: the wallet balance ≥ 0 live, the 84 rows categorized, the guard green.

**285.3.4 — 280.14 — 13625/13626 to dispatched, and the 11-load batch with ZERO audit rows.**
The co-timestamps are EXPLAINED — `now()` is transaction-constant and `close-funded-loads.ts` (AUTH-051) is
legitimate; you were right and my "rogue batch UPDATE" is retracted. The real defect stands: 11 status changes
carry no audit event. That is canonical guard #15. Fix the writer so a status change cannot happen without its
audit row, then backfill the 11 with an honest reconstruction marked as such.
PROOF: the writer, the guard, the 11 audit rows.

**285.3.5 — 280.15 — 13581/13582 swapped between sources, Faro 059 used twice, 13578 short $560.00.**
Resolve by Faro PO — the PO is the join, never Faro's Inv #. If our number is right, **DISPUTE it with Faro**
and record the dispute. PROOF: the three resolutions with the source document for each.

**285.3.6 — 280.16 — W/O or PO REQUIRED at load creation.** Not optional, not a warning. The whole Faro join
depends on `customer_po_number` existing. PROOF: the constraint, and a rejected creation attempt.

**285.3.7 — #19 — Samsara odometer past 2026-08-26. PARTIAL, 40 loads linked.** Finish it. Remember the three
mileage numbers are distinct: PRACTICAL is billed, SHORT is what the driver is paid, DRIVEN is what burns
diesel. Never collapse them. PROOF: the odometer coverage count through today.

**285.3.8 — #20 — real idle duration per event window. 5 measured, 42 not re-audited.** Finish the 42.

**285.3.9 — #21 — ROUND 235 truck line, the split-commit answer.** Answer it and close it.

**285.3.10 — #17 — push ROUND 234.** The baseline that blocked you is being re-based in 285.2.2 and
Codex 280.19. If it is still red after those land, name the guard and the exact assertion.

---

# PART E — CURSOR · LOADBOARDS AND DOCUMENTS · full sequence, in order
# The loadboard block is 285.4.1 through 285.4.8 and it is ALL of it. Finish the whole board.

**285.4.1 — 283.3 — the static guard. Do this FIRST; it protects everything below.**
No `listAllLoads` and no `GET /loads` call site may omit `board_scope`. **Fail the build, not a lint warning.**
Your fail-closed `else` in 8915dd1d81 is the right fix; this is what makes it permanent instead of something
someone re-breaks in three weeks. PROOF: the guard failing on a deliberately unscoped call site, then green.

**285.4.2 — #25 — the canonical active-load set across ALL boards.**
Every board that shows "what is running now" resolves through ONE source. Dispatch, Kanban, List, Trip
Pairing, Round Trips, Truck Line, Load Costs. Other views may render MORE columns, but the SET must come from
the same place. **Prove by QUERY, not by screenshot** — the same count from the same predicate on every board.

**285.4.3 — 283.5 — re-check UI items #26–#29 against the corrected filter, THEN fix what survives.**
They were diagnosed while the boards disagreed about which loads existed. Report which were symptoms and
which are real before building.
- **#26** — return-trip double rows, unit ordering after 176, column order.
- **#27** — the transit line: green, animated, centred, draggable.
- **#28** — row height, per-load dropdown, universal filter.
- **#29** — responsive width, global sweep.

**285.4.4 — LOAD COSTS must render the load data and the wizard amounts. OWNER ITEM, explicit.**
`LoadCostsBoardPage` and `DispatchLoadCostsPanel`: every load in the canonical active set renders, with the
amounts captured in the load wizard — line haul, fuel surcharge, accessorials, detention, layover — each one
traced to where the wizard stored it. An empty cell is a question, not an answer: check the entity, the
filter, the RLS bypass, the join and the spelling before reporting anything missing.
PROOF: the live screen beside the query that produced it, row count matching 285.4.2's canonical count.

**285.4.5 — #61 — void-predicate leaf mappings. Blocks CC-3's TruckLine. Do it before 285.4.6.**

**285.4.6 — #53 — the Plaid pending→posted merge does not carry matches across.**
Fix the merge path. A match the user already made must survive the transition. PROOF: a pending row matched,
merged to posted, match intact.

**285.4.7 — #63 — do NOT merge `cc-3/round157d` as-is.** 57 files, −3,579 lines. It needs a real rebase.
Rebase it properly or close it and re-cut. Never merge a deletion of that size to clear a queue.

**285.4.8 — #23 — close the 7 dependabot PRs and the 7 preview services.**

**285.4.9 — DOCUMENTS, finish the WIP you already pushed.**
#31 the 3 locked v10 documents (continue `devin-a/r229`). #58 company settlement auto-prints the downtime
ledger, real fuel cost and the 3 margins. #59 APPROVED BY + METHOD under every detention and layover line.
#32 the draft-expense unposted flag on settlements. #33 the 26 flagged idle events needing human review.

**285.4.10 — #60 — invoice auto-generates on BOL, then auto into the Faro queue.** NOT STARTED. Full chain:
BOL received → invoice generated → Faro queue. A proforma shows in cash flow and NOT in the books — respect
that boundary in the generated document.

---

# PART F — CODEX · GUARDS AND AUDIT · full sequence, in order

**285.5.1 — commit the recovery archive at its real repo path and PUSH it.**
9 retirements are currently reversible only by a tree in `/tmp`. A reboot makes them permanent. Use a clean
checkout of `main`, PR touching only `docs/audit/archive/` and `scripts/` — do not overwrite a dirty worktree.
**Nothing is retired until the archive that reverses it is pushed.**

**285.5.2 — 282.6.a — build the numbered 1–17 from `00-ROUND-282-CANONICAL-GUARDS-AND-VOID-CONSTRAINT.md`,
EXACTLY as written there.** Register every one in `LAW.json`, wire them as the required CI set.
Automatch(7), JE balance(1), wallet non-negative(12), audit-on-status-change(15) are IN. "bank signed-amount",
"settlement tie", "period-close", "linkage" from my chat message are WITHDRAWN — do not build them.
Note #2's population is now **164 lines / 41 records**, not 1,065.

**285.5.3 — the 15 LAW.json-registered failures. PRIORITY inside 282.6.**
A registered guard that fails is a red baseline, not noise. For each of the 15: what it asserts, and whether
the assertion or the code is wrong. Fix whichever is wrong. No guard gets retired to make a number go green.

**285.5.4 — 282.6.b — classify the 5,427.** Covered by one of the 17 → delete. Asserts something the 17 miss →
the 17 are incomplete, bring the assertion up and tell Lead. Asserts nothing → delete.
Batches by area, each its own PR, the 17 green throughout. **Anything unclassifiable STAYS — report the count.**
Reachability is established by the runner trace, never by grep for a filename.

**285.5.5 — 282.6.c — re-measure the 399 failures against the 17.** That number is the real red count.

**285.5.6 — #44 — Fuel MTD shows $88,759.68, the real figure is $11,749.90. $77,009.78 overstated.**
CONFIRMED by two seats. Root-cause the aggregate, not the display. Fuel's void population is now fully
reversed, so if the overstatement persists after that it is a live query defect, not void contamination.
PROOF: the query, before/after, tied to the fuel documents.

**285.5.7 — #47 — 430 bank rows hidden from the match queue by 641 voided matches.** VERIFIED as real
unmatched work. Unhide them. They feed CC-1's 285.1.6. PROOF: the queue count before/after.

**285.5.8 — #54 — Phase 1 void-contamination audit, 18 tables, every module. IN PROGRESS, finish it.**
Re-run it against the corrected state — three of four tables are now clean, so the old findings are stale.

**285.5.9 — #56 — 9 duplicate bank rows approved, the 10th held.** Re-point match `2d1f3f73` first, then act.

**285.5.10 — #57 — the test/sample purge. 59 flagged, then the owner's name-matched list.**
Canonical guard #16. **Every USMCA record is REAL unless it carries `is_sample_data = true`.** Never write a
test, sample or demo record into USMCA — including to prove a guard works.

**285.5.11 — #35, #36, #37, #40 — LINKAGE. A block with no linkage declaration is not done.**
#35 `docs.files.dispatch_load_id` NULL on all 11 rate confirmations. #36 424 expense lines with no load,
$23,400.01 — every load margin is wrong until this is fixed. #37 22 driver bills unlinked.
#40 explain why all 48 company margins differ.

**285.5.12 — #34 — push the 7 held commits** once 285.5.3 clears the baseline.

---

# PART G — LEAD · mine, this round
Done: `TruckLineBoard.tsx` gate — `engine_state` is a VETO, never a REQUIREMENT. Frontend typecheck of the
5 changed files exit 0, 0 errors. Live void state re-measured and PART A written from it.
Mine next: revenue completeness per load; settlements tied to the signed PDFs; the 2150 = $315,356.28 and
6300 ≈ $220 targets re-measured after 285.2.1 lands.

# OWNER DECISION STILL OPEN — 280.4.OWNER
The mis-filed loads imported into USMCA on 09-23/24 with a null PO: re-point them to Transportation, or
exclude them. My "61 loads" signature was WRONG — it returns 123 including 5 that are closed and PAID. No
query I have found separates the mis-filed Transportation loads from real USMCA loads. **Nobody touches them
until the owner rules.** TRANSPORTATION and TRUCKING stay frozen — do not read, write or report on them.
