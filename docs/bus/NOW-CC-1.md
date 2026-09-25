# ROUND 187 acknowledged — CC-1 — 2026-09-25 5:07 PM CT (22:07Z). Deadline 09-26 04:00 UTC (ROUND 187).
Prior content archived: `docs/bus/archive/NOW-CC-1-2026-09-25-27.md` (WORM).

## R-159 (item B / G4) — BLOCKED, holding for a decision (AUTH-035)
DRY_RUN validated all 21 target rows cleanly. Before trusting the batch, ran ONE real row
(FAC-2026-00001) to test the write path. Found and fixed the expected SET-ROLE gap
(ACCT-F2026092585: added `postFactoringAdvanceEventInClientTx` +
`postFactoringDefaultInterestAccrualEventInClientTx`, mirroring the existing
`reverseFactoringAdvanceEventInClientTx` precedent — tsc clean, 86/86 existing factoring tests
still pass, no existing caller touched). But past that gap, the re-post itself refused with
`gate=already_posted` — confirmed live this is NOT a bug, it's how the engine is built:
`accounting.factoring_lifecycle_posting_keys` claims a (advance, source_type, event_key) tuple
PERMANENTLY; a reversal (reverse-not-flip: original JE stays `status=posted` forever, only a new
linked reversing JE is created) never releases that claim. There is no supported path, for any
caller, to re-post a corrected funding JE under the same "funding" event_key once claimed.
`repairAlreadyPostedLifecycle` (the "already_posted" gate's repair path) won't help either — it
only re-links an EXISTING JE whose shape already matches, it refuses on a shape mismatch rather
than amend amounts.

Everything rolled back atomically — confirmed live after: JE 60fcca1a-95f8-48be-b8dd-5c1d6dd3a338
still `status=posted`, `reversed_by_je_id=NULL`, completely unchanged. Zero side effects.

This means Lead's own instruction ("through the factoring engine's own void/re-post path... no new
writer, no hand-written JE") cannot be carried out as written. Recommendation, HOLDING for a
decision rather than executing: a small manual reclass JE per advance (Dr 6300 $10.00 / Cr 6400
$10.00, memo naming the display_id) — same net GL effect, doesn't touch the funding JE or its
posting-key claim, but IS technically a new hand-written JE, which is why it's not run under
AUTH-035 without a call first. Full detail in AUTH-035's own BLOCKED note
(docs/bus/OWNER-AUTHORIZATIONS.md).

## ROUND 185 (driver reimbursement one-cost-model) and ROUND 187 (real Aug+Sep gap) — read, not yet started
Both orders read. Per Lead's own stated order ("R-159 (G4) → G1–G6 → R-185 → rest of September"),
starting G1-G6 (ROUND 187) next while R-159's reclass-JE question is open — not idle-waiting on it.
Will not touch banking.bank_transactions per ROUND 187 §0's hard rule, and will re-read §0 twice as
instructed before creating anything.

## AUTH-030 (Lead, September cash advances) and prior sections — still holds, no change
Baseline (7 gates PASS, parity 34/34), AUTH-033 withdrawal, ACCT-F2026092583/584 fixes — all as
posted earlier today, unchanged.

CC-1 | 5:07 PM CT (22:07Z) | R-159 blocked on a real engine-design finding, not a credential issue;
recommendation posted, holding for a call. Moving into ROUND 187's G1-G6 now per the stated order.
