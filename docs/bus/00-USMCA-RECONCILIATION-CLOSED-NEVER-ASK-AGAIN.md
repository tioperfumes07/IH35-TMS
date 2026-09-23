# USMCA / Faro Reconciliation — CLOSED, 2026-09-22. NEVER ASK AGAIN.

**Owner order: "SAVED SO NOBODY ASKS AGAIN."** These nine figures are LAW — enforced by
`scripts/verify-reconciliation-constants.mjs` (wired into `money-pr-local-gate.mjs`, runs on every
push). Machine-readable copy: `data/reconciliation/usmca-reconciliation-closed-2026-09-22.json`.
Mirrored to `docs/bus/`. Any code, seed, fixture or doc that contradicts one of these nine numbers
is a build failure — that is the point of the guard.

## THE NINE LAW FIGURES

| # | figure | amount | identity/source |
|---|---|---|---|
| 1 | purchases | $311,587.00 | Faro 23-day feed control sheet, all 89 purchase rows, 8/10–9/21 |
| 2 | AR | $298,762.00 | purchases − receipts (below) |
| 3 | receipts | $12,825.00 | Faro payments received against those purchases |
| 4 | discount fee | $4,673.82 | Faro Account Summary, "Discount Fee" |
| 5 | wire fee | $220.00 | Faro Account Summary, "Wire Fee" |
| 6 | schedule fee | $8.22 | Faro Account Summary, "Schedule Fee" |
| 7 | escrow @9/21 | $4,530.19 | Faro Escrow Reserve, Account Summary ending column |
| 8 | cash reserve @9/21 THE CONTROL | $4,135.41 | Faro Account Summary, "Cash Reserve" ending column |
| 9 | realized fees | $4,902.04 | discount + wire + schedule, realized to date |
| — | self-carried open | $12,592.40 | 5 real unfactored, unvoided invoices, $0.00 paid on any |

**IDENTITY (asserted by the guard, must hold exactly):**
purchases $311,587.00 − receipts $12,825.00 = AR $298,762.00.

**SELF-CARRIED OPEN — CORRECTED, 5 NOT 16 (2026-09-23, Round E11.2).** 16 came from re-deriving off
`factoring_advance_id IS NULL` — the exact error `docs/bus/INBOX-CC-1.md` already names as producing
$51,262.41 against the true $12,592.40. `factoring_status` is the real column. The 5 real documents:

| document | customer |
|---|---|
| 009 | FLS |
| 010 | Supply Chain Mgmt |
| 026 | IM Specialized |
| 055 / 13555 | 2EMS |
| 074 / 13593 | Alligator |

13593 (074/Alligator) is **not invoiceable** — deadhead, per LEAD-RULING-ROUND-56. **5 documents,
4 invoiceable.**

## CASH RESERVE @9/21 — CORRECTED, FOUR NUMBERS NOT ONE (2026-09-22, same day)

Cursor caught a real defect in the Lead's first pass: cash reserve @9/21 was framed as ONE number.
It is genuinely **four** numbers, one per moment/movement, and conflating them was wrong. Only
the one marked **THE CONTROL** above ($4,135.41) is LAW — it is Faro's own statement ending
balance, matched exactly against `ACCOUNT SUMMARY.csv`'s ending column (the same file's beginning
column reads 0 on every row, including this one — that is the running-balance convention, not a
second reading of this figure). The other three are real, sourced, and informational — carried
here for the record, never asserted by the guard:

| when | amount | source |
|---|---|---|
| before the ajuste-ccg deposit | $135.41 | `01-FARO RESERVE REPORT` |
| **Faro statement ending balance — THE CONTROL** | **$4,135.41** | `ACCOUNT SUMMARY.csv`, row "Cash Reserve,0,4135.41", ending column |
| after the same-day sweep to IH 35 | $0.00 | `09-21-26-reserves report` |
| on 9/22 after the JERUE release | $16.50 | 9/22 movement, JERUE release |

Why the control is $4,135.41 and not $135.41: `funds due report 09-21-26.csv`'s last line is
"($4,000.00) Wire" — the 9/21 reserve deposit withheld from funds due. $135.41 + $4,000.00 =
$4,135.41, tying the pre-deposit balance forward to the statement's own ending figure. The escrow
figure above (row 7, $4,530.19) is read from the same Account Summary ending column, same
convention.

## WHERE THIS CAME FROM

`docs/bus/09-22-2026-FARO-23-DAY-FEED-CONTROL-SHEET.txt` — 23 close days, 89 invoice numbers,
every one of the five control columns (purchase / escrow / discount / wire / net advance) tied
exactly, built from `PURCHASE REPORT ALL.csv` + `FUNDS DUE 09-21-26.csv`. Total purchases
$311,587.00, escrow $4,530.19, discount $4,673.82, wire $220.00, net advance $302,019.36. Net
advance $302,019.36 − the $4,000.00 reserve line on Funds Due = $298,019.36 = Account Summary's
own "Payments to You" — the fourth independent tie confirming these figures are read correctly,
not curve-fit.

## RED-BEFORE-GREEN PROOF

Change one constant (e.g. `purchases_cents` off by 100), run
`node scripts/verify-reconciliation-constants.mjs`, watch it FAIL naming the exact figure and the
expected-vs-actual dollar amounts. Restore, run again, watch it PASS. Same for the doc: change one
printed dollar figure in this file, run the guard, watch it fail naming this file; restore, watch
it pass. `--selftest` exercises the same two pure functions (`checkAgainstLaw`, `checkIdentity`)
against synthetic mutations with no file I/O, so the comparison logic itself is independently
provable.
