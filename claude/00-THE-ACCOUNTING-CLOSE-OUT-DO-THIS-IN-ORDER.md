# 00-THE-ACCOUNTING-CLOSE-OUT — DO THIS IN ORDER, NOTHING SKIPS
# Claude Lead · 09-30-2026 · Owner: *"I WANT TO CLOSE ALL THESE ACCOUNTING ISSUES SO WE CAN CONTINUE
# BUILDING THE REST OF THE APP."* This file governs until every phase is DONE-VERIFIED.

## WHY EVERYTHING KEEPS BREAKING — the one sentence
**Every accounting defect we found was written on top of something that was not yet correct.** Statuses were
batch-written, then invoices were built on them. The factoring engine had five posting shapes, then 28 duplicate
copies landed on top. A match was allowed to post, then 842 expenses double-posted. Fixing these out of order
re-contaminates the books. **So the order below is not a preference. It is the fix.**

## THE THREE RULES FOR THIS WHOLE EFFORT
1. **ONE NUMBER, ONE SOURCE.** Every figure names the table or document it came from. If two sources disagree,
   stop and resolve which is authoritative **before** writing anything. Never average, never pick the convenient one.
2. **NOTHING POSTS ON A GUESS.** A document posts only when the event actually happened and a real source says so.
   No batch write ever sets a status or creates a posting again.
3. **PROVE EACH PHASE BEFORE THE NEXT STARTS.** Trial Balance pasted before and after. A phase that cannot show
   its proof is not done, and the next phase does not begin.

---

# PHASE 1 — STATUS TRUTH (nothing else starts until this is DONE-VERIFIED)
**Owner-named source: the company and driver settlements already parsed.** Those settlements are authoritative
for which loads are finished. The owner's live board is authoritative for what is currently moving.

- Loads **13624–13639 are DISPATCHED** — owner-stated, drivers hold the load confirmations and are assigned.
  **13625 and 13626 are wrong in our book** (`completed_docs_received`) and get corrected.
- **Proven batch writes, all entities, live:** 46 loads set `closed` at `2026-09-26T02:44:10.648Z`; 27 at
  `2026-09-25T18:44:47.797Z`; 11 mixed at `2026-09-28T14:44:36.206Z` (this is where 13625/13626 came from);
  10 at `2026-09-26T00:29:30.367Z`; 6 at `2026-09-28T05:51:06.796Z`. **Identical timestamps to the millisecond.**
- Reconcile every one of those loads against the settlements. Where the settlement says finished, the status
  stands. Where it does not, the status is wrong and is corrected **one load at a time, with an audit row naming
  its source document** — never another batch.
- **Find the script that wrote those batches. Report what it is and whether it can still run.** If it can, it is
  disabled. A load status comes from a real event, never from a batch.

**PROOF:** every load's status with the source document that justifies it. The owner's 16 reading DISPATCHED.

# PHASE 2 — ENGINES CORRECT BEFORE ANY MORE MONEY MOVES
No remediation writes while an engine can still produce the defect. Fixing data under a broken engine is wasted work.
- **CC-2** — `00-CANONICAL-FACTORING-POSTING-LOCKED.md` in full: one code path, Undeposited Funds always present,
  the 41 re-posted, the 6 reserve entries corrected, unique constraint on (advance, posting type), both guards,
  the three Faro accounts rendering.
- **CC-1** — the `expense` **842** double-post: the path that posts on **match** is killed. Recorded posts; matched
  posts nothing. Root cause first.
- **Cursor** — the void engine: a registered case in `executeVoidCancel` for every voidable entity; flag, status
  and reversal written in one transaction or not at all; the DB constraint per table.
- **Codex** — the shared void-exclusion and the lane-scoped gating, so live totals exclude voids while history and
  audit screens still show them.

**PROOF:** each engine's guard passing, deployed, deploy id pasted.

# PHASE 3 — REMOVE THE PHANTOM MONEY
Only now, with the engines correct.
- **28 factoring duplicate copies** — survivor determined from the owner's 09-25-26 Faro files; the rest voided,
  then deleted, archive-first. Target: the overstatement falls by **$79,857.74** and nothing else moves.
- **842 expense double-posts** — reversed NetSuite-style once the code path is dead.
- **Codex's remaining candidates** — only what survives the reversal / recurring / multi-stage filter.
  `factoring_default_interest` at 194 entries for 23 documents is almost certainly correct daily accrual. **Nothing
  is reversed that has not survived the filter.**
- **DO NOT** reverse the 3,622 `fuel_event` postings ($1,506,349.40) on the reading that fuel must never post.
  The guard asserts **posts-exactly-once**. Read it and quote it first. The defect is the 48 excess pairs and the
  **$7,259.92** gap on 5000 Fuel & Diesel.

**PROOF:** Trial Balance, Balance Sheet, 1090, 1230, 2150 and the fee accounts, before and after. Only the intended
amounts move.

# PHASE 4 — COMPLETE WHAT IS MISSING
- The **7 remaining sweep rows** of the $39,108, once their duplicate survivors are set. (The 8 clean rows are
  **DONE** — AUTH-134, 1090 fell exactly $17,450.00 and 1000 rose exactly $17,450.00.)
- The remaining held drafts (AUTH-131 reports 255/257, 2 genuinely held — name those 2 and why).
- **Linkage:** `docs.files.dispatch_load_id` NULL on all 11 rate confirmations · 424 expense lines with no load,
  $23,400.01 · 22 driver bills unlinked · 7 fuel expenses missing linkage.
- **OWNER'S RULE, ENFORCED:** *every load that has been factored must have been invoiced.* Build it as a guard.
  `accounting.factoring_advances` today carries only `faro_invoice_number` and no foreign key to
  `accounting.invoices` — **that linkage does not exist and must be created.** An advance with no invoice behind
  it cannot be allowed to exist.

# PHASE 5 — RECONCILE, THEN CLOSE
- Our book = Faro = AlwaysTrack = the bank. This is what `verify-usmca-book-equals-faro-and-alwaystrack.mjs`
  enforces and what is blocking CC-3 right now; the guard is correct to block, the data is what is wrong.
- Every closed load has its documents. Every invoice posted once. Every expense posted once. Every advance tied to
  an invoice. Nothing unposted, nothing double-posted, nothing posted on a guess.
- **Then the period closes**, and the app moves on to the rest of the build.

---

## WHAT "CORRECTLY THIS TIME" MEANS FOR EVERY SEAT, LEAD INCLUDED
- Verify against production before acting on anything anyone hands you — **including Lead.** Every seat caught a
  Lead error in the last session and every one was right to.
- Never report a number you did not measure. Say whose measurement it is when it is not yours.
- Never report done without pasted live proof.
- If a phase's proof does not come out clean, **stop and say so.** Do not proceed to the next phase. A silent
  partial is how all of this started.
