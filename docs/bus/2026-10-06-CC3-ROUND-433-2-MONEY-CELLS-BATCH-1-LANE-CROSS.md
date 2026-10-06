# LANE_CROSS — CC-3 — ROUND 433 item 2, batch 1: money cells 88 → 76 (2026-10-06)

**Authority:** Lead ROUND 433-CC3 item 2 ("bring it down; report the number each PR moves").

**Files:**
- `DriverOverviewBoard.tsx` and `driver-overview.service.ts` (DVIR rows now carry the work order id)
- `CustomerProfileOverview.tsx` and `customer-profile.service.ts`
- `CounterpartyStatementPage.tsx`
- `invoices.routes.ts` and its two tests
- new `accounting/aging/open-ar.ts`
- `verify-money-cells-click-through.mjs`

**Wired (each cell names one record or one exact list):**
- settlement row amounts → the settlement;
- additional pay → its settlement;
- complaint cost → the complaint;
- DVIR cost → the repairing work order;
- customer A/R buckets and open A/R → that customer's open invoices in that bucket, as of the date the server bucketed on;
- statement debit/credit → the line's own document.

**Engine defect found and fixed:** the customer profile hand-wrote a fifth copy of the aging ladder against `current_date` and counted DRAFT invoices. The invoice list a bucket drills to uses the one ladder (`aging/buckets.ts`) and excludes drafts, so a click would have opened a list that adds up to a different number. The fix:
- one open-A/R predicate (`aging/open-ar.ts`) is shared by the profile and the list;
- the profile buckets through the ladder on the company business date and returns `as_of`.

**Left plain on purpose:** totals that span records (section sums, exposure, limit). They have no single honest target, and AmountLink with a null filter would only fake the count.

**CC-1 / CC-2:** nothing to do. This note is the record of the crossing.
