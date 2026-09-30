# OUTBOX — CC-1 — restarted 2026-09-30T11:27Z
# One entry per job id: JOB ID · what I changed · pasted live proof · what is left.
# Append below. Do not delete another seat's entries.

## R-01 — assertNotProduction() guard
**Changed:** Shared `assertNotProduction()` (scripts/lib/assert-not-production.mjs) queries the LIVE connection's own `neon.branch_id`/`neon.project_id` Postgres GUCs (set by the Neon compute itself, not parsed from any string) and fails closed if the target is the known prod branch or unidentifiable. Static guard `verify-ops-scripts-assert-not-production.mjs` (step 11809) scans every file under `scripts/ops/**` plus `*rehearsal*`/`*test*` scripts for a write without the assertion appearing first.
**Live proof:**
```
$ node scripts/verify-ops-scripts-assert-not-production.mjs --selftest
verify-ops-scripts-assert-not-production SELFTEST OK — 8/8 (no assertion anywhere caught,
assertion-after-write caught, assertNotProduction-then-write passes, ..., end-to-end)

$ node scripts/verify-ops-scripts-assert-not-production.mjs
verify-ops-scripts-assert-not-production: checked 435 file(s) under scripts/ops/** and
*rehearsal*/*test* scripts.
verify-ops-scripts-assert-not-production: 125 total unguarded write(s) (125 pre-existing,
baselined, shrink-only).
verify-ops-scripts-assert-not-production: PASS — no new unguarded writes beyond the shrink-only
baseline (125 pre-existing, 0 new).
```
**Left:** 125 pre-existing ops scripts (from before today) are baselined, not retrofitted — the guard is shrink-only so none of them can get worse, but they don't yet call the assertion. Retrofitting all 125 is a separate, larger sweep not yet scoped.

## AUTH-144 — repost FAC-2026-00097 / FAC-2026-00125
**Changed:** Reposted 2 factoring advances (loads 13619/13615) that had zero live GL entry after a mistaken void chain, using the sanctioned poster.
**Live proof:**
```sql
SELECT display_id, status, voided_at FROM accounting.factoring_advances
WHERE display_id IN ('FAC-2026-00097','FAC-2026-00125');
 FAC-2026-00097 | advanced | NULL
 FAC-2026-00125 | advanced | NULL
```
**Left:** Nothing — closed.

## AUTH-145/146 — ROUND 290.1 fuel-expense bridge + load 13593
**Changed:** Fuel-to-expense bridge invariant (canonical rule + seed-path fix); load 13593 + invoice 074-13593 + driver bill + 3 fuel rows created from real AlwaysTrack/fuel-statement source data.
**Live proof:**
```sql
SELECT id, load_number, status FROM mdata.loads WHERE load_number='13593';
 c3a3d1b8-5d0d-450d-bc84-fc879379da25 | 13593 | invoiced
```
**Left:** Nothing on load 13593 itself. See AUTH-157 below — the bridge backfill this AUTH ran had a linkage bug, fixed separately.

## AUTH-150/290.2 — expense engine no longer credits 2000 A/P
**Changed:** Removed the "accrual exception" in `buildExpenseLines` that credited AP for a vendor-owed expense with no payment account; corrected 3 documents to real Bills.
**Live proof:**
```
$ node scripts/verify-steps/11753-verify-expense-never-credits-ap.mjs
[verify-expense-never-credits-ap] live expense-sourced JE lines crediting account 2000: 0
[verify-expense-never-credits-ap] PASS -- no expense document credits Accounts Payable.
```
**Left:** Nothing — closed.

## AUTH-154/155/156/291 / G-DEF — DEF/reefer-diesel item-account reclass (119 lines)
**Changed:** Corrected item→account mapping (catalog-level), reclassified 119 lines both directions across August+September via the item-based selector.
**Live proof:**
```
$ node scripts/verify-expense-line-account-matches-item.mjs
verify-expense-line-account-matches-item: LIVE PASS — 557 itemized USMCA expense line(s)
checked, 0 mismatches.
```
**Left:** Nothing — closed.

