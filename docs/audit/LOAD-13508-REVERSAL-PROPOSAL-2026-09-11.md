# PROPOSAL (NOT EXECUTED) — Load 13508 deduction misattribution: audited reversal design

**Status: awaiting owner sign-off in chat. Nothing below has been applied. No code, SQL, or JE has
been written or run.** This is item 3 of the owner's "THREE ITEMS" order (2026-09-11): "DO NOT
touch it without explicit owner sign-off in chat first — prepare the exact audited-reversal
proposal... and post it for owner review."

## Correction to the original finding

The owner's framing said the two lines sit on "a different driver's CLOSED settlement." Live-verified
this is **not correct** — both settlements belong to the **same driver**, ANGEL ALFONSO SOSA
(`fba21d80-628b-4228-ae54-336f9cbb73b6`). The real defect is a **wrong-tour assignment within one
driver's own settlement history**, not a cross-driver misattribution. Also: live investigation found
**more than the 2 lines originally flagged** — a related, deeper backfill-assignment bug with a
partly-independent, already-known compounding issue. Full picture below.

## The two settlements

| | S-2026-0007 (`27c304e2-652d-4972-9bd4-f396b394893c`) | S-2026-0015 (`1f67ae0f-189f-45fc-a8bb-7514e4150a28`) |
|---|---|---|
| Tour | 5769 (load 13508's own tour — the ONLY load on it) | 5788 (loads 13539/13546/13552/13498) |
| Status | closed, posted | closed, posted |
| Posted JE | `b6f5d894-d944-46ce-8ef3-d5aeea8a0834` | `abddcee8-2c1a-4c9b-82e6-e291770d3137` |
| Driver | Angel Alfonso Sosa | Angel Alfonso Sosa (same driver) |

## Root cause

During the 2026-09-05 historical backfill (signed-settlement-document import), tour 5769's
(load 13508's own tour) deduction records were created with `applied_to_settlement_id` pointing at
**S-2026-0015 (tour 5788)** instead of **S-2026-0007 (tour 5769)** — a wrong-settlement-UUID bug in
the backfill, not a duplicate-load or wrong-driver bug. This happened **twice** (an original insert
at 13:18:2x and a duplicate retry at 13:34:1x, both 2026-09-05), producing 4 deduction records total
for what should have been 2 real charges:

| Deduction record | Type | Amount | Status | `applied_to_settlement_id` (wrong) | Should be |
|---|---|---|---|---|---|
| `90fed837-80f4-4722-bb0e-318fe5fe4a9f` | other (Admin fee - GAS) | $10.00 | **active** | S-2026-0015 | S-2026-0007 |
| `f695df5f-c8a4-4e27-8980-c2ebe295d72a` | escrow_contribution (Driver-Escrow For Claims) | $25.00 | **active** | S-2026-0015 | S-2026-0007 |
| `c2e18752-931f-4adc-99ea-f770a06186f3` | other (Admin fee - GAS, duplicate) | $10.00 | **voided** 2026-09-06T05:42:45Z | S-2026-0015 | (dead — correctly voided as a duplicate, no correction needed) |
| `d7c46357-ae22-4c2d-af33-7e8df6e4b183` | escrow_contribution (duplicate) | $25.00 | **voided** 2026-09-06T05:42:45Z | S-2026-0015 | (dead — correctly voided) |

Someone already caught and voided the *duplicate* pair on 2026-09-06 — but never corrected the
*wrong-settlement* assignment on the two live originals, and never cleaned up the `settlement_lines`
display rows that had already materialized from the (now-voided) duplicates. That residue is what
the owner's original finding actually saw.

## Live GL impact — two genuinely different pieces, do not conflate

**A. The $10 admin fee (`90fed837`) — real, live GL misstatement on both settlements today.**
S-2026-0015's posted JE credits "Driver Admin Fee & Chargeback Income" (acct 7200) **$195.00**.
Reconstructed from the live (non-voided) deduction rows applied to S-2026-0015: $165.00 (tour 5788's
own, correct) + $10.00 (tour 5788's own, correct) + **$10.00 (`90fed837`, tour 5769/load 13508,
wrongly assigned here)** = $185.00 legitimate + a separate known +$10.00 (explained in section D
below) = $195.00 exactly. **S-2026-0007's posted JE has no admin-fee credit line at all** — it is
missing the $10.00 that belongs to load 13508's own gas admin fee.

**B. The $25 escrow-claims deduction (`f695df5f`) — wrongly assigned, but zero live GL effect either way.**
`escrow_contribution`-typed rows in `driver_finance.driver_settlement_deductions` are excluded
entirely from the deduction-recovery aggregation for a `load_bookended` settlement (that model
computes its escrow leg from `driver_finance.settlement_lines.line_type='escrow_contribution'`
instead — a separate, already-correct $25 "Escrow Contribution" line already sits on S-2026-0007
for load 13508, this is not that). So `f695df5f` currently posts to neither settlement's GL under
either assignment. Correcting `applied_to_settlement_id` here is a **provenance/record-keeping fix
with zero JE impact**, not a money movement. (Separately flagged, not part of this proposal: *why*
does this "Driver-Escrow For Claims" deduction type never post anywhere under current code? Worth
an owner/lead look at some point, out of scope here.)

**C. `settlement_lines` display residue — the exact 2 rows originally flagged, zero additional GL
effect beyond what's already covered by A.** `e3996c82-7ff7-4566-bcbc-2ec1ca2c6599` ($10, sourced
from voided `c2e18752`) and `a62be77e-6386-4594-9885-9f337a4edf2d` ($25, sourced from voided
`d7c46357`) are still `is_active = true` in `settlement_lines` despite their source deduction
records being voided. This is a read-model staleness bug on the *display* table only — the real GL
posting path reads `driver_settlement_deductions` directly with its own `voided_at IS NULL` filter,
so these two voided-source rows never independently affected the JE (their only live GL effect was
already folded into the pre-existing $10 bug in section D, via the *other* voided row `c2e18752`
being counted at post-time under old code — see below).

**D. Already-known, already-reported, NOT part of this proposal.** S-2026-0015 (internally "S-13652")
is one of the 8 settlements named in `settlement-payrun-close.service.ts`'s own "ROUND 16.24"
code comment: a since-fixed bug where `loadOtherDeductionsByRole` had no `voided_at` filter at the
time these settlements posted, so a handful of already-voided "other"-typed rows were wrongly
included in already-posted JEs. S-2026-0015's own $10 share of that $535.25 total (from the voided
`c2e18752`) is baked into the same $195 credit as issue A. **This is separate, pre-existing, already
surfaced to the owner in that comment's own words ("reported to the owner, not corrected here...
the correction is a driver-favorable credit on a future settlement") — not re-proposed here to avoid
double-counting or confusing it with the new finding.** If the owner wants to fix both at once
(same JE, same settlement), the two corrections stack cleanly (see the balanced entries below) but
they are independently approvable.

