# CURSOR — ROUND 180 — THE FARO MATCH KEY IS SOLVED. MATCH THE EASY ONES NOW.
2026-09-28, Laredo Central. Lead. Owner: *"just match all those that can match instantly with ease,
the rest I can match, make sure the RESOLVE section is fully wired and working."*

## STOP REVERSE-ENGINEERING DIFFERENCES. THE BREAKDOWN ALREADY EXISTS.
`~/Downloads/FARO-PAYMENTS TO YOU REPORT.csv` — 117 rows, columns:
`Debtor, Inv, PO/Ref, Payment, Deposit, Date, Pmt Type, Pmt Ref`.

**Group by Date. `sum(Payment) − sum(Deposit) = NET WIRED` = the bank line.** Each row inside names
the invoice. That is the whole match, computed, not guessed.

**Owner correction, accepted: the deposits are NOT reserve releases. They are `Rsv Deposit` rows —
Faro holding money back into reserve.** `~/Downloads/09-25-26 RESERVE REPORT.csv` names every one.

## COMPUTED LIVE — THESE MATCH THE BANK EXACTLY. ACCEPT THEM NOW, NO REVIEW NEEDED.
| Date | Payments | Deposits | **Net wired** | Bank line | Inv |
|---|---|---|---|---|---|
| 08/10 | 5,325.00 | — | **5,325.00** | ✅ | 2 |
| 08/11 | 3,482.00 | — | **3,482.00** | ✅ | 1 |
| 08/12 | 3,288.00 | 1,649.00 | **1,639.00** | ✅ | 3 |
| 08/17 | 6,877.00 | — | **6,877.00** | ✅ | 2 |
| 08/18 | 3,676.00 | — | **3,676.00** | ✅ | 1 |
| 08/19 | 6,392.00 | — | **6,392.00** | ✅ | 2 |
| 08/21 | 16,383.00 | — | **16,383.00** | ✅ | 5 |
| 08/24 | 3,967.00 | — | **3,967.00** | ✅ | 2 |
| 08/26 | 2,997.00 | — | **2,997.00** | ✅ | 2 |
| 08/28 | 26,083.00 | 5,000.00 | **21,083.00** | ✅ | 8 |
| 08/31 | 13,473.00 | — | **13,473.00** | ✅ | 4 |
| 09/01 | 14,200.50 | — | **14,200.50** | ✅ | 4 |
| 09/03 | 10,466.00 | — | **10,466.00** | ✅ | 6 |
| 09/04 | 16,785.54 | — | **16,785.54** | ✅ | 4 |
| 09/08 | 23,182.70 | 11,840.00 | **11,342.70** | ✅ | 6 |
| 09/10 | 2,997.00 | — | **2,997.00** | ✅ | 2 |
| 09/11 | 32,097.00 | — | **32,097.00** | ✅ | 7 |
| 09/14 | 29,836.90 | 8,000.00 | **21,836.90** | ✅ | 7 |
| 09/17 | 7,653.00 | 2,000.00 | **5,653.00** | ✅ | 3 |
| 09/18 | 27,441.00 | — | **27,441.00** | ✅ | 7 |
| 09/24 | 18,633.12 | 3,000.00 | **15,633.12** | ✅ | 5 |
| 09/25 | 26,121.50 | 2,000.00 | **24,121.50** | ✅ split across bank wires 19,960.50 + 4,161.00 | 6 |

**22 of 25 dates. ~94 invoices. Accept these automatically — the arithmetic is exact.**
09/25 is a legitimate two-wire day; the pair sums to the net. Handle it, do not skip it.

## THE THREE FOR THE OWNER'S RESOLVE SCREEN — DO NOT GUESS THESE
| Date | Net wired (Faro) | Bank line | Unexplained |
|---|---|---|---|
| 08/13 | 5,470.50 | 3,670.50 | **1,800.00** |
| 08/14 | 9,811.24 | 4,370.24 | **5,441.00** |
| 09/21 | 33,909.39 | 27,773.98 | **6,135.41** |

Note 09/21 already contains three reserve movements in the report — `Rsv Deposit ajuste ccg 4,000.00`,
`Client Payable Ajuste a Reserva Negativa IH35 4,135.41`, `Client Payable Pago Reserva Negativa IH35
2,000.00`. Surface all three in Resolve and let the owner pick. **Do not net them yourself.**

Also standalone, present them as their own rows: **09/02 Client Payable 5,000.00**, **09/09 Client
Payable 11,840.00**, **09/15 Client Payable 8,000.00**, and the **09/03 $10,000.00** bank wire.

## JOB 1 — AUTO-ACCEPT THE 22. Batch ref `FARO-YYYY-MM-DD` is already written in production by Lead
(95 advances, 25 real batches — was 143 fake per-row refs). Write `banking.reconciliation_matches`,
set the bank row's matched column, post the clearing entry, mark the advances funded, reserve
deposits to the reserve account, fees to fees. Reversible via the Round 175 reinstate engine.

## JOB 2 — **THE RESOLVE SECTION. FULLY WIRED. THIS IS THE OWNER'S PRIORITY.**
For any bank line that does not auto-accept, Resolve must let the owner finish it by hand:
- Bank line on one side; candidate documents on the other, ranked, **multi-select**.
- **Running remainder visible at all times**, recalculating on every pick, re-ranking the rest.
- Remainder classified from a real list — Reserve Deposit, Client Payable, Discount Fee, Wire Fee,
  Schedule Fee, Chargeback — each posting to its own account. **Never a generic "adjustment".**
- Accept is disabled until remainder is **zero or every part is named**.
- Everything the owner resolves is reversible and leaves an audit row.
- It must load the Faro statement lines beside the bank line so he can see what Faro says.

**Resolve working is worth more than another 50 auto-matches. Build it properly.**

## GUARDS
`verify-faro-net-wired-equals-bank-line.mjs` · `verify-match-remainder-is-zero-or-named.mjs` ·
`verify-bank-match-has-clearing-entry.mjs` · `verify-match-is-reversible.mjs`

## PROOF
`banking.reconciliation_matches` off zero with the 22 accepted, pasted. Resolve open in Chrome on
08/13 showing the 1,800.00 remainder unresolved and the classification list. Guards exit 0.
