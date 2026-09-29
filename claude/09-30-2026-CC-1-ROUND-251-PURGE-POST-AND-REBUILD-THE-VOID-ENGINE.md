# ROUND 251 — CC-1 — YOU ARE NOT WAITING. START AT ITEM 1 AND DO NOT STOP.
## ANTI-DRIFT CONTRACT — READ BEFORE THE FIRST LINE OF CODE
1. You build EVERY item on your list COMPLETELY: schema, migration, backend service, route DEFINED
   and MOUNTED and CONSUMED by a real frontend surface, GL postings, linkage both ways to every hub,
   catalogs, guards, backfill, and print where it applies. **The Check Creator was reported DONE
   while sitting unmounted and dead for weeks. That must never happen again.**
2. NO HANDING OFF. If something blocks you, you MEASURE it, FIX it, and report what you fixed. The
   only thing you escalate is a write the owner has not authorized.
3. NO PATCHING. Root cause only. No report-only guards, no skips, no `--no-verify`, no exception
   lists, no "same pattern as X" without evidence.
4. NO DRIFT. Do not invent tables, concepts or names not in this document. Do not rename anything.
   Do not "improve" the design. If you believe something here is wrong, say so in ONE paragraph with
   the measurement that proves it, then do what this document says.
5. NEVER write test, sample or demo rows into USMCA — including for proof. Two seats broke this and
   are still reconciling it.
6. USMCA ONLY: 5c854333-6ea5-4faa-af31-67cb272fef80. TRANSPORTATION and TRUCKING stay frozen.
   Reads require BOTH lines: `SET LOCAL ROLE neondb_owner;` then `SET LOCAL app.bypass_rls = 'lucia';`
7. Blank is blank. Unknown prints `—`. Never 0 for unknown, never a substituted value.
8. Every guard is REQUIRES_LIVE_DB. A guard that cannot connect is a FAIL, never a pass.
9. Save your completion report to the repo at `claude/<date>-<SEAT>-<ROUND>-REPORT.md` so nothing is
   lost. Cite live SQL output for every claim. Never report DONE without pasted proof.
10. You have API keys available in the Desktop files. No seat may claim it lacks a key.

## ITEM 1 — BILL-PAYMENT COVERAGE FALLBACK. THIS RELEASES TWO SEATS. DO IT FIRST.
`verify-no-document-without-a-ledger` flags 130 `accounting.bill_payments` as unposted. They are NOT
unposted. They are DRIVER BILLS: when a driver settlement closes, the driver pay becomes a bill, and
paying it is a bill payment. That cash ALREADY posted once, through the settlement's own payrun-close
journal entry, whose id is written into each bill memo as
`adopted_from_payrun_gl_run:setbased:je:<journal_entry_id>`. Posting a bill-payment JE on top would
book the same cash TWICE. CC-2 independently proved this and refused to force-post. Both correct.
FIX: add the coverage fallback, mirroring `BILL_CLOSED_SETTLEMENT()` which already exists in the same
file for `driver_finance.driver_bills` for exactly this reason. Match on the JE id parsed from the
memo — never a LIKE against free text. A bill payment with NO adoption memo AND no bill_payment
posting is still a real violation and must still FAIL. Report the remaining violation count live.
BLOCKED SEATS RELEASED BY THIS: CC-2 (P0 `58e5356b11`) and CC-3 (ROUND 234). Tell both when it lands.

## ITEM 2 — REBUILD THE VOID ENGINE. OWNER ORDER: BEST IN CLASS, INSPECTED, ANALYSED, RECREATED.
Owner: *"I do not want issues in the future... so no transactions stay lost, stuck or whatever."*
Do not patch the existing detector. INSPECT it, ANALYSE what it did, and REBUILD it.
DUPLICATE IDENTITY (hard rule):
  `(operating_company_id, vendor_uuid, vendor_document_number, transaction_date, total_amount_cents)`
  and the engine ALSO records and reports `unit_id`, `load_id`, `driver_id` and `payment_type` on
  every decision. Owner ruling: **it checks date, vendor, unit, load and amount — many variables,
  never two.**
  Where `vendor_document_number` IS NULL the rows are NOT comparable and MUST NOT be auto-voided —
  they go to `accounting.expenses_review_queue` for a human. NEVER key on (load, amount). That is
  what AUTH-089 did and it deleted real money.
EVERY VOID MUST CARRY: who, when, why (from a catalog, not free text), the exact row it supersedes,
and the reversal JE. A void with no named supersede target is itself a defect.
NO TRANSACTION MAY BE LOST OR STUCK. Build `verify-no-transaction-is-orphaned.mjs`: every expense,
bill, bill_payment, invoice and fuel transaction is in exactly ONE terminal state — live-posted,
live-draft, reinstated, in-review-queue, or purged-with-archive. Anything in none of those is a
FAILURE. Ratchet to 0.