## Proposed correction (if approved — nothing below is executed)

**Step 1 — metadata correction (both settlements, no GL entry by itself):**
```sql
UPDATE driver_finance.driver_settlement_deductions
   SET applied_to_settlement_id = '27c304e2-652d-4972-9bd4-f396b394893c'  -- S-2026-0007
 WHERE id IN ('90fed837-80f4-4722-bb0e-318fe5fe4a9f', 'f695df5f-c8a4-4e27-8980-c2ebe295d72a')
   AND applied_to_settlement_id = '1f67ae0f-189f-45fc-a8bb-7514e4150a28'; -- guard: only if still wrong
```
Full `appendCrudAudit` trail on the UPDATE (before/after settlement_id, actor, reason citing this
proposal). Void-never-delete: this is a corrective UPDATE on a still-open-to-correction metadata
field, not a rewrite of WORM ledger history — the JE postings themselves are untouched by this step
alone.

**Step 2 — settlement_lines residue cleanup (void-not-delete, the 2 originally-flagged rows):**
```sql
UPDATE driver_finance.settlement_lines
   SET is_active = false, voided_at = now(), void_reason = 'stale display row — source deduction record already voided 2026-09-06, never cleaned up (see proposal doc)', voided_by_user_id = :actor
 WHERE id IN ('e3996c82-7ff7-4566-bcbc-2ec1ca2c6599', 'a62be77e-6386-4594-9885-9f337a4edf2d');
```

