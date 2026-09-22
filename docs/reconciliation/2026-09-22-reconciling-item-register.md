# Faro reconciling-item register — USMCA

Live, queryable artifact. Every reconciling item here is either **RESOLVED** (with the live proof
that closed it) or **OPEN** (named, with the exact gap stated — never plugged, never netted away).
Append-only in spirit: a resolved item's row is updated with its resolution, not deleted; nothing
here is silently dropped.

| # | Item | Amount | Status | Detail |
|---|---|---|---|---|
| 1 | Escrow/fee recognition, 6 closed Faro invoices | $143.63 ($8.22 fee / $135.41 rebate) | **RESOLVED** | See below. Source now confirmed: `docs/reconciliation/2026-09-22-RESERVE-REPORT.csv`. |
| 2 | `FARO-092` → load 13613 | n/a (link) | **CLOSED** | CC-1's mapping was correct; the gap was our own field. AlwaysTrack's own Unsettled Loads screen shows 13613 with W.O. `1013583-2` = Faro invoice 92, $5,700.00, purchased 9/21. Our app carries `customer_po_number` 4504493857 and a NULL `customer_wo_number` for this load — that NULL, not a bad mapping, is why the evidence didn't resolve from our own data. Evidence: AlwaysTrack Unsettled Loads screen, 2026-09-22. Not patched — the `customer_wo_number` gap is real data state and the settlement purge/refeed rebuilds this load's row; recorded as evidence, not fixed in place. |
| 3 | `FARO-049` → load 13567 | n/a (link) | **OPEN — EVIDENCE NOT ON FILE** | Same as above. |
| 4 | `factoring_reserve_movements` gap | $428.87 | **OPEN — not plugged, re-derivation attempted, doesn't close it** | 110 rows / $5,094.47 held vs. escrow $4,530.19 + cash $135.41 = $4,665.60. Partial root cause (51 stale rows) found; `RESERVE REPORT.csv`'s 18 rows re-derived per instruction — its window (8/28–9/21) doesn't cover the full held-movement window (8/10–9/11), so it cannot close the residual $1,847.24. |
| 5 | 8 direct disbursement legs (intercompany, DR 8000 / CR 1230) | $35,730.00 | **RESOLVED** | 8 individual JEs posted, balanced, source_transaction_type `faro_intercompany_leg`. See item 5 below. |
| 6 | 5 "reserve deposits" | $28,489.00 | **CLOSED — moot, not a separate population** | Owner correction (#22188): 4 of the 5 are the funding side already inside 4 of the 8 legs; RESERVE REPORT.csv's own Balance column proves it. Posting both would double-count $26,840.00. Not posted separately — see item 6 below. |
| 7 | Self-carried invoices | $51,262.41 open, 16 invoices | **OPEN — count corrected, not yet built as an AR-aging line** | The "5 invoices / $12,592.40" figure from earlier this session does not reproduce live — re-derived fresh: 16 real unfactored (`factoring_advance_id IS NULL`), unvoided invoices, $51,262.41 total, $0.00 paid on every one. Not forcing the stale figure. |
| 8 | Invoice 13524 Faro-vs-face variance | $400.00 | **RESOLVED** | Voided predecessor invoice; live replacement `INV-2026-00008` ties Faro's gross exactly. `accounting.invoice_disputes` dea42eed-6f25-4cf5-b0ff-ce2ea0ceec9a. |
| 9 | Invoice 13587 (Key Global) under-billing | $120.00 | **OPEN** | Proforma not yet finalized at Faro's $4,120.00. `accounting.invoice_disputes` 08a6227a-3eaf-47d8-9e80-0905fe0b4a85. |
| 10 | Invoice 13579 — reinstated to match Faro | $5,210.00 | **RESOLVED, with one loose end** | Owner ruling: "Faro is truth." Reinstated as `INV-2026-00010`, $5,210.00 exact. `accounting.invoice_disputes` 80a9a5fa-e2f9-48c0-b921-096eeb956461, resolved. **Loose end:** the new invoice has no `factoring_advance_id` — it reads as self-carried even though Faro genuinely purchased it; no `accounting.factoring_advances` row exists for this purchase at all. See item 7 below. |
| 11 | 6400 vs 6820 "Factoring Fees" — which is canonical | n/a (report) | **RESOLVED — 6400 confirmed correct, by role** | `accounting.chart_of_accounts_roles`: role `factor_fee_expense` binds **6400**, active. 6820 has zero role bindings and is itself `deactivated_at` 2026-07-22. No reclassification needed — item 1's posting to 6400 was already correct. |
| 12 | 1200 vs 1230 "Factoring Reserve" duplicate | n/a (report) | **REPORTED, not fixed (§D)** | 1200 "Factoring Reserve / Holdback" is `deactivated_at` 2026-08-30, `system_purpose NULL`, zero role bindings — a retired legacy row, not a live ambiguity. 1230 "Factoring Reserves" is the sole active, role-bound (`factor_reserve_default` + `factor_reserve_held`) account. Named per instruction; neither account touched. |
| 13 | A/R $218,472.41 vs Faro control $298,762.00 | $80,289.59 gap | **DECOMPOSED — not further split by invoice yet** | Two clean, live-verified buckets summing exactly to the stated gap. See item 13 below. |
| 14 | 1150 Unbilled Revenue $3,200.00 residual / invoice 13572 | $3,200.00 | **CORRECTING THE LEAD'S HYPOTHESIS — not a void-handler defect** | Live evidence shows a void-and-reissue in progress (13572 → draft `INV-2026-00009`, same load, corrected customer), same pattern as invoice 13541's precedent already in the codebase. Event 1 (earn) correctly stands; reversing it would be wrong. See item 14 below. |
| 15 | Duplicate `display_id` `INV-2026-00009` — two live invoices | n/a (report) | **REPORTED, not fixed** | Found while investigating item 14. Two non-voided invoices share `display_id='INV-2026-00009'`: a `paid` one from 2026-07-29 (different customer) and the `draft` one from 2026-09-12 (Value Logistics→EGRO correction). See item 15 below. |

## Item 1 — Escrow/fee recognition, 6 closed Faro invoices (RESOLVED)

**Source, now on file and confirmed a third independent way:**
`docs/reconciliation/2026-09-22-RESERVE-REPORT.csv` (18 rows, copied verbatim from
`~/Downloads/IH35-MASTER-RECONCILIATION/01-FARO/RESERVE REPORT.csv`) carries this exactly, line by
line: six "Transfer Escrow to Cash" rows (25.50 + 7.88 + 5.25 + 37.50 + 57.00 + 10.50 = 143.63) and
three "Schedule Fee" rows (-0.23 on 9/18, -6.60 on 9/18, -1.39 on 9/21, summing -8.22), closing to
the printed balance 135.41. 143.63 − 8.22 = 135.41 exact. This is a **schedule fee** per Faro's own
report, not a generic "factoring fee" — checked account 6400's own definition/notes before keeping
it there (see below); no reclassification needed. The $143.63 anchor is now confirmed three
independent ways: (1) live re-derivation as the sum of `fee_amount_cents` across exactly the 6 rows
in the scoped statement where `reserve_amount_cents = 0` — `13512, 13513, 13524, FARO-003,
FARO-011, INV-2026-00007`; (2) the owner's own live query; (3) this source CSV's own running
balance.

**Posted live** — `journal_entry ad7b68b5-0f77-41f8-bc53-ff1c63f941a5`, 2026-09-22, balanced at
$143.63, via `scripts/ops/cursor-2026-09-22-faro-reserve-close-6-invoices.mts`:

```
DEBIT  6400 Factoring Fees (Expense)          $8.22
DEBIT  1090 Undeposited Funds (Asset)       $135.41
CREDIT 1230 Factoring Reserves (Asset)      $143.63
```

ASC 705-20: the $135.41 cash rebate is a reduction of the factoring cost, never income. The
$4,530.19 scoped-statement reserve (the still-OPEN 83 lines, not these 6) was already correctly an
asset before this entry — no additional posting needed for that portion; verification of exactly
how it ties to the existing `held` movements is folded into item 4's $428.87 investigation below,
not re-litigated here.

**Standing poster — explicitly BLOCKED, not built:** a recurring recognize-on-close poster would
have to compute the fee/rebate split itself for every future invoice, and that split is not in our
data for any invoice, closed or open — building it now means inventing a formula on a schedule,
the exact failure this item's own investigation refused to commit. **Precondition to build it:**
Faro's per-invoice fee/rebate split ingested as a real field (a new column on
`factor.faro_invoice_lines` or a companion table) — not before.