## ITEM 3 — AUTH-089 REINSTATEMENT (before any delete)
Reinstate every voided expense carrying a `vendor_document_number` where NO live row exists with that
same document on that load — currently 10, $132.50. Start `13549-19`, doc 6232741, $15.25. Use
`reinstated_at` / `reinstate_reason` / `reinstated_by_user_id` / `reinstated_from_void_je_id` /
`status_before_void`. Reason: "ROUND 236 — voided in error by AUTH-089, which keyed duplicates on
(load, amount) instead of vendor document." The 77 rows with no document number go to the review
queue — never auto-reinstated, never purged.

## ITEM 4 — POST THE DRAFTS. ANSWER THE OWNER'S QUESTION FIRST.
The owner asked: **"what do you mean they never approved, WHERE?"** ANSWER IT WITH EVIDENCE, do not
guess. Name the exact path that moves an expense out of `status='draft'` — a UI approve action, a
batch job, or the bank-match screen — and say which one failed to run and why. If no approval path
exists in the app at all, that is the finding and you build it.
WHAT THEY ARE (measured): 257 drafts, $14,315.36. 177 rows Fuel-DEF $5,811.04 · 18 Driver
Reimbursement-Scale $234.50 · 15 OTR-Scale $208.75 · 11 Reefer-Trailer Washout $527.13 · 9 Warehouse
Lumper $1,778.10 · 7 Fuel-Reefer-Diesel $740.18 · 3 Road Service-Trailer Tire $1,805.55 · 3 Road
Service-Truck Repair $679.79 · 2 Road Service-Truck Tire $1,616.06 · plus washouts, tolls, parking.
THEN POST TODAY'S LIVE RE-VERIFIED CLEAN SET in ONE batch: one `posting_batch_id`, one balanced JE
each, account from the line's `item_id`, correct class and date, linked both ways, an
`idempotency_key` per row so a re-run posts nothing twice. `is_sample_data` stays false.

## ITEM 5 — HARD DELETE. OWNER ORDER, OVERRULING THE FREEZE AND VOID-NOT-DELETE.
Owner: *"permanently delete all voided transactions without disrupting anything so they do not appear
in the app."* And: *"hard delete all those loads and invoices that are not relevant to us."*
STEP A — ARCHIVE FIRST, outside the app: `archive.purged_2026_09_30_*` for expenses, invoices,
journal_entries, journal_entry_postings, loads. Full rows, every column, plus `purged_at`/`purged_by`.
Counts must match source before anything is deleted.
STEP B — SAFE TO DELETE, PROVEN: I verified all 790 void pairs line by line — original debit equals
reversal credit and vice versa on **790 of 790**, $0.00 not offsetting. Deleting BOTH sides together
moves no balance on any statement.
STEP C — DELETE, in dependency order, one transaction per batch:
  journal_entry_postings → journal_entries → voided expenses → voided invoices.
  EXEMPT: anything reinstated in Item 3, and the 77 review-queue rows.
STEP D — THE 5 TRANSPORTATION LOADS. Loads **13503, 13504, 13509, 13533, 13539** are in Faro under
**IH 35 TRANSPORTATION** (`FARO-IH-35-Transportation-export-16/17/18.csv`, `faro_canonical_purchases.csv`)
yet carry USMCA invoices flagged not_factored. They are not ours. Verify each one against the Faro
file, then hard-delete the USMCA invoice and its load with full archive and full linkage cleanup —
stops, expenses, settlement links, docs.files links. Nothing orphaned.
STEP E — PROVE NOTHING MOVED. Trial balance debits and credits · P&L by account · balance sheet
totals · A/R and A/P aging · bank balances per `banking.*`. BEFORE and AFTER, **identical**. One cent
of movement = ROLL BACK and report.

## ITEM 6 — THE OTHER 15 INVOICES NEVER SENT TO FARO
13498, 13513, 13517, 13525, 13527, 13540, 13541, 13555, 13572, 13578, 13582, 13595, 13609, 13616,
13621 appear in NO Faro file. Delivered, invoiced, never submitted. Find why submission never fired
and WIRE IT PERMANENTLY so it cannot silently skip again. Load **13525** also carries a $0.00 invoice
marked sent — find out what it actually is.

## ITEM 7 — KILL THE WALL-CLOCK GATE
Replace the 7-day rolling window with a fixed ratcheted population count. NEW STANDING LAW: no
blocking guard derives its verdict from wall-clock time. Guard:
`verify-no-money-gate-depends-on-wall-clock-time.mjs`, scanning for `now()`/`CURRENT_DATE`/`interval`
in any pass/fail condition, baseline ratcheted down only.

## PROOF REQUIRED
Item 1 live violation count · the named approval path · archive counts matching source · reinstated
rows with JE ids · posted count with its batch id · remaining void count = 0 · the 5 Transportation
loads gone with archive proof · BEFORE/AFTER balances identical · 5787 non-diesel expense total =
**140.20** · every guard passing.