**Step 3 — corrective JE pair for the $10.00 admin fee only (issue A; issue D is separate and NOT
included here — owner's call whether to bundle):**
Two linked, balanced, WORM adjusting entries (never editing the original posted JEs — both stay
exactly as posted, reversal-by-addition per this codebase's own convention):

| Settlement | Leg | Dr/Cr | Amount |
|---|---|---|---|
| S-2026-0015 | Driver Admin Fee & Chargeback Income (7200) | **Debit** | $10.00 |
| S-2026-0015 | Driver Net-Pay Clearing (2170) | **Credit** | $10.00 |
| S-2026-0007 | Driver Admin Fee & Chargeback Income (7200) | **Credit** | $10.00 |
| S-2026-0007 | Driver Net-Pay Clearing (2170) | **Debit** | $10.00 |

Net effect: **zero** change to the driver's combined take-home across both settlements — this moves
which settlement's net-pay-clearing bucket absorbed the $10.00 GAS admin fee from load 13508, from
the wrong tour (5788) to the right one (5769). No gross-pay (6890) line changes on either side. Each
pair is individually balanced ($10=$10) and posted via the existing reversal/adjustment primitives
this codebase already uses for corrections on closed settlements (`reverseJournalEntryNoFlip`-style
linked adjusting entries), never a `createJournalEntry` from scratch and never an edit to the
original two JEs.

The $25.00 escrow-claims correction (issue B) needs **Step 1 only** — no JE, since it currently
posts nowhere on either side.

## The guard that will catch a repeat (described here per the order's ask; NOT built yet — "Item 3
needs no guard yet")

A live-DB check: for every `driver_finance.driver_settlement_deductions` row with `voided_at IS
NULL` and a non-null `load_id`, resolve the load's own tour (via `mdata.loads.tour_id` /
`presettlement_link_id`) and assert it matches the tour of the settlement named in
`applied_to_settlement_id` (via that settlement's `tour_id` / `first_load_id`/`last_load_id`
membership). Flag any row where the load's tour and the settlement's tour disagree — exactly the
shape that let `90fed837`/`f695df5f` land on the wrong settlement undetected for 6 days. Shrink-only
ratchet baseline the same way `verify-load-settlement-linkage.mjs` (shipped earlier this session)
already ratchets orphan/misattached-line counts — this would be a sibling guard on the deduction
side of the same defect class, once approved.

## S-2026-0011 (separate item, explicitly parked, not touched)

Unrelated to load 13508. Remains parked exactly as GPT/lead already ruled: historical attribution
unresolved, "preserve original payment attribution, do not recompute/repost." No action taken or
proposed here; the code-level executor-scope-exclusion protecting it from the Blocker-2 reverse+repost
run is already shipped (PR #21779, merged `ecb76b7021`).

## What I need from the owner

One of:
1. **Approve Steps 1–3 as written** (issue A+B corrected, issue D left alone) — I'll build the
   guard, apply the metadata UPDATE + settlement_lines void + the $10/$10 adjusting JE pair, all
   with full audit trail, and report live proof.
2. **Approve Steps 1–2 only** (fix the wrong settlement assignment + stale display rows, skip the
   JE adjustment) if a $10 GL reclassification between two closed settlements isn't worth doing
   right now.
3. **Hold entirely** — I take no further action on this until you say go.

Nothing executes until one of these is confirmed in chat.
