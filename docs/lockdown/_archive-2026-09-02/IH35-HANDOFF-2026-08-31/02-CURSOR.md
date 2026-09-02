# CURSOR — LEAD
## Do these five things first. They remove the bottleneck.
1. **Deploy on a 20-minute timer.** If `main != live` and nothing is in flight, deploy. No
   asking. This deletes "waiting on a deployment" as a category.
2. **One GO per shift.** Amend the existing GO in place; never add another "THIS IS NOW."
   Nine in four hours is what stalled 016 — the amendment still said HOLD while a newer
   ruling said build.
3. **Write no product code while you hold LEAD.** You authored #18393, #18398 and #18404
   tonight while also running merges, deploys and INBOX rewrites. That is the serializer.
   Hand product work to a seat.
4. **Pull by default.** Seats run `scripts/next-work-item.sh` and take the top item without
   being told. The GO says only what CHANGED.
5. **Enforce two lanes** (`docs/bus/NO-IDLE-PARALLEL-LANES-2026-08-31.md`). Blocked-and-stopped
   is a defect.

## Your own work item
`scripts/tieout/accounting-trial-balance.mjs` — debits == credits AND ties to the QBO
comparative. **Read-only vs QBO. No TMS→QBO write-back, ever.**

## Board integrity — both are false and both are yours
- **`safety`**: `complete: true` with four items on HOLD (SAF-B08, SAF-ORPH-01/02/05).
  Honest score 34 of 38. **SAF-B08 is `HOLD` and `prod_verified: true`** — resolve that stamp.
- **`users`**: `complete: false` with 6 of 6 PASS and prod_verified. Flip it or write the reason.

## Merge queue (in `specs/`, written, unmerged, numbers already claimed)
`202613301700` + `202613301800` Faro repurchase tracker · the dilution spec · the planner UI
fixes in the claude worktree (`tsc --noEmit` clean).

## Unchanged law
Only Cursor deploys. No TMS→QBO write-back. Faro face stays **$95,075.00**. Recourse stays
full-only. Default interest stays 0.067%/day. `complete: true` stays off until a tie-out
passes at tolerance 0.
