# Faro reconciling-item register — USMCA

Live, queryable artifact. Every reconciling item here is either **RESOLVED** (with the live proof
that closed it) or **OPEN** (named, with the exact gap stated — never plugged, never netted away).
Append-only in spirit: a resolved item's row is updated with its resolution, not deleted; nothing
here is silently dropped.

| # | Item | Amount | Status | Detail |
|---|---|---|---|---|
| 1 | Escrow/fee recognition, 6 closed Faro invoices | $143.63 ($8.22 fee / $135.41 rebate) | **RESOLVED** | See below. |
| 2 | `FARO-092` → load 13613 | n/a (link) | **OPEN — EVIDENCE NOT ON FILE** | Posted to `docs/bus/OUTBOX-CC-1.md`; `docs/reconciliation/2026-09-22-44-missing-loads-register.md`. |
| 3 | `FARO-049` → load 13567 | n/a (link) | **OPEN — EVIDENCE NOT ON FILE** | Same as above. |
| 4 | `factoring_reserve_movements` gap | $428.87 | **OPEN — not plugged** | 110 rows / $5,094.47 held vs. escrow $4,530.19 + cash $135.41 = $4,665.60. Root cause not yet found. |
| 5 | 8 direct disbursement legs | $35,730.00 | **OPEN — source data needed** | Owner-cited total; no line-level detail (amount/date/Faro note per leg) found in this repo or this session's own docs. Asked the owner to re-supply before posting anything. |
| 6 | 5 reserve deposits | $28,489.00 | **OPEN — source data needed** | Same gap as #5 — cited as a total, no per-deposit detail available to build from. |
| 7 | 5 self-carried invoices | $12,592.40 open | **OPEN — under investigation** | |

## Item 1 — Escrow/fee recognition, 6 closed Faro invoices (RESOLVED)

**Source:** owner-cited from Faro's own reserve/funds-due report (external document — the
$8.22/$135.41 split is not derivable from `factor.faro_invoice_lines`; verified independently that
no field separates them). The $143.63 anchor **is** independently re-derivable and was, live,
twice: it is the sum of `fee_amount_cents` across exactly the 6 rows in the scoped statement where
`reserve_amount_cents = 0` (every other row has `reserve_amount_cents = fee_amount_cents`) —
`13512, 13513, 13524, FARO-003, FARO-011, INV-2026-00007`.

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
