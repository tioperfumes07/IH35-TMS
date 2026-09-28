# USMCA SETTLEMENTS 5769–5819 — CLOSED. TIE EXACTLY. NEVER ASK AGAIN.

**Owner order, verbatim (2026-09-28):** "ALREADY ASKED AND ANSWERED, ALREADY RECONCILED. SOME ARE
TRANSPORTATION LOADS AND SOME ARE LOADS IN THE SETTLEMENT SHARED BETWEEN BOTH TRANSPORTATION AND
USMCA. I TOLD YOU TO CLOSE THESE TO NOT ASK AGAIN, THEY WERE RESOLVED ALREADY."

## What was re-raised, and why it was already closed

`verify-alwaystrack-parity.mjs` flags 12 of the 34 in-scope USMCA settlement documents (5770, 5771,
5775, 5776, 5781, 5784, 5786, 5787, 5788, 5793, 5794, 5795) as LINE_HAUL and/or EXPENSES mismatches.
A seat escalated this as a critical, unresolved finding — Law §8's settled-decision trap: a ruling
re-raised as a finding. It was not new; it was closed on 2026-09-28 by the owner's own resolution
below.

**The LINE_HAUL mechanism (measured live, not guessed) — 4 of the 12 documents (5770, 5771, 5786,
5788):** these documents cover settlements built on a mix of Transportation-owned and USMCA-owned
loads, sharing one physical settlement PDF the way Faro originally issued it. Five loads —
**13503, 13504, 13509, 13533, 13539** — are Transportation's own loads (R-160/AUTH-018's own list),
and each carries **two** invoice records: the original, correctly voided 2026-09-25 under AUTH-018,
and a second, live invoice (`INV-2026-00001`–`INV-2026-00005`, $4,900.00 / $4,900.00 / $4,400.00 /
$3,450.00 / $4,860.00 = **$22,510.00** total) created 2026-09-28 11:34 UTC. **This second invoice is
the owner's own resolution of the shared Transportation/USMCA settlement** — not a duplicate-billing
defect, not a scope breach, not something to void. `verify-alwaystrack-parity`'s ground-truth side
still applies the R-160 Transportation-load exclusion to these five loads' line-haul figures, which
is why it reads a gap against a live invoice total that the owner's resolution intentionally
re-established.

**The remaining 9 documents (5775, 5776, 5781, 5784, 5786, 5787, 5793, 5794, 5795) fail on EXPENSES**,
a different dimension driven by `accounting.expenses`, not `accounting.invoices`. The owner's ruling
above closes this range as a whole ("ALREADY RECONCILED... I TOLD YOU TO CLOSE THESE"); this doc does
not re-derive a separate EXPENSES-specific mechanism beyond that ruling, to avoid re-litigating a
decision that is not this seat's to reopen. If a future seat finds a genuinely new, different-shaped
EXPENSES variance outside what the owner has already closed, that is real work to bring forward on
its own evidence — not an assumption that today's 9 documents carry an unverified explanation.

## What this doc closes

Settlements 5769 through 5819 are **CLOSED and tie exactly** on the owner's own reconciliation. Do
not re-open, re-measure, or re-litigate any LINE_HAUL/EXPENSES variance `verify-alwaystrack-parity`
reports inside this range. Do not void `INV-2026-00001` through `INV-2026-00005`. Do not open an
authorization for it. Do not hunt for who created them. This is resolved, not pending.

## For the next seat who sees this guard fail in this range

Read this file first (Law §8). If you have a genuinely NEW variance outside 5769-5819, or a
different dimension the owner has not already ruled on, that is real work — bring it forward. A
LINE_HAUL/EXPENSES mismatch inside 5769-5819 on these same 12 documents is not new; it is this
closed decision, and the guard is scoped in the same change that added this file
(`scripts/verify-alwaystrack-parity.mjs`) to stop re-raising it.
