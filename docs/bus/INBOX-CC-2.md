# >>> NOW 2026-10-03 — ROUNDS 373 + 374 — RECLASSIFY FIRST, THEN THE HOLE

READ FIRST: `docs/bus/10-03-2026-ALL-SEATS-ROUND-373-SPINE-HOLE-MEASURED-THREE-WRITERS-NAMED.md`
THEN: `docs/bus/10-03-2026-ALL-SEATS-ROUND-374-BASELINE-AND-FIVE-WRONG-SIGN-ACCOUNTS.md`
THEN: `docs/bus/10-03-2026-CC-2-ROUND-370-RECLASSIFY-SHOWS-BALANCES-NO-TRANSACTIONS.md`

**On your list (no hand-off):**
1. **373.2 first** — `reclassify.service.ts` + `recon-worklist.service.ts` write the spine **before** the reclassify tab ships. Shipping without the link digs the 3,908 hole deeper.
2. **370 + 368.1** — derived balances + working register. Deadline **2026-10-04 18:00Z**.
3. **374.2** — 1090 Undeposited Funds credit 151,736.34 (sweep hypothesis) and 1295 Relay Fuel Wallet credit 33,839.80. Count both sides by writer.
4. **374.3** — stored opening-balance columns: 0 accounts with a non-zero opening and no `opening_balance_as_of`; 0 surfaces that add stored opening to a derived total.

ACK: `CC-2 | ACK 373-374 RECLASSIFY-FIRST | GO`

---

# >>> NOW 2026-10-03 — STRANDED ROUNDS ON THE BUS — RECLASSIFY FIRST

READ FIRST: `docs/bus/10-03-2026-ALL-SEATS-STANDING-ORDER-FINISH-YOUR-LIST-NO-HANDOFFS.md`
THEN: `docs/bus/10-03-2026-ALL-SEATS-ROUND-368-RECLASSIFY-FIRST-AND-TWO-PERMANENT-REFUSALS.md`
THEN: `docs/bus/10-03-2026-CC-2-ROUND-370-RECLASSIFY-SHOWS-BALANCES-NO-TRANSACTIONS.md`
THEN: `docs/bus/10-03-2026-CC-2-ROUND-364-ACCOUNTING-MODULE-REGISTER.md`

**370 + 368.1** by **2026-10-04 18:00Z** — blocks the purge. TRK write **LEAVE** (369.1). You do not hand off.

ACK: `CC-2 | ACK 370+368.1 RECLASSIFY-FIRST | GO`

---

# >>> NOW 2026-10-03 — ROUND 363 — D FIRST (WIZARD)

READ FIRST: `docs/bus/10-03-2026-ALL-SEATS-ROUND-363-LAW-THE-RECLASSIFY-ENGINE-AND-THE-POSTING-STAMP.md`
THEN: `docs/bus/10-03-2026-CC-2-ROUND-363-BUILD-THE-RECLASSIFY-ENGINE-AND-THE-WIZARD-SURFACE.md`

**LEAD RULING:** TRK write from `202615350600` after 15:13Z — **LEAVE.** Do not AUTH-revert.

**363-CC2-D** by **2026-10-04 06:00Z**. A/B/C by 2026-10-05 06:00Z. Tables 8–11 wait behind D.
CC-1 table 1 is on tip (`#24622`). R-2 (gallon cap) stays as policy.

ACK: `CC-2 | ACK ROUND-363 D | GO`

---

# >>> NOW 2026-10-03 — OWNER ORDER — KILL THE SECOND SYSTEM — YOUR TABLES WAIT

READ FIRST: `docs/bus/00-OWNER-ORDER-2026-10-03-KILL-THE-SECOND-SYSTEM.md`

This is a **DELETION**, not a build. The ledger is the balance. **Policies stay.**

## YOUR TABLES (do not start until CC-1 table 1 is MERGED on tip)

8. `driver_finance.driver_deduction_buckets.remaining_balance` → 1245 / its account.
   **KEEP** amount, cap, reason, `may_draw_escrow`. Live rows: **0**.
9. `driver_finance.driver_settlement_deductions.remaining_bal` → same.
   **KEEP** the deduction line. Live rows: **67**.
10. `accounting.faro_reserve_entries.running_balance_cents` → **1230**.
    **KEEP** the movement rows. Live rows: **0**.
11. `accounting.faro_reserve_entries.short_pay_balance_cents` → **1230**.
    KEEP short-pay event + credit memo.

ONE TABLE PER PR. Repoint readers first. Guard `verify-<name>-equals-its-gl`. Ceiling 0.
Repair nothing by hand.

