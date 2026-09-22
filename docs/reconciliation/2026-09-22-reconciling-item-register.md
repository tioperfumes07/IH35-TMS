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
| 4 | `factoring_reserve_movements` gap | $428.87 | **OPEN — not plugged** | 110 rows / $5,094.47 held vs. escrow $4,530.19 + cash $135.41 = $4,665.60. Partial root cause found (item 4 below); re-derivation against `RESERVE REPORT.csv`'s 18 rows in progress. |
| 5 | 8 direct disbursement legs | $35,730.00 | **OPEN — source data received, not yet posted** | See item 5 below — 8 line items identified in `docs/reconciliation/2026-09-22-PAYMENTS-TO-USMCA-FROM-FARO.csv`, ties exactly. |
| 6 | 5 reserve deposits | $28,489.00 | **OPEN — source data received, not yet posted** | See item 6 below — includes the $1,649.00 overlap with item 5, one movement not two. |
| 7 | 5 self-carried invoices | $12,592.40 open | **OPEN — under investigation** | |
| 8 | Invoice 13524 Faro-vs-face variance | $400.00 | **RESOLVED** | Voided predecessor invoice; live replacement `INV-2026-00008` ties Faro's gross exactly. `accounting.invoice_disputes` dea42eed-6f25-4cf5-b0ff-ce2ea0ceec9a. |
| 9 | Invoice 13587 (Key Global) under-billing | $120.00 | **OPEN** | Proforma not yet finalized at Faro's $4,120.00. `accounting.invoice_disputes` 08a6227a-3eaf-47d8-9e80-0905fe0b4a85. |
| 10 | Invoice 13579 — **REAL CASH EXPOSURE** | $5,210.00 | **OPEN — flagged loudly** | See item 7 below. `accounting.invoice_disputes` 80a9a5fa-e2f9-48c0-b921-096eeb956461. Faro advanced $5,053.70 real cash; no live invoice exists on our side. Repurchase-vs-reissue determination needs the rate confirmation/Faro statement — not guessed. |

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

## Item 5 — 8 direct disbursement legs, $35,730.00 (source confirmed, ties exactly, not yet posted)

Source: `docs/reconciliation/2026-09-22-PAYMENTS-TO-USMCA-FROM-FARO.csv` (95 rows), filtered to
`Pmt Type = 'Faro Internal Transfer'` (9 rows, 8 carrying an amount):

| Date | Amount | Pmt Ref (memo) |
|---|---|---|
| 9/21/26 | $2,000.00 | Pago Reserva Negativa IH35 |
| 9/15/26 | $8,000.00 | Pago a Reserva Negativa IH35 09/15/26 |
| 9/9/26 | $11,840.00 | Pago a IH35 Reserva Negativa - Facturas Larralde Transport pagadas a ellos directamente |
| 9/2/26 | $5,000.00 | USMCA Reserve to IH 35 Reserve |
| 8/14/26 | $688.00 | Transfer to IH35 neg res 08/14/26 |
| 8/14/26 | $4,753.00 | Transfer to IH35 neg res 08/14/26 |
| 8/13/26 | $1,800.00 | USMCA Internal Transfer IH35 08/13/26 |
| 8/12/26 | $1,649.00 | Internal Transfer to IH35 Reserves 08/12/26 |

Sum ties exactly: $35,730.00. **Not yet posted to the GL** — the exact account treatment (these are
internal reallocations within the Faro relationship, not a wire into IH35's own bank account; per
`RESERVE REPORT.csv`'s own paired structure, each "Rsv Deposit" is shortly followed by a matching
"Client Payable" transfer of the identical amount, meaning these largely net to zero *inside
Faro's own reserve tracking* while the real effect is on a separate "IH35 Reserve" bucket this
repo's schema doesn't yet name) needs confirmation before posting, not a guess.

## Item 6 — 5 reserve deposits, $28,489.00 (source confirmed, ties exactly, not yet posted)

Source: same file, `Pmt Type = 'Wire'`/`Deposit` rows tagged "Rsv Deposit":

| Date | Amount | Pmt Ref (memo) |
|---|---|---|
| 8/28/26 | $5,000.00 | USMCA Tank 08/28/2026 (Rsv Deposit — pago ccg) |
| 9/8/26 | $11,840.00 | USMCA Tank 09/08/2026 (Rsv Deposit — Dinero en HOLD por facuras de Larralde) |
| 9/14/26 | $8,000.00 | USMCA Tank 09/14/2026 (Rsv Deposit — Ajuste reserva negativa ih35) |
| 9/17/26 | $2,000.00 | USMCA Tank 09/17/2026 (Rsv Deposit — Deposit to negative reserve IH35) |
| 8/12/26 | $1,649.00 | Internal Transfer to IH35 Reserves 08/12/26 — **same movement as item 5's last row** |

Sum ties exactly: $28,489.00. **The 8/12/26 $1,649.00 row is the identical movement listed in item
5** — one internal transfer, recorded on both sides (out of USMCA's available reserve, into the
IH35 reserve) in the source file. **Post it once, with both sides, not twice** — posting it twice
would overstate both totals by $1,649.00 and worsen the $428.87 hunt, exactly as flagged. Total
unique movement across items 5+6: $35,730.00 + $28,489.00 − $1,649.00 = **$62,570.00**.

## Item 7 — Invoice 13579, real cash exposure (OPEN, flagged loudly)

See `docs/bus/OUTBOX-CC-2.md`, 2026-09-22 P0 entry, for the full account. Summary: Faro advanced
$5,053.70 real cash (invoice #59, Refrigerx, gross $5,210.00, due 09/08/2026) against load 13579,
whose only matching invoice record (`accounting.invoices` display_id `13579`) is voided at $0.00
with no replacement ever created. The load↔Faro-purchase link is verified correct (load's own
`customer_wo_number` `1013272-2` matches Faro's PO exactly) — this is not a mismatch, it is a real
receivable Faro purchased that does not exist as a live document on our side.
`accounting.invoice_disputes` `80a9a5fa-e2f9-48c0-b921-096eeb956461`, status `open`. **Not
resolved as repurchase-obligation or wrong-void** — that determination needs the rate confirmation
and/or Faro's own per-invoice statement, not guessed here.