## Item 4 — `factoring_reserve_movements` $428.87 gap (OPEN — partial root cause found)

Live: `accounting.factoring_reserve_movements` = 110 active rows, all `movement_type='held'`,
summing $5,094.47. Target: Faro's own escrow $4,530.19 + cash $135.41 = $4,665.60.
$5,094.47 − $4,665.60 = **$428.87**, unexplained.

**Real defect found, not yet sufficient to close the full gap:** 51 of the 110 `held` rows point to
`accounting.factoring_advances` whose `status = 'voided'` — the same "Faro day-by-day rebuild
2026-09-13" batch already found in the AP/1090 investigation (its GL effect was correctly reversed:
51 credit postings to account 1230, exactly $2,276.11, memo "Reversal of journal entry X: Faro
day-by-day rebuild 2026-09-13"). **The subledger was never updated to match** — all 51
`factoring_reserve_movements` rows for those voided advances still read `is_active = true`, still
counted in the live total. This is a genuine subledger-vs-GL desync, not a rounding artifact.

Excluding those 51 leaves 59 joined `held` rows summing **$2,818.36** — which undershoots the
$4,665.60 target by $1,847.24, the opposite direction from the original $428.87 overshoot. So the
stale-subledger-row defect is real and should be fixed (mark those 51 `is_active = false`, citing
the reversing JE), but it is **not, by itself, the whole $428.87 story** — something else (very
likely purchases that were part of the voided rebuild and never got a fresh `held` row posted after
the correction) is still missing on top of it. Not plugged, not netted, root cause not fully closed.

