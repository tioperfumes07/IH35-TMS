# ROUND 27.1 / 28 STEP 3 — DEDUCTIONS, settlements 5787-5803 — VERIFICATION RESULT

Run by CC-3 (Claude), 2026-09-21. Source of truth: `~/Downloads/IH35-MASTER-RECONCILIATION-2026-09-21.xlsx`
DEDUCTIONS sheet, independently re-derived line-by-line from the signed settlement documents' own
text via the root-cause-fixed `scripts/alwaystrack/parse_settlements.py`.

## Finding: deductions_total / net_pay for this whole scope were ALREADY CORRECT

Before writing anything, `scripts/ops/round27-1-step3-deductions-5787-5803.ts` computed the exact
document target (`deductions_total`, `net_pay`) for each of the 14 settlements in this scope
(5786/5796 carry zero deductions; 5795/5800 already fixed by ROUND 26.3 STEP 4A / PR #22134) and,
inside a per-settlement transaction, attempted to reconcile
`driver_finance.driver_settlement_deductions` (a secondary, partially mis-pointed
historical-backfill ledger — see below) into `driver_finance.settlement_lines`, then called the
real, existing `recomputeSettlementHeader()` and required the recomputed header to land exactly on
the document target before committing.

**10 of 14 settlements failed that check and rolled back — because they did not need fixing.**
Live re-query (bypass_rls, before any successful write) showed every one of `driver_settlements`'
own `deductions_total`/`net_pay` values for 5787, 5788, 5789, 5790, 5791, 5792, 5794, 5798, 5801,
5803 **already equal to the document's own printed figure, to the cent** — the same value this
script was about to "fix". The per-settlement transaction-and-rollback design caught this before
any settlement was touched; nothing was corrupted.

**Root cause of the false alarm:** `driver_settlements.deductions_total`/`net_pay` were seeded
directly and correctly by an earlier historical-backfill import, independent of
`driver_finance.settlement_lines`. A SEPARATE, partial materialization layer
(`driver_finance.driver_settlement_deductions`, mostly `status='pending'`, several mis-pointed at
decoy "shell" settlements the same way ROUND 26.3 STEP 4A found for 5795/5800) exists alongside it
but does not drive the header value. Calling `recomputeSettlementHeader()` — which sums
`settlement_lines` fresh — against a settlement whose header was already correct by direct import,
but whose `settlement_lines` are incomplete (e.g. missing the `escrow_contribution`-typed lines
that in fact already exist under a DIFFERENT line_type and already carry the right dollars) would
have silently rewritten an already-correct number from a different, incomplete source. The
per-settlement rollback-on-mismatch is exactly what prevented that here.

**4 settlements (5793, 5797, 5799, 5802)** each had exactly one deduction item with no competing
`escrow_contribution` line to collide with; the recompute coincidentally landed on the same,
already-correct target. These 4 were left materialized: the pending `driver_settlement_deductions`
row was flipped to `status='applied'` (a real, correct fact — the fee genuinely happened) and one
`driver_finance.settlement_lines` row was added. **No visible total changed** (before/after
`deductions_total`/`net_pay` are identical). This is disclosed as a real, verified, low-risk write
— not reverted, since it makes the record MORE complete, not less true, and NO-REVERSES is the law.

## STILL OPEN, not touched by this pass
- The mis-pointed/pending `driver_settlement_deductions` rows for the other 10 settlements
  (identical shape to ROUND 26.3 STEP 4A's 5795/5800 finding — `reason` text correctly names the
  real settlement, `applied_to_settlement_id` points at a decoy shell) remain mis-pointed. They do
  NOT affect any reported total (confirmed above), so this is data hygiene, not a tie defect —
  named here for whichever seat next reconciles that secondary ledger, not actioned.
- 5789 additionally carries one live, unexplained `escrow_contribution` settlement_lines row
  ("Load 13557 — Escrow Contribution", $25.00) with no corresponding item in the document's own
  Deductions section — flagged, not removed (void-not-delete; not this pass's scope).
- 5794 and 5789 each show what look like ONE duplicate escrow-contribution row apiece (two rows,
  same load, same $25, slightly different description wording — "escrow for claims" vs "—  Escrow
  Contribution") — flagged, not touched.

## VERIFIED LIVE, all 14 settlements (source_document_ref, deductions_total, net_pay, reimbursements_total) — 2026-09-21
5787 211.99 / 885.73 / 22.00 · 5788 451.99 / 1273.90 / 0.00 · 5789 10.00 / 2015.85 / 0.00 ·
5790 60.00 / 1452.75 / 0.00 · 5791 60.00 / 1630.03 / 0.00 · 5792 352.00 / 1386.05 / 0.00 ·
5793 10.00 / 1568.91 / 42.26 · 5794 60.00 / 1330.60 / 101.76 · 5797 10.00 / 1544.48 / 37.63 ·
5798 60.00 / 927.85 / 0.00 · 5799 10.00 / 2523.91 / 531.26 · 5801 260.00 / 1334.02 / 35.75 ·
5802 10.00 / 2104.84 / 34.99 · 5803 60.00 / 1624.05 / 0.00.
Every one MATCHES the document target computed independently from the fixed parser. Reimbursements
for this same scope also already tie exactly (`SUM(reimbursements_total)` = $835.95 = parsed total,
15 lines = parsed count, verified separately before this script ran).

PASS for DEDUCTIONS + REIMBURSEMENTS, settlements 5786-5803: already true, verified, nothing to post.
