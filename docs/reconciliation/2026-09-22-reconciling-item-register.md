# Faro reconciling-item register — USMCA

Live, queryable artifact. Every reconciling item here is either **RESOLVED** (with the live proof
that closed it) or **OPEN** (named, with the exact gap stated — never plugged, never netted away).
Append-only in spirit: a resolved item's row is updated with its resolution, not deleted; nothing
here is silently dropped.

| # | Item | Amount | Status | Detail |
|---|---|---|---|---|
| 1 | Escrow/fee recognition, 6 closed Faro invoices | $143.63 ($8.22 fee / $135.41 rebate) | **RESOLVED** | See below. Source now confirmed: `docs/reconciliation/2026-09-22-RESERVE-REPORT.csv`. |
| 2 | `FARO-092` → load 13613 | n/a (link) | **OPEN — EVIDENCE NOT ON FILE** | Posted to `docs/bus/OUTBOX-CC-1.md`; `docs/reconciliation/2026-09-22-44-missing-loads-register.md`. |
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