**Re-derivation against `RESERVE REPORT.csv`'s 18 rows, as instructed — does not close it.** Live:
the 110 active `held` movements span **2026-08-10 to 2026-09-11**; the CSV covers **2026-08-28 to
2026-09-21** — overlapping, not identical. 24 of the 110 held rows ($949.13) predate the CSV's
window entirely. The CSV is authoritative for its own window (already correctly used for item 1's
escrow JE) but is not a comprehensive movement list for the full 110-row population, so it cannot
by itself account for the residual $1,847.24. Not forcing a false close.

## Item 5 — 8 direct disbursement legs, $35,730.00 (RESOLVED, posted)

Source: `docs/reconciliation/2026-09-22-PAYMENTS-TO-USMCA-FROM-FARO.csv` (95 rows), filtered to
`Pmt Type = 'Faro Internal Transfer'` (9 rows, 8 carrying an amount). Intercompany, per owner
ruling #22185: Faro's counterparty is IH 35 Transportation (export filenames and settlement
letterhead both name it, not inferred) — 8000, not 8001.

Posted individually, `scripts/ops/cursor-2026-09-22-faro-8-direct-legs.mts`, each `DR 8000
Inter-company - IH35 Transportation / CR 1230 Factoring Reserves`, own date, Pmt Ref as memo:

| Date | Amount | Pmt Ref (memo) | Journal entry |
|---|---|---|---|
| 9/21/26 | $2,000.00 | Pago Reserva Negativa IH35 | `55aee712-32dd-49dc-93ee-3fbfc1182f0e` |
| 9/15/26 | $8,000.00 | Pago a Reserva Negativa IH35 09/15/26 | `ea80a374-1f15-4aa2-ab59-fd166177fa25` |
| 9/9/26 | $11,840.00 | Pago a IH35 Reserva Negativa - Facturas Larralde Transport pagadas a ellos directamente | `319a1897-5a04-4e25-8b16-bea5ea3538d3` |
| 9/2/26 | $5,000.00 | USMCA Reserve to IH 35 Reserve | `0f867254-bff0-4cb1-99b9-cb1b396083ee` |
| 8/14/26 | $688.00 | Transfer to IH35 neg res 08/14/26 (1 of 2) | `0e529e4f-f284-48c1-9eae-d8b62fc88579` |
| 8/14/26 | $4,753.00 | Transfer to IH35 neg res 08/14/26 (2 of 2) | `7a93859f-b4c1-4ddc-9b42-f3cb4ac4f76e` |
| 8/13/26 | $1,800.00 | USMCA Internal Transfer IH35 08/13/26 | `f47e4e9f-1455-498d-9c64-73c2aed8572e` |
| 8/12/26 | $1,649.00 | Internal Transfer to IH35 Reserves 08/12/26 | `12c6d447-7d9f-46e9-b973-bf14e4d3d6a6` |

Independently re-verified live post-posting: 8 debits + 8 credits to `source_transaction_type =
'faro_intercompany_leg'`, both sides sum to $35,730.00 exactly, zero unbalanced JEs.

## Item 6 — 5 "reserve deposits", $28,489.00 (CLOSED — moot, not a separate population)

Owner's own correction, verbatim (#22188): "the 5 deposits are the FUNDING SIDE of the 8 legs."
`RESERVE REPORT.csv`'s own running Balance column proves it — each `Rsv Deposit` is matched by an
equal, opposite `Client Payable` transfer days later that pays IH35, and the balance returns to
(near) zero every time: 8/28 +5,000 → 9/2 −5,000 (bal 0) → the 9/2 leg; 9/8 +11,840 → 9/9 −11,840
(bal 0) → the 9/9 leg; 9/14 +8,000 → 9/15 −8,000 (bal 0) → the 9/15 leg; 9/17 +2,000 → 9/21 −2,000
(bal 69.30) → the 9/21 leg. **Posting these separately would have double-counted $26,840.00.**
The 8/12/26 $1,649.00 "appears in both lists" question from the prior round is moot under this
correction — it was never two events; it is item 5's own last leg. Not posted here, superseded by
item 5.

## Item 7 — Invoice 13579, RESOLVED — reinstated to match Faro exactly

Owner ruling, verbatim: **"Faro is truth. You already reconciled."** Faro's $5,210.00 was correct;
our $0.00 face (from the 2026-09-07 void that never got replaced) was the defect. The app moves to
Faro, never Faro to the app.