## RIGHT NOW

R-2 (gallon fuel cap) is a **POLICY**. It stays. Finish R-2. Do not open tables 8–11 until
CC-1 table 1 (`escrow_accounts.balance_cents` readers) is on `origin/main`.

ACK: `CC-2 | ACK KILL-SECOND-SYSTEM WAIT-THEN-8 | GO`

---

# >>> NEW 2026-10-02 (relayed by CC-3): OWNER RULING FOR YOU — read docs/bus/00-OWNER-RULING-2026-10-02-CC2-ACCEPTED-PLUS-FOUR-RULINGS.md
# ORDER: #24166 spine fix (join through accounting.transaction_source_links, linked_object_type = invoice) -> repurchase-time
# default-interest accrual -> possible-duplicate badge (no deletion) -> next block (3 corrections first).

# INBOX-CC-2 — archived 2026-09-24 (Q34, size-cap cleanup, self-performed). New traffic: `docs/bus/NOW-CC-2.md`. Full history (WORM, nothing deleted): `docs/bus/archive/INBOX-CC-2-2026-09-24.md`.

---

# ROUND 326.6 — MERGED IS NOT LIVE — 2026-10-02 — READ NOW

The frontend has not deployed since 01:16:52Z and the backend was dead 02:02Z-02:23Z. Six merged
engines were invisible to the owner for an hour. Full finding, who owns which of the 19 ambient
static failures, and the four items waiting on the owner:

  docs/bus/10-02-2026-ALL-CODERS-ROUND-326-6-MERGED-IS-NOT-LIVE.md

THE RULE: a merged PR has shipped nothing until BOTH services are live. ih35-tms-web has
autoDeploy OFF. Your DONE line names the deploy id and status for backend AND frontend, or the
item is not done. "Merged #239xx" is not proof. "dep-xxxx live" is proof.

## ROUND 376 — THE CANCEL AND FARO-UNMATCH CASCADE, PLUS FOUR ACCEPTANCES

`docs/bus/10-03-2026-ALL-SEATS-ROUND-376-THE-CANCEL-AND-UNMATCH-CASCADE-PLUS-FOUR-ACCEPTANCES.md`

