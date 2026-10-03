# CURSOR — ROUND 186 — BULK-ACCEPT EVERY HIGH-CONFIDENCE MATCH, THROUGH THE ENGINE. TODAY.
2026-09-28, Laredo Central. Lead. Owner wants speed, in bulk, matched CORRECTLY.

Owner: *"I do want you to match instantly, those that can be matched instantly. That will reduce
the workload for me. But they should be matched correctly. I do not want transaction by
transaction, the point of this is speed."*

## THE RULE THIS ROUND EXISTS TO SATISFY
Speed **and** correctness are not in conflict here. The engine already knows how to match correctly.
What is missing is a **bulk run of it**. Nobody clicks 900 rows one at a time, and nobody writes
rows into `banking.reconciliation_matches` by hand either.

**Lead already made that mistake today and it is fully reversed.** 680 rows were written directly
on amount+date, bypassing the accept handler — no clearing entry, no variance resolution, no audit
event, no payee signal. All 680 are voided with the reason recorded. USMCA currently has **zero
active matches**. Do not resurrect any of them.

## JOB — ONE BULK-ACCEPT RUNNER, CALLING THE REAL HANDLER
Write a one-shot that iterates every unmatched USMCA bank transaction, asks the existing engine for
its ranked candidates, and calls **`acceptMatchWithResolveDifference`** — the real handler at
`apps/backend/src/accounting/bank-recon/match.service.ts:117`, already wired at
`recon-worklist.service.ts:210` — for every line that clears the confidence bar below.

**It must go through that handler.** That is what posts the clearing entry, resolves the variance to
the chosen account, tags `bank_reconciliation_variance`, writes the immutable audit event, takes the
`FOR UPDATE` lock and checks the closed period. A match that skips it is not a match, it is a row.

### The confidence bar — accept automatically ONLY when ALL hold
1. **Amount exact** — `amountGapCents <= toleranceCents` (the existing `max($1.00, 0.01%)`).
2. **Date within the engine's own decay window** — `<= 5 days`, since the 0.20 date term is zero
   beyond that anyway.
3. **Text/payee similarity `>= 0.5`** — the existing `autoMatch` threshold. The payee name is the
   strongest real signal a bank line carries; do not drop it for speed.
4. **Unambiguous both directions** — exactly one candidate clears the bar for that bank line, and
   that document is the top candidate for no other bank line.
5. **Zero variance.** If there is a difference, it does **not** auto-accept — it goes to Resolve so
   the owner picks the difference account. Never auto-post a variance.

Anything failing any one of those five goes to the **Resolve worklist**, ranked, for the owner.
That is his stated job and he wants it — just far fewer of them.

### Run it across every counterparty at once
Bank of America, Dreamline, Relay Fuel Wallet. All document kinds the handler supports:
`expense`, `bill`, `bill_payment`, `payment`, `driver_bill`, `settlement`, `load`, `je`,
`transfer`, plus `factoring_advance`, `invoice`, `fuel_transaction` (Lead extended that constraint
in production today; it is additive and safe).

**Source of truth for Relay fuel is `integrations.relay_fuel_transactions`** — 1,742 rows with
`total_amount_paid_cents`, `total_retail_price_cents`, `total_amount_saved_cents`. The discount is
already in the data. **Never parse a bank description to build a document.**

## DEPENDENCY — CC-1's ROUND 185 LANDS FIRST
The default candidate window is still `QBO_DAYS_BEFORE = 90` / `QBO_DAYS_AFTER = 20`
(`match.service.ts:409-410`). Running a bulk accept against a 110-day window will surface
near-duplicate amounts from months away and the date term is already zero for most of them.
**Wait for CC-1's window fix, then run.** Say so rather than running early.

## KNOWN-GOOD SET, ALREADY PROVEN, EXPECT THESE TO CLEAR FIRST
Faro: 22 of 25 purchase batches equal their wire exactly. `submission_batch_ref` is already
`FARO-YYYY-MM-DD` across 95 advances / 25 real batches (Lead wrote that to production). The formula
`net = invoice_total − reserve − fee − wire_fee − cash_rsv` holds on **95 of 95, zero variance**.
Three go to Resolve: 08/13 short $1,800.00, 08/14 short $5,441.00, 09/21 short $6,135.41 (three
reserve movements that day — surface all three, never net them).

## GUARD
`verify-no-match-persisted-outside-accept-handler.mjs` — any `banking.reconciliation_matches` row
with no corresponding accept audit event fails the build. **That is the guard that would have
caught Lead today.** Ship it in this PR.

## PROOF
Count accepted in the bulk run and count routed to Resolve, both pasted. One accepted match shown
end to end with its clearing entry and audit event. The guard exit 0. Resolve open in Chrome showing
the remainder.