**Reinstated live**, `scripts/ops/cursor-2026-09-22-faro-reinstate-13579.mts`, reusing the existing
`buildInvoiceFromLoad` service (no new GL math):
- New invoice `INV-2026-00010` (the load-number display_id `13579` was taken by the voided
  predecessor; `resolveInvoiceDisplayId` fell back to the `INV-2026-NNNNN` sequence, the same path
  13524's own replacement `INV-2026-00008` went through).
- Linehaul line: $4,900.00 (the load's own `rate_total_cents`, from the standard service).
- Adjustment line: $310.00, `line_type='adjustment'` → revenue_code `accessorial` (the existing,
  real category — never an invented account), memo citing the Faro reconciliation and Faro invoice
  #59 by name.
- Total: **$5,210.00 exact**, matching Faro's gross to the cent. Status set to `sent` (matching the
  13524/`INV-2026-00008` precedent).
- `accounting.invoice_disputes` `80a9a5fa-e2f9-48c0-b921-096eeb956461` resolved,
  `resolution_type='invoice_corrected'`, citing `INV-2026-00010`.

Independently re-verified live: invoice status/total/lines all confirmed post-write;
`verify-dispute-window-unified.mjs` re-run, still `LIVE PASS`.

**Loose end, flagged by the same seat that created it:** `INV-2026-00010` has
`factoring_advance_id IS NULL` — it reads as a self-carried invoice in the system even though Faro
genuinely purchased it ($5,053.70 real cash advanced). Checked live: no `accounting.factoring_advances`
row exists for this purchase at all, on either the old voided invoice or the new one — the same gap
already found affecting most of the Faro-native purchases this session. Not fixed here: creating a
new `factoring_advances` row needs the correct `factoring_company_vendor_id` and the established
advance-creation path, not a guess bolted onto this fix under time pressure. Belongs with the
broader, already-named advance-linkage gap.

## Item 11 — 6400 vs 6820 "Factoring Fees" (RESOLVED — 6400 confirmed correct, by role)

Resolved by role, not by number, per instruction: `accounting.chart_of_accounts_roles` (the
canonical table — not `catalogs.account_role_bindings`) live, USMCA:

```
role='factor_fee_expense', is_active=true  -> account 6400 'Factoring Fees'
(no role of any kind binds account 6820)
```

6820 is itself `deactivated_at = 2026-07-22T18:31:45.187Z`, `system_purpose = NULL`. 6400 is
active, `system_purpose = 'factoring_fees'`, and is the one live-bound role target. Item 1's
posting of the $8.22 Schedule Fee to 6400 was already correct — no move, no reclassification.

## Item 12 — 1200 vs 1230 "Factoring Reserve" duplicate (REPORTED, not fixed)

Named per instruction (§D — additive, never delete/rename), not touched:

```
1200 'Factoring Reserve / Holdback'  deactivated_at=2026-08-30T23:08:48Z  system_purpose=NULL  0 role bindings
1230 'Factoring Reserves'            active                              system_purpose='factoring_reserves'
                                      roles: factor_reserve_default (active), factor_reserve_held (active)
```

1200 is a retired legacy row, not a live ambiguity — it carries no role binding and is already
deactivated. 1230 is the sole active, role-bound target every posting this session used. Reported
as instructed; neither account renamed, merged, or deactivated further.

## Item 13 — A/R gap, $80,289.59 (DECOMPOSED)

Live, prod, USMCA, `bypass_rls='lucia'` FALSE, single-txn BEGIN/ROLLBACK:

```
1100 GL balance (control account):                              $218,472.41  (74 postings, net)
accounting.invoices subledger, unvoided, sum of total_cents:     $261,632.41  (80 invoices)
  factored (factoring_advance_id set):    63 invoices  $205,160.00
  self-carried (factoring_advance_id null): 17 invoices  $ 56,472.41
factor.faro_invoice_lines, all live:                               $356,787.00  (104 lines, gross)
```

**Bucket A — subledger vs. GL control:** $261,632.41 − $218,472.41 = **$43,160.00**. The
`accounting.invoices` subledger carries more open value than the 1100 control account shows. This
is a sub-ledger/GL tie-out gap, not a Faro-vs-us gap — needs the specific invoices whose GL posting
doesn't match their subledger total enumerated next (not done in this pass).

**Bucket B — subledger vs. Faro control:** Faro's own control figure given by the Lead
($298,762.00) − subledger ($261,632.41) = **$37,129.59**: invoices Faro's own records show that
either aren't on our books at all, or are on our books at a different amount. Given "Faro is truth"
(standing law this round), this is the higher-priority bucket to enumerate.

**$43,160.00 + $37,129.59 = $80,289.59** — exact match to the Lead's stated total gap. Both buckets
verified live and reproduced independently from the Lead's own $298,762.00 figure; not forced,
not netted. Note: $298,762.00 (Lead's Faro-control figure) is NOT the same number as
`factor.faro_invoice_lines`'s raw all-rows gross sum shown above ($356,787.00, 104 lines) — the two
weren't reconciled to each other in this pass; the Lead's figure is presumably a scoped subset
(open/active lines only, a date window, or similar) and Bucket B uses it as given, not re-derived.
That gap between $298,762.00 and $356,787.00 is itself unexamined and worth naming, not silently
assumed equal.

**Not yet done:** identifying the SPECIFIC invoices composing each bucket. This decomposition says
*where* the $80,289.59 splits, not *which* rows. Next pass: diff `accounting.invoices` against
`factor.faro_invoice_lines` by load/customer/amount to name Bucket B's rows, and diff
`journal_entry_postings` tagged `source_transaction_type='invoice'` against the subledger totals to
name Bucket A's rows.

## Item 14 — 1150 Unbilled Revenue $3,200.00, invoice 13572 (CORRECTING THE LEAD'S HYPOTHESIS)

The Lead's instruction was: void the invoice, don't reverse Event 1, "one void handler, two things
it fails to clean up," fix the void handler to auto-reverse revenue postings on every void, re-measure
1150 to $0.00. **Live evidence does not support that diagnosis for 13572, and building the
prescribed fix would be wrong — it would erase genuinely earned revenue.** Verified live, prod,
USMCA, single-txn BEGIN/ROLLBACK:

```
invoice 13572   id 99c4dab1…   status void   voided_at 2026-09-12T23:21:51Z   total $3,200.00
  load 43809ccf… (display 13572), status closed

Event 1 (earn)  JE 15bf3ae8…  entry_date 2026-09-07  DR 1150 $3,200 / CR 4000 $3,200
                voided_at NULL, reversed_by_je_id NULL  <- STANDING, never reversed
Event 2 (bill)  JE 009fb5f8…  entry_date 2026-09-07  DR 1100 $3,200 / CR 1150 $3,200
                reversed_by_je_id d4c74c17… (the void's own reversal)  <- correctly reversed

Reversal JE d4c74c17…  memo: "Void reversal of invoice 99c4dab1…: AllwaysTrack reconcile
  2026-09-12 — customer Value Logistics -> EGRO Transport (AT); rate unchanged; no factoring"
  CR 1100 $3,200 / DR 1150 $3,200

Replacement invoice INV-2026-00009 (id ae5ba12f…), created 2026-09-12T23:24:21Z — 3 minutes after
  the void, same load, same $3,200.00, status DRAFT, customer_id 146067cf… (the corrected customer).
```

**This is a void-and-reissue, not a bare cancellation** — the void's own memo says so
(customer-name correction, "rate unchanged"), and the replacement invoice's existence confirms it.
The freight on load 13572 was genuinely delivered; Event 1's earn posting (DR 1150 / CR 4000) is
correct and **must stay standing**. Event 2 was correctly reversed, because the WRONG customer's
receivable needed to come off the books. The codebase already has this exact pattern documented —
`void.service.ts`'s ACCT-F5723 comment names an identical case (invoice 13541, rate-correction
reissue) and explains why `standingLatchJePredicate` deliberately keys on `reversed_by_je_id` so a
reversed Event 2 does not block the load from re-recognizing once its replacement invoice is sent.

**The actual gap: `INV-2026-00009` has sat in `status='draft'` for 10 days (created 2026-09-12,
today 2026-09-22) and was never finalized/sent.** `loadHasIssuedInvoice()` (the gate Event 2 needs
to refire) requires `status IN ('sent','partial','paid','factored')` — draft doesn't qualify, so
Event 2 correctly has not refired for the new customer, and 1150 correctly shows $3,200.00 open:
freight earned, not yet billed. That is the **expected, self-explaining state of an in-progress
correction**, not a defect signature.

**Swept for scope, live:** all 38 voided USMCA invoices, checking whether each one's earn (Event 1)
still stands AND whether a live replacement invoice exists on the same load:

```
TRUE ORPHANS   (earn stands, NO replacement invoice anywhere):           0
REISSUE-IN-PROGRESS (earn stands, replacement invoice exists):           4  — 13554→039(sent),
    13541→INV-2026-00002(sent), INV-2026-00001→INV-2026-00002(sent), 13572→INV-2026-00009(draft)
NO EARN EVENT RECORD AT ALL (predate/bypass the two-event latch):       29  (untouched by 1150)
```

**Zero true orphans exist.** Of the 4 reissue-in-progress cases, 3 already have a `sent` replacement
(1150 will net to $0.00 for those the moment Event 2 re-measures — not separately verified per-row
in this pass). **13572 is the only one still stuck**, and it is stuck on an un-sent draft invoice,
not on a code defect in the void path.

**What I am NOT doing:** reversing Event 1 for 13572 (would falsely erase $3,200.00 of genuinely
earned freight revenue), and NOT building the "voiding an invoice auto-reverses its revenue
postings" fix as instructed (it would break all 4 reissue-in-progress cases the same way, present
and future — the correct behavior for a reissue is exactly what the code already does: reverse
Event 2 only, leave Event 1 standing).

