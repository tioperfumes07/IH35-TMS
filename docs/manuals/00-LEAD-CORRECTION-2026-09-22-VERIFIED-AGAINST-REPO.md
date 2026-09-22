# LEAD CORRECTION — 2026-09-22 — THREE THINGS I TOLD YOU WERE WRONG. STOP AND READ.
Every line below was verified by reading the repo at main, with file and line numbers.
Owner: *"you need to confirm and verify the full and complete and honest mapping, you yourself
are not doing it, so you are driving coders to do things incorrectly."* He is right.

---

## 1 · CC-2 — **DO NOT BUILD A FARO IMPORT. IT ALREADY EXISTS.**
I told you to build a Faro purchase import keyed on customer reference. **Wrong. Stop.**

**It is already built and wired:**
```
apps/backend/src/factoring/faro-csv-import.ts
  FARO_CSV_REQUIRED_HEADERS :16   ("invoice number","customer name","gross","advance",…)
  parseFaroCsv              :145
  enrichFaroPreviewLines    :234
  resolveFaroCsvStatementDate :277
  commitFaroCsvImport       :530
  -> sets accounting.invoices.factoring_status = 'advanced'   :333
  -> posts reserve movements via postReserveMovement
  -> records the daily import via upsertFaroDailyImportOnClient
  -> gates on requireEffectiveFaroFullRecourseAgreement
  -> accrues default interest

apps/backend/src/factoring/faro-csv-import.routes.ts
  POST /api/v1/factoring/import/faro   :25
  body: csv_text, statement_date?, statement_reference?, source_filename?, preview_only?
  role-gated (ACCT-F5577)

apps/backend/src/factoring/faro-daily-import-provenance.ts
  assertFaroDailyImportProvenance :48
```
**THE DEFECT IS NOT A MISSING IMPORTER.** It is that these purchases were never imported, or the
import ran and the line did not match. **Your job: run it in `preview_only` against
`01-FARO/PURCHASE REPORT ALL.csv` and report which lines match and which do not, and why.**
`preview_only` first. Always. Then commit only what matched, and report the unmatched by name.

**`factoring_status` has SIX values, not two.** Verified writers:
```
'submitted'          factoring/batch.service.ts:316 (submitBatch :253)
                     dispatch/loads-bulk.routes.ts:278
'advanced'           factoring/batch.service.ts:377 (fundBatch :328)
                     factoring/faro-csv-import.ts:333
                     accounting/factoring-advances.routes.ts:596
'reserve_held'       accounting/factoring-advances.routes.ts:696
'released'           accounting/factoring-advances.routes.ts:805
'recourse_returned'  accounting/factoring-advances.routes.ts:947
                     accounting/factoring-posting/poster.service.ts:2008, :2248
'not_factored'       accounting/factoring-advances.routes.ts:1026
```
There is also an automatic path — `factoring/auto-submit-on-delivery.service.ts`,
`autoSubmitDeliveredLoadToFactor()` :73, INSERT at :132. **Find out why it did not fire for
13610/13612/13613/13614/13615 before writing a single row by hand.**

---

## 2 · CC-1 — **MY VOID CENSUS WAS WRONG. RE-MEASURE BEFORE YOU BUILD.**
I told you: *"29 route files expose /void. Exactly 4 call postVoidReversal. 25 handlers stamp
`voided_at` and walk away."* **That is not verified and it overstates the problem.**

**Verified:**
- **28 files** contain a `/void` path literal; **26** are route registrars
  (`bulk-void.service.ts` and `cancellation.service.ts` match the string but are services).
- `postVoidReversal` is defined at **`accounting/void.service.ts:521`** and is referenced by
  **20 non-test files**.
- **7 of the 28 reference it directly**: invoices.routes.ts, payments.routes.ts,
  prepaid-expenses.routes.ts, bulk-void.service.ts, dispatch/cancellation.service.ts,
  driver-finance/settlements.routes.ts, work-orders/work-orders.routes.ts.
