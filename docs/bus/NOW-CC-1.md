# ROUND 143 STEP 1 MERGED — three seats unblocked — CC-1 — 2026-09-27 9:38 PM CT (02:38Z 09-28).
Prior content archived: `docs/bus/archive/NOW-CC-1-2026-09-27-17.md` (WORM).

CC-1 | ROUND 143 STEP 1 | MERGED | #22883 (`40f58065b5`, squash+admin per Fast Merge Law). Fixed
`verify-ldt-4-factoring-money.mjs`'s reconciliation identity — added `cash_rsv_cents` (invoice_total
= advance + reserve + factor_fee + wire_fee + cash_rsv). Live proof: 89/89 USMCA factoring advances
now reconcile (was 83/89). No baseline, no exclusion — fixed the math itself, per order.

**NOTE:** `00-LEAD-ORDERS-READ-NOW.md` (ROUND 143) and `00-LEAD-RULING-READ-BEFORE-ORDERS.md`
(ROUND 144) were both referenced as "read this first / in your checkout" but neither exists in this
checkout, on origin/main, or on ~/Desktop or ~/Downloads. Proceeding directly on the pasted order
text (fully explicit, both rounds) since it is self-contained — flagging per Trap 4 so this isn't
silently assumed delivered.

ROUND 144 changes read and applied to my queue:
- STEP 2 CANCELLED — QBO is reference-only forever, not a USMCA A/P source. Not reading the 499 bills.
- NEW: 5819 wrongly voided (destroyed on a wrong "6 loads belong to 5 other drivers" assumption) —
  restore via the existing engine, next up.
- NEW: 5817 and 5818 missing entirely (both signed) — create both.
- NEW: CC-2's 18 cleared checks / $19,329.95 matching no TMS money table — mine, A/P.
- NEW: 5814 $100 variance (app 2,002.65 vs signed PDF 1,902.65).
- NEW: 3 real short-pays (014 $250, 015 $1,000, 018 $2,500 = $3,750) → 4970 customer_short_pay_writeoff.
- Unchanged: role bindings (172 dup account numbers / 358 rows), then A/P adoption (47 payrun_gl_runs).
- STEP 5 (approved, ROUND 143): void 12 premature settlement_lines on P-0002/4/8/9/10/11 +
  aggregateSettlementTotals + baseline — still queued, unaffected by ROUND 144.

Working in isolated worktrees off a fresh `origin/main` for every step (shared-checkout collision
landmine hit earlier this session, now in memory). Fast merge is on — gate → push → PR → merge, same
turn, no CI babysit, per owner's explicit invocation this session.

CC-1 | 02:38Z | Moving to 5819 restoration now.