**What should happen instead:** `INV-2026-00009` needs to be finalized and sent to EGRO Transport
through the normal invoice-send flow. That is a business/document action (real money, a real
customer, sent through the app's own path with its own validation and audit trail), not a database
write I am making unilaterally. Flagging it as the concrete next step, not performing it myself.

Routed to CC-1's OUTBOX: this reframes the finding they were told to expect from me (a wiring gap)
into a correction instead (no wiring gap in this case) plus the separate display_id defect below,
which is more clearly theirs (`from-load.ts`/`resolveInvoiceDisplayId`, `apps/backend/src/accounting/**`).

## Item 15 — Duplicate `display_id` `INV-2026-00009` (REPORTED, not fixed)

Found while investigating item 14. Two live (non-voided) invoices share the same `display_id`:

```
id ae5ba12f-a2a8-4db8-997e-ec3f982ee7ac   display_id INV-2026-00009   status draft
  customer 146067cf…   created 2026-09-12T23:24:21Z   total $3,200.00
id 59d6d429-4cb6-45ea-a1bb-951439d8e340   display_id INV-2026-00009   status paid
  customer b50d2907…   created 2026-07-29T19:41:53Z   total (not re-measured here)
```

Per the "INVOICE-DISPLAY-ID-EQUALS-LOAD-NUMBER" rule and `resolveInvoiceDisplayId`'s documented
collision fallback (load-number-based id → `INV-2026-NNNNN` sequence on collision), two invoices are
never supposed to carry the same `display_id` live at once. `invoices.routes.ts` has at least one
lookup keyed on `display_id` filtered only by `voided_at IS NULL` (line ~466) — with two non-voided
rows sharing a `display_id`, that lookup's `LIMIT 1` returns whichever one the query planner picks,
silently. Not triaged further (root cause of the collision, or whether the sequence-allocator itself
double-issued `00009`) — reported per §D discipline, not fixed; `accounting/from-load.ts` and the
display-id sequence resolver are CC-1's lane (`apps/backend/src/accounting/**`), routed to their
OUTBOX.

## Item 16 — The 18 Faro-bought loads: 1 resolved, 1 rate flag, 0/18 evidence (RESOLVED partial / REPORTED)

Owner packet: 18 named loads Faro already purchased ($72,567.00 total), plus one mis-keyed case,
INV-2026-00010 / load 13579 ($5,210.00), to be resolved by setting factoring status from the Faro
document rather than invoicing.

**INV-2026-00010 / load 13579 — RESOLVED, live, per instruction.** Called
`autoSubmitDeliveredLoadToFactor` for `source_load_id 55e1b670-1201-40a8-8c48-b29d6bf73025` (the
real, confirmed `source_load_id` on this invoice). Result: `submitted:true`, advance
`FAC-2026-00120`, pledge $5,210.00. `accounting.invoices.factoring_status` flipped
`not_factored -> submitted` on its own, through the real auto-submit path — never set by hand.

**13611 — FLAGGED, not touched.** Faro's stated purchase (inv #91 / PO 1013707, Refrigerx) is
$3,200.00. This load's own real, owner-entered linehaul charge line (`dispatch.load_charge_lines`,
2026-09-21) is $3,700.00 — a genuine $500.00 discrepancy between two real, independently-entered
numbers. Excluded from the batch below pending clarification of which figure is correct.