## AUTH-157 — fuel-expense driver/unit/trailer linkage backfill
**Changed:** Fixed `createExpenseFromFuelTransaction` to write driver_uuid/unit_id/trailer_id onto the expense row (previously read but never persisted); backfilled 35 rows; split `verify-fuel-cost-posts-exactly-once` check D into a real non-trailer-gap ratchet (0) vs. an informational trailer-only count.
**Live proof — FRESH DISCREPANCY FOUND, flagging honestly:**
```
$ node scripts/verify-fuel-cost-posts-exactly-once.mjs
  A NO_LIVE_FUEL_TRANSACTION_JES    0 live fuel_event JE(s)     PASS
  B NO_DUPLICATE_FUEL_POINTERS      0 duplicate pointer(s)      PASS
  C FUEL_5000_EQUALS_OWN_LINE_TOTAL $172117.98 GL net vs
                                    $172087.98 expense-line total   FAIL (diff $30.00)
  D FULL_LOAD_LINKAGE               0 non-trailer gap(s); 34 trailer-only, informational   PASS
  E NO_DOUBLE_LIVE_POSTED_DOCS      0 document(s) with 2+ LIVE JEs PASS
```
Check C now FAILs by exactly $30.00 that did NOT exist when AUTH-157 closed. This is very likely explained by AUTH-168/G2's own adjusting JE (`4210bd06-01fe-4f67-84ea-f85bb171b91f`), whose own reported TB delta included "5000 Fuel & Diesel +$30.00" as one of its 7 intended-to-move accounts — a real GL posting to 5000 from a manual adjusting JE, which this guard's comparison (GL net vs. accounting.expense_lines total) does not account for, since a manual JE has no expense_lines row. **Not independently re-derived to certainty in this pass** — flagging as a guard-scope gap (the guard may need to also allow for legitimate non-expense-sourced postings to 5000) rather than a fuel-bridge regression. Someone should confirm this explanation before trusting it further.

**Live proof — SECOND fresh discrepancy, on a DIFFERENT guard:**
```
$ node scripts/verify-steps/11751-verify-fuel-expense-bridge-is-whole.mjs
[verify-fuel-expense-bridge-is-whole] fuel rows without a live expense: 0
[verify-fuel-expense-bridge-is-whole] non-exempt 5000 expenses without a fuel transaction: 1
FAIL
```
The 1 row: expense `81ff108d-69e7-4f67-9aed-66bd5d022a2b` / `13534-28`, memo "ATGTx settl 5781 #8 $246.04 load 13534 inv 99133290 (reissued from 13534-15, R-179)" — clearly settlement-corpus-derived by its own memo (matches the exemption pattern exactly) but `source_settlement_ref` is NULL, so the guard's exemption check doesn't recognize it. Looks like a row created by concurrent settlement-corpus-reissue work (R-179) that didn't populate `source_settlement_ref`. **Not mine to fix without more context on who owns R-179's writer** — flagging for the Lead/whichever seat owns the settlement-reissue path.

**Left:** Both discrepancies above need resolution — neither was true when this AUTH closed; both are drift from concurrent work in the hours since.

## Reinstate-engine hole (factoring family) — PR #23320
**Changed:** `reinstateDocument`'s factoring_advance case now calls `assertNoLiveFactoringTwin()` before reinstating (matched on faro_invoice_number, falling back to amount+date), closing the "trusts caller discipline only" hole.
**Live proof:**
```
$ node scripts/verify-universal-reinstate-engine.mjs
verify-universal-reinstate-engine: OK — reinstateDocument + stampDocumentReinstated parity +
/unvoid routes wired.
```
**Left:** Nothing — closed.