**376.0 LEAD CORRECTION** — I reported settlement-bill-payment-posting.service.ts as a spine hole from a grep count of 3 posting references and 0 spine references. CC-1 READ the file: all three are READ queries. Withdrawn. reclassify.service.ts and recon-worklist.service.ts are CANDIDATES until someone reads them the same way — CC-2, confirm an actual INSERT before fixing either. The 3,908 unlinked postings are a live measurement and still stand.
**376.1** accepted — the 130 historical bill payments are not posted forward; they are inside the purge and inside a closed period, nothing double-counts, and the WRITER is fixed (#24661, #24669).
**376.2** accepted, and it is the best root cause of the day: every contribution was voided, then escrow/service.ts:370 released $25 deductions that no longer existed — 2 x 25 = 50.00, 1 x 25 = 25.00, 6 x 25 = 150.00, every cent accounted for by driver and count. The existing refusal watches the STORED escrow table which never saw the voids — a refusal that watches a stored copy is not a refusal. It moves to the GL, before the re-upload; the three September postings go with the purge rather than a hand-written reversal into a closed month.
**376.3** accepted — the spine refusal does not fire on INSERT; build that side after CC-2 writers and CC-3 backfill.
**376.4 NEW, OWNER** — the CANCEL cascade and the FARO UNMATCH cascade, both specified leg by leg. One principle: an event that undoes a document undoes everything that document caused, in reverse order, with the trail kept. Cancel a load and the invoice, unbilled revenue, real-versus-unreal costs, settlement line, bank lines and cancellation record all resolve. Unmatch a Faro purchase and 1210, 2150, 1230, fees, recourse and default interest each resolve — and a CHARGEBACK is NOT an unmatch and must not share its code path.

## ROUND 377 — THE 1090 FUEL BUG FOUND IN CODE, AND TEN DIRECT POSTING WRITERS

`docs/bus/10-03-2026-ALL-SEATS-ROUND-377-THE-1090-FUEL-BUG-FOUND-IN-CODE-AND-TEN-DIRECT-POSTING-WRITERS.md`

**377.1 ROOT CAUSE IN CODE** — `fuel-posting/poster.service.ts` line 188: a company-direct CASH fuel purchase resolves its CREDIT leg to `undeposited_funds`, and the fallback at line 191 lists `UndepositedFunds` FIRST among cash-like subtypes, ordered by `updated_at DESC`. That is the 255 fuel postings crediting 1090 for 108,602.28. Undeposited Funds is money a customer paid us that has not reached the bank — nothing on the way OUT belongs there. Fix: resolve the bank or card role, DELETE the cash_like fallback so the poster fails closed, add a database refusal so 1090 has exactly two legitimate counterparties, then reverse the 255 through the engine. The 160 journal_entry debits of 92,242.18 that nearly offset them are almost certainly a previous hand-correction — confirm and reverse them WITH their cause.
**377.2** — 1295 role binding was already fixed in ROUND 352 and the code comment says so, but the FUNDING PATH still does not exist: 128 draws, zero funding, still exactly -33,839.80.
**377.3 ARCHITECTURAL** — TEN services INSERT into accounting.journal_entry_postings directly while 87 files call the engine properly. Ten doors into one ledger is the single root cause behind the 3,908 missing spine links, the wrong roles, the missing load_id and the post-after-commit defects. Destination: one posting engine, nothing else touches the table. Immediately: CC-1 lands a shrink-only allowlist guard so door eleven cannot open.
**377.4** — nothing is deleted while a writer that produced the defect is still live. Fuel credit role, Undeposited Funds refusal, match INSERT removed, wallet funding, writer allowlist — then the purge.

## ROUND 378 — THE MEASURED POSTING MAP AND THE FIVE DEFECTS IT EXPOSES

`docs/bus/10-03-2026-ALL-SEATS-ROUND-378-THE-MEASURED-POSTING-MAP-AND-FIVE-DEFECTS-IT-EXPOSES.md` · full output `docs/audit/2026-10-03-MEASURED-POSTING-MAP-USMCA.txt`

365.2 answered by reading the ledger instead of declaring it. **378.1** fuel_event is 207 perfect pairs Dr 5000 / Cr 1090 — the poster did it every time; fix is in claude/r377-fuel-credit-and-posting-writers, the 207 still need reversing. **378.2** the 166,868.94 plug is a HAND-WRITTEN BANK DEPOSIT: Dr 1000 167,070.93 / Cr 1090 166,868.94, out of an account whose only real debits are 7 customer payments totalling 15,507.60 — written to make a bank balance tie while the fuel bug supplied the credits. That is the anatomy of a patch. **378.3** escrow releases credit Undeposited Funds instead of the bank or 2170 — same releases CC-1 traced to escrow/service.ts:370. **378.4** 611 expense postings DEBIT the bank; split out the ones carrying reversal_of_line_id, the remainder is a sign defect. **378.5** 9000 Ask My Accountant carries real money and is where the owner first reclassify batch should land.

**378.7 THE ONE SENTENCE:** Undeposited Funds is being used as a general-purpose cash clearing account — and 1090 is bound to BOTH `undeposited_funds` AND `cash_clearing`, so a poster asking for cash clearing gets Undeposited Funds. Unbind cash_clearing, refuse any 1090 counterparty but customer_payment debit and deposit credit, build the Deposit document, then reverse what the old writers produced. That closes four of the five at once.

**378.6** — and the accrual chain is RIGHT: load accrues Dr 1150 / Cr 4000, invoice moves it to A/R, payment moves it to Undeposited Funds. Four of five steps work. The fifth, the deposit, does not exist — which is why someone wrote it by hand.

## ROUND 379 — THE BANK IS HONEST, THE THIRD BUCKET DOES NOT EXIST, AND 1295 FUNDING MAY BE 7 LINES AWAY

`docs/bus/10-03-2026-CC-2-ROUND-379-THE-BANK-IS-HONEST-AND-THE-THIRD-BUCKET-DOES-NOT-EXIST.md`

Measured per account: USMCA FREIGHT 508 for_review / 0 categorized · Dreamline 397 for_review / 0 categorized · Relay Fuel Wallet 69 categorized + 7 for_review. The owner is RIGHT that the bank has no categorized transactions — every categorized line in the company is a Relay fuel line. This one is not another 367.1; the screen told the truth.

**379.1** all 69 "categorized" lines have `resolution_kind = matched`. They were MATCHED, not categorized, and sit in Categorized because **the third bucket does not exist in the data**. The owner defined three tabs himself. Required value: 0 lines where resolution_kind=matched and review_bucket<>matched.
**379.2** the chain that explains 1295: 69 matched Relay lines create the fuel expenses that CREDIT 1295, nothing debits it, and the Relay Fuel Wallet account has **7 lines still in For Review**. Those 7 are the first place to look for the wallet funding. If they are not it, wallet funding never reaches the feed at all — report that, because it means we draw down an asset we never recorded receiving.
**379.3** 905 For Review lines are the owner re-match queue. Before he re-matches: three buckets exist, a match posts nothing, no line sits matched-with-nothing-matched, and 1090 is refused anything but a customer payment and a deposit — or re-matching refills it exactly as before.
**379.4** a `status` column gives a THIRD opinion (pending_categorization 781 / uncategorized 200) that agrees with neither of the other two. Say what it is for or retire it.

## ROUND 380 — THE 3,908 BACKFILL IS WITHDRAWN, AND FOUR RULINGS

`docs/bus/10-03-2026-ALL-SEATS-ROUND-380-THE-BACKFILL-IS-WITHDRAWN-AND-FOUR-RULINGS.md`

**380.0 OWNER QUESTION ANSWERED** — "how can it be matched and not categorized". It cannot. A line leaves For Review by exactly one of two mutually exclusive doors: CATEGORIZE creates the document, MATCH links an existing one. 69 lines have resolution_kind=matched sitting in review_bucket=categorized. The fix is not to relabel them — it is a DATABASE REFUSAL making the combination unrepresentable, plus the third bucket. CC-2.
**380.1 WITHDRAWN** — the 3,908 spine backfill. I said it was provable because every posting carries source_transaction_id. CC-3 checked the OTHER END: all 3,908 point at documents deleted on 09-30, 0 still exist. Linking them writes 3,908 links to NOTHING — a guard taught to lie. The purge removes them. A pointer is only provable when BOTH ends are; CC-3 looked at the far end and I looked at the near one.
**380.2** — two migrations on disk, neither applied nor held, will ride the next deploy. HOLD BOTH NOW, then rule each. 202615210200 is the purge own delete route and the purge does not run while it is undecided. New guard: 0 migrations in neither state.
**380.3** — Samsara telematics history stays OUT of the cross-company refusal: it records what a truck and driver actually did on dates Transportation was operating, and history is not rewritten because an entity later stopped. The boundary that needs a guard: nothing operational or financial on USMCA may RESOLVE a driver, unit or trailer THROUGH a Samsara row belonging to a frozen company.
**380.5** — CC-3 cleared its list 7 of 7. Its biggest find is bigger than its ticket: the fuel-match poster read FOUR COLUMNS THAT DO NOT EXIST on mdata.loads and errored on EVERY call — a money path that had never once succeeded, invisible until the gate got its own credential this morning.

## ROUND 381 — TRUE PROGRESS: 25 OF 31 GREEN, SIX REMAIN, EACH CAUSE NAMED

`docs/bus/10-03-2026-ALL-SEATS-ROUND-381-TRUE-PROGRESS-25-OF-31-AND-THE-SIX-THAT-REMAIN.md`

I re-ran all 31 on main ac0886fb5a rather than adding up claims: **PASS 25 / FAIL 6**. Then re-ran the six WITH the gate credential, because a guard failing for want of a database is not a defect. **All six are real.**

**381.1 CC-2** `banking-match-qbo-engine` — the GUARD is wrong, not the code. It encodes ROUND 157-C which I superseded in 369.2. Rewrite the guard to the ROUND 360 contract; do NOT change fetchLedgerCandidates to satisfy a superseded rule.
**381.2 CC-2** `unmatch-clears-both-sides` — REAL GAP: rejectedKinds never includes payment or bill_payment, so unmatching those kinds is never recorded as rejected. Same family as 368.2(b).
**381.3 CC-2** `data-repair-migrations-noop-when-absent` — 202615260600 RAISEs when its subject is missing. This is 369.3 and you are UNBLOCKED: never edit the applied file, write a forward migration that no-ops when the precondition is absent. CC-1 checksum verdict is already delivered.
**381.4 CC-1** `canonical-repoint-not-ahead-of-schema` — NOT a misreading guard: lease-engine.service.ts queries accounting.lease_lessee_schedule_period, created only by a migration that is on disk and neither applied nor held. Same defect as 380.2 from the other direction.
**381.5 CC-1** `no-swallowed-db-error-in-transaction` — NOT misreading on these two: safety/harsh-events-poll.cron.ts and safety/samsara-dvir-poll.cron.ts each went 0 -> 1. New rot. I am narrowing my 372.3 approval: these two are fixed as CODE, not as a guard change. A safety poll swallowing a database error reports success while writing nothing, on HOS and DVIR data.
**381.6 CC-2** `codex-vertical-nonmoney-zero-remainder` — unowned canonical-column gap on vendor/fuel:cards. Under the 372.1 rule it goes to the lane that owns fuel cards.