**The other 17: charge lines are already correct (no action needed); delivery evidence is
uniformly absent (0 of 18, no action possible).** Checked all 18 loads' `dispatch.load_charge_lines`
against the packet's own rate table — 17/18 match Faro's stated rate exactly (owner-booked directly,
2026-09-11 through 2026-09-21); only 13611 diverges (above). Checked all 18 loads'
`mdata.load_stops` (same query shape `finalActiveDeliveryDepartureAt` uses in the real send-invoice
gate): every stop, pickup and delivery, on every one of the 18 loads reads `status='pending'`,
`actual_arrival_at IS NULL`, `actual_departure_at IS NULL`. This includes loads 13590, 13591, 13592,
13594, whose `mdata.loads.status` column already reads `'delivered'` — a direct, load-level-vs-
stop-level contradiction on those 4, itself worth a separate data-integrity item, not fixed here.

**Applying the same rule that correctly refused invoice 13615** (`sendDraftInvoice`'s delivery-
evidence gate reads `mdata.load_stops` directly, independent of `mdata.loads.status`): none of these
17 loads can be advanced through the real status path (there is no delivery evidence to advance
"using"), invoiced through the real send path (would hit the identical `delivery_evidence_missing`
409 13615 got), or auto-submitted to factor (requires a `sent` invoice first). Not attempted. The
unblock is real POD/departure capture on these 18 loads through the normal dispatch/driver path —
not a database write from here. Full detail: `docs/bus/OUTBOX-CC-2.md`, 2026-09-23 entry.

## Item 17 — Receipt application: 7 debtor receipts applied via `postFactoringCustomerPaymentEvent` (RESOLVED, live)

Source: owner's `debtor_receipts_report.csv` (9/21 download, 7 rows). Each row = the customer paid
Faro directly, closing our A/R through the factor. Applied live, exactly as the existing (never
previously invoked on USMCA) poster is designed: DR GL 2150 Factoring Advance / CR GL 1100 A/R.

```
invoice     customer                    face        paid        result   JE
13516       Sethmar Transportation      $700.00     $700.00     paid     3b56f62a-0f59-43fc-a94b-85968a352211
INV-2026-07 ITS Logistics LLC           $350.00     $350.00     paid     107647bc-31ba-4a26-a019-d4f3fece0bcf
INV-2026-08 MPH Carrier Services, Inc   $3,800.00   $3,800.00   paid     8eb187b7-9552-4077-866a-82438dedbba6
13513       FLS Transportation Svcs     $525.00     $525.00     paid     8261fe08-a588-493e-a098-3c12e29153f5
13508       NCC Logistics México        $2,500.00   $2,500.00   paid     ed049161-7d6c-4121-b984-eec9639122da
13512       Watco Supply Chain Svcs     $1,700.00   $1,700.00   paid     de57f03a-5450-4dd9-9402-f26653817345
13521       CORE LOGISTICS BROKERAGE    $3,500.00   $3,250.00   partial  2246da63-3784-4d2f-a034-888c4e658787 ($250.00 left open)
```

