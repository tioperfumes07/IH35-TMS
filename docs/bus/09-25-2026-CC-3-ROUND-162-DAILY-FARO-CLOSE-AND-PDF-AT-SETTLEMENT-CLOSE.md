# ROUND 162 — CC-3 — THE DAILY FARO CLOSE AND THE PDF CHECK AT SETTLEMENT CLOSE. ONE JOB, TWO GUARDS.
Claude Lead, 09-25-2026 10:58 AM CT (15:58Z).

Owner: "this is why i asked to create the loads and reconcile with faro each day... balances would be checked etc reconciled with faro. and when a settlment closed check against the pdf." · "YES".

**Stamp correction:** R-161 is headed 11:00 AM CT (16:00Z). It was written at about 10:55 AM CT.

## Why this job exists, measured
**A.** `~/Downloads/IH35-RECONCILIATION-AND-FEED/02-CONTROLS-AND-GATES/verify-feed-day.mjs`, run live for all 23 days, prints on every day:
`FAIL — live DB mode is not wired yet`.
The day gate never read production, so no Faro day was ever closed through it.

Lead measurement 15:50Z (factoring_advances vs `01-ENGINES/day_control.json` `inv[]`):
- **23/23 days TIE** on invoice count, purchase amount and net advance.
- There are 89 live advances. None is missing, none is duplicated, and none falls outside the 89.
- **Escrow and discount do NOT tie per day on the early days.** For example:
  - 8/10: `reserve_amount_cents` 75.90 vs control escrow 45.00; `factor_fee_cents` 99.10 vs control discount 82.50.
  - 8/12: reserve 25.50 vs escrow 0.
  - 8/18: reserve 57.00 vs escrow 0.
- The wire column has no field on `accounting.factoring_advances`. It must be read from where the funding JE posts it (6300).

**B.** The $250 on 5805/5806/5808/5813/5814 (R-161) closed with net pay ≠ the signed PDF's TOTAL DUE, and nothing refused it.

## Order
1. **Guard A — the day gate, live.**
   - Wire live mode into `verify-feed-day.mjs`. Bring it into the repo as `scripts/verify-feed-day.mjs`; `day_control.json` is the control, and no number is hand-typed.
   - Five columns per day: invoices, purchase, escrow, discount, wire, net_adv.
   - Read them from `accounting.factoring_advances` (keyed on `faro_invoice_number` ∈ that day's `inv[]`) plus the funding JE legs 1230 / 6400 / 6300.
   - Run it for all 23 days and paste the table.
   - Any day OFF: name the column and the exact cause, **read from the Faro files** (`01-FARO/PURCHASE REPORT ALL.csv`, `funds due report 09-21-26.csv`, `faro_canonical_purchases.csv`). Report the cause to CC-1, who owns the books. **Do not fix money yourself.**
   - Wire the guard into `scripts/verify-steps/`.
2. **Guard B — PDF at close.**
   - In `apps/backend/src/driver-finance/settlement-payrun-close.service.ts`, `closeSettlementPayRun` refuses to close when the settlement has a `source_document_ref` and its computed net pay ≠ that document's TOTAL DUE.
   - TOTAL DUE is parsed from `03-SOURCE-DOCUMENTS/settlement-text/Driver_Settlement_<ref>.txt`, or stored on the settlement at feed time. Choose one and cite it.
   - The refusal names the settlement, both numbers and the delta.
   - Add a static guard, `scripts/verify-settlement-net-equals-document.mjs`, that asserts this over every USMCA settlement with a document ref.
   - It must fail today on 5805/5806/5808/5813/5814 until CC-1's R-161 lands. **That is the planted-red proof.**
3. **Scope.**
   - One PR per guard, FAST-MERGE when all three gates exit 0.
   - Nothing else: no data writes, no other lane. LAW 5 stays held on its branch and merges when the gates go green.

## Deadlines and surrender
- Guard A: **18:00Z**.
- Guard B: **19:30Z**.
- A miss goes to the **Lead**.

DONE line format:
`CC-3 | R-162 A|B DONE | <sha> | <the 23-day table / the refusal output> | NEXT`
