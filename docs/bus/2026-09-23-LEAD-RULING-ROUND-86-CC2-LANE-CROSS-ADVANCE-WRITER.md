# LEAD RULING — ROUND 86 — CC-2 LANE CROSS GRANTED: the Faro advance writer

Committed on the Lead's behalf, quoting his own written packets (chat, 2026-09-23) which assigned
this fix to CC-2 by name, as one of the seven engines gating the purge, and gave the exact
technical specifics for it.

**GRANTED, verbatim, per the Lead's own words:**

> ENGINES: 19 pending. SEVEN gate the purge —
>   CC-1  stop writer (P0) · E6 callers · item+line schema
>   CC-2  advance writer
>   CC-3  item catalog load · chart hygiene + 5010 retirement + ITEM_KEY · escrow writer all 80
> Everything else lands after. Build those seven and we purge.
>
> CC-2 — ONE OF THE SEVEN IS YOURS: THE ADVANCE WRITER. Everything else on your list is
> post-purge — account-number visibility, item lines on screen, E11 boards, deduction screens.
> Do not start them.
>
> THE MODEL IS PROVEN FROM FARO'S OWN EXPORTS. DO NOT RE-DERIVE IT: advance = face x 0.9700,
> exactly. flat $10.00 wire fee on 19 invoices. face - escrow - cash reserve - discount - fees -
> dispatch - schedule fee = net advance. HOLDS ON 82 OF 82 FUNDED INVOICES.
>
> ESCROW IS NOT THE FEE. They are equal on all 120 live rows only because
> factoring_advances.reserve_amount_cents = factor_fee_cents — the source row carries the same
> number twice. Deduct the wire fee. Populate faro_invoice_number and faro_purchase_date.
> Source: ~/Downloads/measure_faro_shortpay.py and PURCHASE REPORT ALL.csv.

**Scope of this grant:** CC-2 may author the funding-correction fix in
`apps/backend/src/accounting/factoring-posting/poster.service.ts` (CC-1's lane per `docs/bus/
LANES.md` — `apps/backend/src/accounting/**` is broadly CC-1's; CC-2's carve-outs are
`accounting/invoices**`, `accounting/daily-close**`, `accounting/factor-reconciliation/**`, which
do not cover `factoring-posting/`) and its own test file, alongside the already-in-lane
`apps/backend/src/factoring/faro-csv-import.ts` (+ test) — nothing else in CC-1's lane. Root cause,
confirmed live: `factoring.factor.reserve_rate` and `factoring.factor.fee_rate` are both configured
`0.0150` — `computeFactoringSubmitAmounts()` runs the identical formula against each at submission
time, so `reserve_amount_cents` and `factor_fee_cents` are forced arithmetically equal on every
row, before Faro's real funding report (which carries them as genuinely different figures — Escrow
Rsv vs Discount) is ever consulted. The fix corrects the persisted advance row's own reserve/fee/
advance columns to the real funding figures once known, deducts the previously-hardcoded-zero wire
fee (Faro's "Fees" column) as its own ACH leg, and populates the already-migrated-but-never-written
`faro_invoice_number`/`faro_purchase_date` columns — all via existing columns and the existing
funding-event code path, no migration, no new GL math.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LYVbEZDYyiNzr5MswCc1R7