Two disambiguations, both resolved on hard structural criteria: FLS Transport had two invoices at
the identical $525.00 face; only one (13513) carries a `factoring_advance_id` (the poster requires
one), so that's the only valid target. "NCC LOGISTICS USA" doesn't match any customer name exactly —
`mdata.customers` carries "NCC Logistics México" — the $2,500.00 face value is unique to that
customer's single invoice (13508), so amount was the real disambiguator; the name mismatch is
flagged, not silently assumed. Total applied: $12,825.00 — matches the Faro receipt total cited in
an earlier round exactly. No code changed; reused the existing, tested, never-before-invoked-on-
USMCA poster exactly as built. Full detail: `docs/bus/OUTBOX-CC-2.md`, 2026-09-23 entry.

## Item 18 — Diesel expense void, Batch 1 (89) + Batch 2 (1): RESOLVED, live, per Cursor's approved preview

Source: `~/Downloads/09-22-2026-Cursor-DIESEL-EXPENSE-VOID-PREVIEW.md`. Reproduce query run verbatim
BEFORE execution for both batches — exact match on both: Batch 1 **89 | $59,726.73 |
md5 8c6a2eea31541c22c69481032dbfeb6c**; Batch 2 **1 | $624.60 | md5
328d3394910696b1164e82ac829fce80**. Executed via the same reversal + status-flip transaction
`/api/v1/expenses/:expenseId/void` already uses (`reversePostedSourceTransactionInClientTx` +
`UPDATE accounting.expenses SET status='void', posting_status='reversed', ...` in one transaction,
per row) — no new GL math, no seventh engine, nothing deleted. All 90 rows voided successfully (0
failures). Re-ran both reproduce queries after: both **0 | $0.00**. GL 5000 credit total from the 90
reversal JEs confirmed live = exactly $60,351.33 ($59,726.73 + $624.60). Full row-level register
(expense id · load · invoice · dollars · twin fuel row id · reversal JE id), for every one of the 90
rows: `docs/reconciliation/2026-09-22-diesel-void-batch1-row-register.md`.

**Held, not touched, per explicit instruction:** expense 13537 (invoice 99456225, $1,164.04) — its
twin fuel row was restored live by CC-3 (FUEL-DEDUPE-05) but without a GL posting; waiting on
CC-3's re-post through POSTING-04 first. Class C (13547, 13557-1) — waiting on CC-3's load
attribution fix.

## Item 19 — 10 unbooked 'submitted' factoring advances: FUNDING posted, live (RESOLVED)

Source: Lead instruction, round ~52 — Cursor's finding that GL 2150 (Factoring Advance liability)
was understated because 10 advances sat at `status='submitted'` with zero funding (R1b) postings
despite Faro having actually advanced the money. Posted via the existing, unmodified
`postFactoringAdvanceEvent()` (`apps/backend/src/accounting/factoring-posting/poster.service.ts:877`)
for all 10, no funding_figures override (read reserve/fee/cash straight from each advance row's own
already-correct 97%/1.5%/1.5% split — no new math, no invented leg):

```
FAC-2026-00054  face $4,650.00   FAC-2026-00115  face $5,900.00
FAC-2026-00058  face $4,900.00   FAC-2026-00116  face $4,900.00
FAC-2026-00062  face $3,600.00   FAC-2026-00117  face $5,700.00
FAC-2026-00063  face $4,120.00   FAC-2026-00118  face $3,450.00
                                  FAC-2026-00119  face $4,900.00
                                  FAC-2026-00120  face $5,210.00
```