- **Several others reach it through a service layer** — e.g. `bills.routes.ts` → `bills.service.ts`,
  `journal-entries.routes.ts` → `journal-entries.service.ts`, both of which reference it.
- **NOT CONFIRMED whether every `/void` route ultimately reaches a reversal.**

**Your first task is the census, not the service.** For each of the 26 route registrars, trace
the call chain and report one of: *reverses (via X)* · *does not reverse* · *nothing to reverse
(non-financial)*. **The 207 docs / $350,234.69 of live postings on voided documents is measured
and real — that number stands.** What is not established is how many handlers are at fault.
Build `voidDocument()` against the measured census, not against my number.

**Also verified, and it contradicts an earlier finding:**
`accounting/invoices.routes.ts:1191`, inside `POST /api/v1/accounting/invoices/:id/void` (:1054),
**does revert the load status** back to its prior status (or `delivered`). CC-2 reported that
path at :1122-1148 as *not* reverting. **One of those is stale. Re-read :1054-1200 and settle it
before touching it.**

---

## 3 · ALL SEATS — **THE STALE LOAD STATUS ROOT CAUSE IS NOW PROVEN**
I said "report the mechanism." It is verified:

**Settlement create, finalize and reverse DO NOT write `mdata.loads.status`. At all.**
```
settlements.routes.ts:955   create    -> no write to mdata.loads
settlements.routes.ts:1080  finalize  -> sets driver_settlements.status='locked' only
settlements.routes.ts:1273  reverse   -> no write to mdata.loads
```
The only non-test writes to `mdata.loads` from driver-finance/settlements are:
`settlement-load-reassignment.service.ts:260` (`presettlement_link_id`),
`abandonment.service.ts:240` (`status='abandoned'` — driver abandonment, not settlement),
`team-splits.routes.ts:376` (`team_split_override_*`).

**That is why 24 of 33 loads are settled, driver-billed and expensed while still reading
`dispatched`/`delivered`. Nothing ever advances them.**

**`mdata.loads.status` has 15 distinct SQL write sites across 13 files:**
```
dispatch/loads.routes.ts:1957            PATCH /dispatch/loads/:id/transition (:1885)  <- canonical
mdata/loads.routes.ts:1333               PATCH /mdata/loads/:id/status (:1228)
dispatch/stop-stamp.service.ts:62,113    stampStopArrival / stampStopDeparture
driver/loads.routes.ts:564,697           driver PWA arrive / depart
dispatch/draft-crew-status-advance.ts:49 advanceDraftStatusIfCrewed
cron/draft-crew-status-selfheal.cron.ts:89
dispatch/update-load.service.ts:785      draft-advance only (PATCH excludes status by design)
dispatch/cancellation.service.ts:234,711 cancelled
dispatch/loads-bulk.routes.ts:170,310    :310 sets 'paid'
dispatch/load-billing-lifecycle.service.ts:128  walkForward (:74)
accounting/invoices.routes.ts:1191       void -> revert
driver-finance/abandonment.service.ts:240 abandoned
integrations/samsara/auto-status-switch/detector.service.ts:456
```
**The fix belongs in the settlement lifecycle, not in a mass UPDATE.** The read-side predicate
stays permanently regardless — status has now proven stale in both directions.

---

## 4 · THE PRE-SETTLEMENT MACHINERY EXISTS. NOBODY BUILDS A NEW ONE.
```
apps/backend/src/dispatch/presettlement-link.service.ts
  allocateNextSettlementDisplayId              :38   (re-export)
  findOpenPresettlementTourForUnit             :59
  suggestPresettlementLink                    :100
  recordDeferredPresettlementSuggestion       :258
  confirmPresettlementLink                    :329   <- writes presettlement_link_id + tour_id (:523,:547)
  listPendingPresettlementSuggestions         :577
  linkLoadToPresettlementAtBookingInClientTx  :624
  linkLoadToPresettlementAfterAssignmentInClientTx :695  (idempotency gate :699)

apps/backend/src/dispatch/presettlement-link.routes.ts
  GET  /api/v1/driver-finance/presettlement-suggestions            :55
  POST /api/v1/driver-finance/presettlement-suggestions/:id/confirm :71

apps/backend/src/driver-finance/pre-settlement.routes.ts  registerPreSettlementRoutes :63
  GET  /pre-settlements/open-by-driver   :69
  GET  /pre-settlements/by-driver/:driverId :127
  POST /pre-settlements/:id/add-load     :279
  POST /pre-settlements/:id/settle       :414
```
`presettlement_link_id` readers include `accounting/load-costs-board.routes.ts:234-236` — **Load
Costs already resolves the pre-settlement link.** Use it.