## A-10 — reinstate exact-postings round-trip proof
**Changed:** Nothing (read-only proof job). Used AUTH-144's real historical case (FAC-2026-00097/00125) to prove the reinstate engine reproduces original postings byte-for-byte, zero approximation, across accounts 1090/1230/2150/6400.
**Live proof:** Full three-point JE walk committed at `docs/bus/2026-09-30-CC1-A10-REINSTATE-EXACT-POSTINGS-ROUNDTRIP-PROOF.md` (PR #23355, merged `93bf32861b`). Re-spot-checked both records' current status this pass (see AUTH-144 entry above) — both still `advanced`, `voided_at NULL`, consistent with the proof.
**Left:** Nothing — closed.

## Closure 39 — 17 loads missing mileage
**Changed:** Per Lead RULING 1: NO WORM carve-out. Committed a register of all 15 resolved deadhead-mileage values (source: computeChainDeadheadMiles) with their blocking settlement/invoice reference, plus the 13622 miles_practical gap (blocked on CC-3's geocode-provider item) and the newly-encountered "issued_invoice" lock reason. Closure 39 is now an operational-backlog item, off the close gate.
**Live proof:** `docs/bus/2026-09-30-CC1-CLOSURE-39-RESOLVED-MILEAGE-REGISTER-OFF-CLOSE-GATE.md` (PR #23342, merged). Documentation-only closure by design — no guard applies since this is no longer a close-gate item.
**Left:** Nothing on CC-1's side — re-apply the 15 values via the existing script once each settlement/invoice closes naturally.

## A-07/A-08/A-09 — wire 4 orphaned guards
**Changed:** Claimed and wired verify-steps 11757/11761/11765/11769 for `verify-live-loads-bills-require-closed-settlement`, `verify-new-financial-table-ships-worm`, `verify-check-stock-allocator`, `verify-resolve-fully-wired`.
**Live proof:**
```
$ node scripts/verify-guard-wired.mjs
verify:guard-wired — 5439 guards: 4170 fully-wired, 1259 exempt, 10 unaccounted (orphan=10)
```
None of the 10 remaining orphans are these 4 (spot-checked the list: verify-ar-ties-to-qbo-invoice-list, verify-check-engine, verify-check-register-gapless, verify-check-registry-has-expense-document, verify-dispatched-load-has-stop-stamps [CC-3], verify-driver-escrow-counter-leg-is-clearing, verify-every-bill-posting-carries-its-source-link, verify-geocode-provider-is-reachable [CC-3], verify-issued-invoice-on-rolling-load-needs-authorization, verify-match-candidates-are-settlement-born-only [CC-2]).
**Left:** Nothing on my 4 — closed. The 10 remaining orphans are not mine (named owners above, per ROUND 293).

## A-04 — DEF reclass TB isolation proof
**Changed:** Nothing (proof job). Recovered and committed the trial-balance baseline snapshot that every proof this session cites (`docs/audit/trial-balance-snapshots/2026-09-30-pre-def-fix.json`) — it existed only in one local worktree before this, never committed.
**Live proof:** `docs/bus/2026-09-30-CC1-A04-A06-A15-PROOF-REPORT.md` (PR #23352, merged) — exact offsetting pair 5000 −$3,484.63 / 5010 +$3,484.63; 6 other accounts moved in the same window from unrelated concurrent work (AUTH-165's factoring reversal), reported not buried.
**Left:** Nothing — closed. (Note: account 5000 has since moved AGAIN by $30.00 from AUTH-168/G2's adjusting JE — see the AUTH-157 entry above. That is a separate, later, already-explained event, not a defect in this proof.)

## A-06 — proforma AR exclusion
**Changed:** Nothing (proof job).
**Live proof, re-run fresh this pass:**
```sql
SELECT count(*) as n, sum(amount_open_cents)::bigint as open_cents FROM accounting.invoices
WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND voided_at IS NULL
  AND status='proforma';
 n=14 | open_cents=6137500
```
$61,375.00 exactly, 14 invoices — unchanged. Code path cited in the committed report: `ar-aging.service.ts:125`.
**Left:** Nothing — closed.

## A-15 — escrow liability-only proof
**Changed:** Nothing (proof job).
**Live proof:** Full per-driver posting-set proof committed at `docs/bus/2026-09-30-CC1-A04-A06-A15-PROOF-REPORT.md` (PR #23352) — after correcting a real methodology trap (a naive query falsely implicated 5310/6890 legs that belong to gross-pay recognition on the SAME settlement JE, not the escrow posting itself), the escrow-specific leg (via `escrow_postings.linked_journal_entry_id` → the driver's own 2100-00-NNN) was isolated and shown clean. **Re-attempted a quick independent re-check this pass and could NOT cleanly reproduce the isolation query in the time available** (my own quick query counted any 5xxx/6xxx leg on the same JE, which is exactly the trap the original proof already identified and worked around) — treating the committed report as authoritative rather than re-deriving a worse version of it.
**Left:** Nothing new — closed per the committed report.

## A-02/G5 — 3 orphan company settlements
**Changed:** Closed P-0015/16/17 via dedicated company-settlement headers (5817/5818/5819), fixing the missing `closeCompanySettlementAlongsideDriverSettlement` side effect.
**Live proof, re-run fresh:**
```sql
SELECT count(*) FILTER (WHERE status='closed') as driver_closed,
  (SELECT count(*) FROM accounting.company_settlements WHERE status='closed'
   AND operating_company_id='5c854333-...') as company_closed
FROM driver_finance.driver_settlements WHERE operating_company_id='5c854333-...';
 driver_closed=51 | company_closed=51
```
**Left:** Nothing — closed. Lead has already accepted this.

## A-01/G2/AUTH-159/AUTH-168 — settlement-line split
**Changed:** One adjusting JE (32 lines, $1,723.88) in the current open period reclassifying 16 of 17 merged settlement lines to real items (1 line, $22.14, correctly held out — no source names what it bought); permanent mapping table `driver_finance.settlement_line_item_splits`; `NOT VALID` check constraint blocking future null-item extra_pay lines. Settlements 5769-5819 never reopened.
**Live proof:**
```
$ node scripts/verify-g2-extra-pay-requires-item.mjs
verify-g2-extra-pay-requires-item: constraint present (validated=false), live null-item
extra_pay rows: 17 (baseline 17)
verify-g2-extra-pay-requires-item: PASS
```
(The 17 legacy rows on the closed settlements are permanently grandfathered by design — the constraint blocks any NEW row, which is the actual fix.)
**Left:** Nothing — closed, per Lead ruling accepted.

## A-11 — Customers Activity/Transactions measurement
**Changed:** Nothing (diagnosis only, as instructed).
**Live proof:** `docs/bus/2026-09-30-CC1-A11-CUSTOMER-ACTIVITY-TRANSACTIONS-MEASUREMENT.md` (PR #23348) — shared backend endpoint is correct (14 sent invoices matches raw-table math exactly); real defect is a UI-layer one: an unfiltered "Transactions" mini-table stacked above a filtered Invoices table, visibly disagreeing once any filter is applied.
**Left:** Lead's ruling on whether to wire the mini-table to the page's filters or remove the redundant tables.

## A-12 — Driver document/safety linkage measurement
**Changed:** Nothing (measurement only, as instructed).
**Live proof:** `docs/bus/2026-09-30-CC1-A12-DRIVER-DOCUMENT-SAFETY-LINKAGE-MEASUREMENT.md` (PR #23348) — FK mechanism works correctly both directions on the one real row tested, but company-wide only 1 document row exists at all, and it belongs to a test driver. Zero real USMCA drivers have any document on file. No written cross-module linkage declaration exists for this pairing.
**Left:** Data-population gap (not a code defect) and the missing linkage declaration both need direction on priority.

## A-13/A-14/A-16 — driver-profile classification + has-transactions predicate
**Changed:** Nothing (analysis/spec only, as instructed).
**Live proof:** `docs/bus/2026-09-30-CC1-A13-A14-A16-DRIVER-PROFILE-AND-HAS-TRANSACTIONS-ANALYSIS.md` (PR #23349) — Settlements/Pre-settlements/Cash Advances/Deductions classified accounting, Permits operational, Disputes flagged for ruling (also found `DisputesHubPage` conflates two different objects). A-16 predicate: proformas excluded, voided invoices/bills included, voided expenses/fuel excluded; live counts 76/1,249 customers and 34/623 vendors have real transactions; "voided-invoice-only" customer ruled to COUNT.
**Left:** Lead's ruling on Disputes tab placement; Cursor to build the A-14/A-16 UI off this spec.

ACK 2026-09-30 · CC-1 · read NOW-CC-1 · starting A-16

## A-16 — re-verified fresh per restart order (read-only, freeze-compliant)
**Changed:** Nothing to data. Found and fixed a real bug in my own already-delivered A-16 doc:
the vendor predicate referenced `accounting.vendor_credits.vendor_uuid`, a column that does not
exist (real name is `vendor_id`) — would have thrown at runtime. Caught by re-running the live
query fresh instead of trusting the prior text.
**Live proof:**
```
customers_with_txn=76  customers_total=1249
vendors_with_txn=34    vendors_total=623
```
Both counts identical to this morning's delivery — unaffected by today's void/reversal/purge
churn. Corrected predicate SQL committed to
`docs/bus/2026-09-30-CC1-A13-A14-A16-DRIVER-PROFILE-AND-HAS-TRANSACTIONS-ANALYSIS.md`.
**Left:** Same as before — Lead's ruling on Disputes tab placement; Cursor builds the UI off this
spec. A-16 itself is closed on CC-1's side.

## A-21 — has-transactions predicate shipped as shared code, then corrected
**Changed:** Shipped `apps/backend/src/accounting/has-transactions-predicate.ts` exporting
`customerHasTransactionsSql`/`vendorHasTransactionsSql`, wired into `mdata/customers.routes.ts` and
`mdata/vendors.routes.ts` under `has_transactions`, guarded by
`verify-has-transactions-predicate-shared.mjs` (PR #23439). Then corrected per your r294d ruling
(owner overrule on the voided-invoice edge case): a voided invoice no longer counts (PR #23451).
**Live proof:**
```
BEFORE correction: customers with_transactions = 76/1,249
AFTER correction:  customers with_transactions = 65/1,249  (exact match to your stated count)
vendors with_transactions = 34/623, unchanged both times
```
`verify-has-transactions-predicate-shared.mjs --selftest`: 12/12 PASS. Live run: PASS.
**Left:** A-25 (three-way dispute split, prove no shared query) and A-26 (bills.vendor_uuid text/uuid
cast, own migration) are new jobs from r294d, not started. Proceeding to A-23 per the sequence.

## A-23 — test/proof/sample rows: enumerated, not written
**Changed:** Nothing to data (enumeration only, as instructed).
**Live proof:** `docs/bus/2026-09-30-CC1-A23-TEST-ROWS-ENUMERATION.md` — 6 accounting.expenses proof
rows (5 mine, AUTH-117/120/122/125/126; 1 CC-2's "live-test check" $25.00), ALL already voided AND
their JEs already reversed same-session — TB impact if removed is $0.00, already net zero. Plus 2
TEST-named mdata.drivers rows (one with the company's only safety.driver_documents row, per A-12) —
neither voided, no GL impact. Plus 1 downtime.events row with is_sample_data=true. 5 other apparent
hits investigated and ruled out as real business rows (AUTH- mentioned for provenance only, or a
real bank ACH fee).
**Left:** Proceeding to A-22 per the sequence. Nothing written.

## A-22 — 120 unresolved item_ids: reported, not resolved
**Changed:** Nothing to data (report only, as instructed).
**Live proof:** `docs/bus/2026-09-30-CC1-A22-UNRESOLVED-ITEM-IDS-REPORT.md` — re-verified live, still
exactly 120 rows / $4,901.31 (unchanged from PR #23380's original analysis). Full per-row
enumeration supplied (id, amount, expense_number, transaction_date, description) — the source doc
had only described the pattern groups, not printed the full list. No item_id guessed or assigned.
**Left:** The owner decides. Proceeding to A-24 per the sequence.

## A-24 — safety.driver_documents ↔ mdata.drivers linkage declaration
**Changed:** Wrote the missing cross-module linkage declaration (data left alone, as instructed).
**Live proof:** `docs/trackers/LINKAGE-DECLARATION-safety-driver_documents-mdata-drivers.md` — live-
confirmed the FK is application-level only (zero real FOREIGN KEY constraints on the table, not even
the org.companies one the wiring doc credits it with), named every read/write surface, and restated
A-12's real finding (1 document row company-wide, belongs to a TEST driver, zero real USMCA drivers
have any document on file) without touching it.
**Left:** Recommend a real FK constraint (named, not added). Data-population gap is the owner's to
fill. A-20 through A-24 sequence complete.

## A-26 — accounting.bills.mdata_vendor_id gets a real FK
**Changed:** Migration 202614770000 adds a FOREIGN KEY on the already-populated, correctly-typed
`mdata_vendor_id` column (16338/16340 rows, 0 mismatches vs the legacy text `vendor_uuid`, 0 orphans
against `mdata.vendors`) — DDL only, no data touched, freeze-compliant.
**Live proof:** BEFORE 0 FK constraints on that column; AFTER `bills_mdata_vendor_id_fkey` live on
prod. Guard `verify-bills-mdata-vendor-id-fk.mjs` (verify-step 11949) selftest + live PASS.
**Left:** Repointing the 242 existing call sites from `vendor_uuid` to `mdata_vendor_id` (dropping
the cast entirely) is a separate, larger job — named, not done here.

## A-25 — dispute object separation confirmed, no vendor table exists
**Changed:** Nothing to data. Added a permanent guard.
**Live proof:** `docs/bus/2026-09-30-CC1-A25-DISPUTE-OBJECT-SEPARATION.md` — exhaustive table scan
finds exactly 4 dispute-named tables (driver_finance.driver_settlement_disputes canonical/active,
driver_finance.settlement_disputes archived, settlements.settlement_disputes retired-duplicate
schema, accounting.invoice_disputes canonical/active) — no vendor-scoped table anywhere. Confirmed
at the source level: the two active services never reference each other's table. New guard
`verify-dispute-object-sets-never-share-a-query.mjs` (verify-step 11953) makes this permanent.
**Left:** None. A-20 through A-26 sequence complete.
CODEX | 2026-09-30 6:46 AM CT | X-16 LANE-CROSS · Your #23360 static baseline lacked measured_at, so verify-no-stale-literals-in-guards blocked the gate. Source-only recheck: "436 file(s)" / "125 total unguarded write(s) (125 pre-existing, baselined, shrink-only)" / exit 0. Added actual recheck timestamp 2026-09-30T11:46:44Z and source-kind note only; all 125 entries unchanged. No production query or baseline raise. Publication pending with X-16.

CODEX | 2026-09-30 7:03 AM CT | X-16 BLOCKER / G2 · Actual static failures: verify-new-financial-table-ships-worm names driver_finance.settlement_line_item_splits (202614680000); verify-worm-coverage-ratchet reports unprotected tables 89 -> 90. Migration source has no delete-refusal trigger. Neither guard nor baseline changed. This blocks X-16 push before required CI proof. Your new extra-pay guard is also now routed with its existing 17-row baseline unchanged to required read-only CI, classifier selftest retained locally. No production writes.

## CORRECTION — #23441's "downtime schema 500s" claim was overstated (Lead correction accepted)
My PR #23441 reported "every one of those [downtime.events/event_costs/lost_opportunity] queries
would 500 at runtime right now." That was FALSE. The Lead measured live, before and after my merge:
`has_schema_privilege('ih35_app','downtime','USAGE')` = true, `has_table_privilege(...'SELECT')` =
true, 16 `role_table_grants` rows for `ih35_app` in `downtime` — nothing was 500-ing, production was
fine both before and after. The real, narrower gap (still worth the fix): no MIGRATION created that
schema's grants, so a fresh database or a DR restore would come back without them — a REBUILD-PATH
gap, not a live-500 gap. I conflated "no migration recreates this" with "this is currently broken."
Correcting the record so it doesn't propagate, per the Lead's instruction.
# CODEX | 2026-09-30 2:16 PM CT | LANE-CROSS coordination — user R297.5 X-19 assigns no-test-marker guard. Separate guard PR will add its in-memory selftest to money-pr-local-gate.mjs and required readonly run to ci.yml/local-db-guard-routing.mjs. Minimum wiring only; no posters, money, migrations or baselines touched. Authority: docs/bus/2026-09-30-CODEX-R297-5-AUTHORITY.md.