Total face posted: **$47,330.00** — matches Cursor's figure exactly. Aggregate legs across all 10,
live-confirmed: DR GL 1090 (Undeposited Funds) $45,910.10 (97%) / DR GL 1230 (Factoring Reserves)
$709.95 (1.5%) / DR GL 6400 (Factoring Fees) $709.95 (1.5%) / CR GL 2150 (Factoring Advance)
$47,330.00 (face) — balanced, no ACH/wire leg (none was named). Net advance $45,910.10 matches
Cursor's figure exactly. Advance `status` was NOT flipped to `'advanced'` — the poster only posts
GL, and the instruction asked only for the posting, not a status change; flagging this as an open
question rather than inventing a status transition. GL 2150's standing liability balance after
these 10 postings: credits $235,220.00 / debits $164,565.00 / net $70,655.00 (pre-existing credits
of $187,890.00 — matching Cursor's cited figure once the sign convention is reconciled — plus this
round's $47,330.00).

## Item 20 — 9 settlements (5817-5825): NOT a missing source document. RETRACTED and corrected.

**RETRACTED, 2026-09-23 (Lead + owner, same day this item was filed).** The original framing below
("9 settlements have no source document, pull them from AlwaysTrack") was WRONG. Owner correction,
verbatim: AlwaysTrack does not create pre-settlements at all -- it has Invoiced Loads, Unsettled
Loads, and Delivered/Completed Loads. 5817 (and the other 8) "is not ready yet" on AlwaysTrack's
own side because **no AlwaysTrack settlement exists yet to be ready** -- there was never a document
to pull.

**ROOT CAUSE, measured live in the app, not on AlwaysTrack:** all 9
`driver_finance.driver_settlements` rows carrying `source_document_ref` 5817-5825 are EMPTY
SHELLS -- confirmed live (bypass_rls=lucia): **0 settlement_lines and $0.00 net_pay on every one
of the 9**, 6 with no load linked at all, 2 marked `status='closed'` with nothing in them.

```
source_document_ref  display_id    status
5817                 S-2026-5813   closed
5818                 S-2026-5814   closed
5819                 S-2026-5815   open
5820                 S-2026-5816   open
5821                 S-2026-5817   open
5822                 S-2026-5818   open
5823                 S-2026-5819   open
5824                 S-2026-5820   open
5825                 S-2026-5821   open
```

**This is the app's own allocator over-minting settlement numbers AHEAD of any real source -- the
same defect class as the D3 numbering-shift audit, seen from the other end.** D3 found
`source_document_ref` values that were WRONG (pointing at the wrong real document, shifted by the
same-sequence-different-instant race in `allocateNextSettlementSourceDocumentRef`). This is the
SAME allocator handing out 9 numbers to settlement rows with nothing behind them at all -- no
lines, no pay, in some cases no load. Filed as an extension of D3 in
`docs/bus/CC3-89-ROW-SETTLEMENT-NUMBERING-AUDIT-2026-09-23.md`.

**Owner ruling: these 9 rows PURGE and never come back. No document is owed** -- do not chase
AlwaysTrack for them, do not wait on the owner to produce anything for these 9 specifically.

**NEW DESIGN LAW, owner, effective now:** the feeder must NEVER mint a settlement number. A
settlement number exists only once AlwaysTrack has actually settled the load; the app's own
pre-settlement state carries NO `source_document_ref`, ever. A delivered-but-unsettled load gets
an invoice and a driver bill, and explicitly NO settlement row. Guard requirement, owner's own
words: **"a settlement row with zero lines and zero net pay is a build failure."** Named here for
whoever owns `driver_finance.driver_settlements`' creation path (not CC-3's lane --
`settlement-source-document-ref.service.ts` mints the number but does not create the row) to build
the actual guard; not attempted in this pass.

— CC-3, 2026-09-23 (correction, same day as the original filing)

---

## SECOND CORRECTION to Item 20, 2026-09-23 (same day): the owner overrode the retraction above. These 9 rows are legitimate pre-settlements, not over-minted garbage.

**The retraction immediately above this one is ALSO wrong and is corrected here, in place, per
the owner's own direct instruction.** Owner, verbatim: **"5817-25 SHOULD BE PRE SETTLEMENTS IN OUR
APP, SO IT IS NOT INVENTED. WE JUST HAVE TO ASSIGN THEM CORRECT ACCORDING TO LOAD NUMBER OR
SEQUENCE."**

They are **not** the app's allocator over-minting garbage numbers. A pre-settlement is a real,
intentional state this app has and AlwaysTrack does not — money and driver activity the app tracks
*before* AlwaysTrack ever settles a load. That state is legitimate by design.

**Re-verified live** (bypass_rls=lucia) against the actual columns that carry this distinction —
`is_presettlement`, `first_load_number`, `last_load_number` — confirming the owner's own diagnosis
exactly:

```
ref   display_id    status  is_presettlement  first_load  last_load
5817  S-2026-5813   closed  false             (null)      13612
5818  S-2026-5814   closed  false             (null)      (null)
5819  S-2026-5815   open    false             (null)      13601
5820  S-2026-5816   open    false             (null)      (null)
5821  S-2026-5817   open    false             (null)      (null)
5822  S-2026-5818   open    false             (null)      (null)
5823  S-2026-5819   open    false             (null)      (null)
5824  S-2026-5820   open    false             (null)      (null)
5825  S-2026-5821   open    false             (null)      13611
```

**The two real defects, exactly as the owner named them:**
1. **6 of the 9 have NO load assigned at all** (both `first_load_number` and `last_load_number`
   null: 5818, 5820, 5821, 5822, 5823, 5824). The other 3 (5817, 5819, 5825) DO carry a
   `last_load_number` (13612, 13601, 13611 respectively) -- these are not empty of load activity,
   contrary to my prior retraction's "6 with no load at all, 2 closed with nothing in them" count.
2. **All 9 carry a `source_document_ref` in the AlwaysTrack SETTLED-number range (5817-5825) for
   settlements AlwaysTrack has never created.** `is_presettlement=false` on all 9 compounds this --
   the app isn't even flagging them as the pre-settlement state they actually are.

**LAW, owner, effective now:** a pre-settlement carries the app's OWN identifier and its assigned
loads. It picks up a `source_document_ref` ONLY once AlwaysTrack has actually settled it -- never
before, never speculatively. **They purge with everything else in the eventual purge, but the
FEEDER MUST REBUILD PRE-SETTLEMENTS AS A FIRST-CLASS STATE, not skip them** -- assigning them
correctly according to load number or sequence once real load activity data is available.

**Status of this item: OPEN, correctly scoped now.** Not a source-document gap (first retraction),
not a purge-and-forget allocator bug (this document's earlier framing) -- a real pre-settlement
identity/assignment gap the feeder needs to solve as a first-class case. Not built here (feeder
architecture is not a settlement-text-extraction script's scope) -- named for whoever builds the
feeder's pre-settlement rebuild path.

— CC-3, 2026-09-23 (second correction, same day)
