# >>> NOW 2026-10-03 — ROUNDS 373 + 374 — STILL YOUR LIST

READ FIRST: `docs/bus/10-03-2026-ALL-SEATS-ROUND-373-SPINE-HOLE-MEASURED-THREE-WRITERS-NAMED.md`
THEN: `docs/bus/10-03-2026-ALL-SEATS-ROUND-367-EXPENSES-SCREEN-AND-DUPLICATE-PATH.md`

**On your list (no hand-off):**
1. **363-CC3-B** + **367.7** (167 split, DIRECT) first.
2. **373.2 / 363-CC3-A** — backfill the 3,908 (expense 3,860 + invoice 48) after the three writers land. Mechanical: every unlinked posting already carries `source_transaction_id`. Then the finish test. Do **not** arm the refusal first.
3. **368.2(b)** stays yours.

ACK: `CC-3 | ACK 373-374 FINISH-LIST | GO`

---

# >>> NOW 2026-10-03 — STRANDED ROUNDS ON THE BUS — FINISH YOUR LIST

READ FIRST: `docs/bus/10-03-2026-ALL-SEATS-STANDING-ORDER-FINISH-YOUR-LIST-NO-HANDOFFS.md`
THEN: `docs/bus/10-03-2026-ALL-SEATS-ROUND-367-EXPENSES-SCREEN-AND-DUPLICATE-PATH.md`
THEN: `docs/bus/10-03-2026-ALL-SEATS-ROUND-368-RECLASSIFY-FIRST-AND-TWO-PERMANENT-REFUSALS.md`

**363-CC3-B** and **367.7** (167 split, DIRECT) by **2026-10-04 06:00Z**. Then 368.2(b). You do not hand off.

ACK: `CC-3 | ACK STRANDED-ROUNDS FINISH-LIST | GO`

---

# >>> NOW 2026-10-03 — ROUND 363 — B FIRST (SEND-BACK)

READ FIRST: `docs/bus/10-03-2026-ALL-SEATS-ROUND-363-LAW-THE-RECLASSIFY-ENGINE-AND-THE-POSTING-STAMP.md`
THEN: `docs/bus/10-03-2026-CC-3-ROUND-363-LOAD-LINEAGE-THE-SEND-BACK-AND-THE-DERIVED-ARTIFACT-REGISTRY.md`

Claim `#24630` is on tip. **363-CC3-B** by **2026-10-04 06:00Z**. A after CC-1 lands the column (or you take both if A slips). Table 12 still last.

ACK: `CC-3 | ACK ROUND-363 B | GO`

---

# >>> NOW 2026-10-03 — OWNER ORDER — KILL THE SECOND SYSTEM — YOU ARE LAST

READ FIRST: `docs/bus/00-OWNER-ORDER-2026-10-03-KILL-THE-SECOND-SYSTEM.md`

This is a **DELETION**, not a build. The ledger is the balance. Policies stay.

## YOUR TABLE (LAST — do not start)

12. `accounting.vendor_balances.balance_cents` → A/P control.

**Already measured:** `accounting.vendor_balances` is `relkind=v` (a VIEW over `accounting.bills`
open/partial unpaid, not over A/P GL postings). Owner: "zero triggers maintain it, so confirm it
never drifted." Your job when called: paste live A/P control vs this view per vendor. If they
disagree, repoint the view to A/P postings. Do not add a writer. Do not start until CC-1 tables
1–7 and CC-2 tables 8–11 are on tip.

Continue your current ORDERS row until then.

ACK: `CC-3 | ACK KILL-SECOND-SYSTEM LAST | GO`

---

# INBOX-CC-3 — archived 2026-09-24 (Q34, size-cap cleanup). New traffic: `docs/bus/NOW-CC-3.md`. Full history (WORM, nothing deleted): `docs/bus/archive/INBOX-CC-3-2026-09-24.md`.

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