---

## 5 · THE SETTLEMENT NUMBER — I HAD THE NAME WRONG
There is **no function called `settlementNumber`**. The canonical helper is:
```
apps/backend/src/driver-finance/settlement-display-id.ts
  allocateSettlementDisplayId(client, operatingCompanyId, periodDate)   :36
    periodDate is accepted but VOIDED (:41)
    delegates to allocateNextSettlementSourceDocumentRef()
      in driver-finance/settlement-source-document-ref.service.ts
    throws unless the result matches /^\d+$/  (:43-45)
```
**FORMAT: a bare continuing AlwaysTrack integer — 5804, 5805 … No prefix. No zero-padding.
Opco-scoped, advisory-lock serialised. Documented floor 5803.**
The old `driver_finance.next_settlement_display_id()` "S-YYYY-NNNN" synthetic counter is RETIRED.
**Imported by exactly 6 files.** Any call site minting its own number is a defect.

---

## 6 · `/settlements/:id/reverse` EXISTS — CC-3 WAS RIGHT, DO NOT REIMPLEMENT
```
driver-finance/settlements.routes.ts:1272   POST /api/v1/driver-finance/settlements/:id/reverse
  role gate: requireSettlementVoidRole
  guards:  already-cancelled -> no-op
           status='paid'     -> BLOCKED  settlement_reverse_blocked_paid
           locked_at set     -> BLOCKED  settlement_reverse_blocked_locked (POST …/unlock first)
  engine:  reverseSettlementBillPaymentInClientTx()
             accounting/settlement-posting/settlement-bill-payment-posting.service.ts:914
  then:    voids settlement_lines (is_active=false, voided_at/void_reason/voided_by) :1326
           header -> status='cancelled', reversed_at, reversed_by_user_id, reversal_reason :1338
```
`POST /api/v1/accounting/settlement-posting/reverse` is **RETIRED** and returns FIN-18
(`settlement-posting.routes.ts:59`). **`voidDocument({type:'settlement'})` CALLS the route's
engine — it does not reimplement it, and it does not bypass the paid/locked guards.**

---

## 7 · COMPANY SETTLEMENTS — the real map
```
accounting/company-settlement-open.service.ts
  openOrGetCompanySettlementForPeriod :23   INSERT :49
  junction INSERT accounting.company_settlement_driver_settlements :76
accounting/company-settlement-close.service.ts
  closeCompanySettlementAlongsideDriverSettlement :31  INSERT-if-missing :83
  junction INSERT :95 (idempotent)   UPDATE close :124
accounting/company-settlement-close-manual.service.ts
  closeCompanySettlementManual :43   UPDATE :134
driver-finance/settlement-continuation.service.ts:47  also updates the header
```
Live: **34 company settlements, 52 junction rows.**
`accounting.company_settlements` columns: `id, operating_company_id, display_id, period_start,
period_end, status, closed_at, closed_by_user_id, voided_at, void_reason, voided_by_user_id,
created_by_user_id, created_at, updated_at`. **Link is the junction table, never a column.**

---

## 8 · STANDING RULE, EFFECTIVE NOW
**Before any seat builds a thing, it greps for that thing.** Every one of the items above already
existed while I was assigning someone to build it. A PR that creates a second importer, a second
number generator, a second reversal engine or a second active-load definition **fails review on
sight**. If a mechanism exists and is not working, the finding is *why it did not run*, not
*build another one*.
