# STANDING ORDER — NOBODY WAITS ON A DEPLOY
**Owner 2026-08-31:** *"Everyone pauses because someone has not finished something. Get them
all to work. If they are waiting for a deployment, get them working on something else while
that deploys."*

## The rule
**Every seat holds TWO queues at all times: a BLOCKING lane and a FREE lane.**
The moment the blocking lane stalls — waiting on a deploy, a merge, another seat, or an owner
ruling — the seat switches to its free lane **without asking**. Announcing "blocked" and
stopping is now itself a defect.

**FREE lane = anything that never needs a deploy to make progress:**
frontend code + vitest · guard scripts + selftests · tie-out comparison logic · reading live
Neon (read-only) · specs · tests · audit-ledger correction.

**BLOCKING lane = anything that needs the running app:** creating rows through screens, live
Chrome verification, `prod_verified` stamps.

Only Cursor deploys (Rule 42). Deploy cadence stays 5–10 merged PRs so the queue never stacks.

---

## The free-lane backlog, assigned. None of this needs a deploy.

### The single biggest one: **all six tie-outs are empty stubs**
`scripts/tieout/*.mjs` are 13–30 lines each with one `fail()` call and **zero comparison
logic**. This is what stands between the Urgent 6 and certification, and **writing it needs no
deploy** — the expected values are known and Neon reads are read-only.

| Seat | Tie-out | Expected value (already known — do not re-derive) |
|---|---|---|
| CC-2 | `faro-factoring-statement` | face **95,075.00** · reserve 1,426.13 · fee 1,426.13 · wire 120.00 · cash 92,102.74 · NFE 88,648.87 |
| CC-3 | `vendors-ap-aging` | sum of open bills == AP control, tolerance 0 |
| Cascade | `dispatch-delivered-revenue` | delivered loads == invoiced revenue, zero orphans both directions |
| Codex | `bank-ledger-closing` | every live bank account closing balance == its `ledger_account_id` GL balance |
| CC-1 *(when 016 is done)* | `settlement-pdf-5753` | the real settlement PDF, each line to the cent |
| Cursor | `accounting-trial-balance` | debits == credits AND ties to the QBO comparative, read-only |

Rules for all six: **tolerance 0** · record the observed value pass or fail · **an empty result
is never a pass** · if it fails, report the difference and its cause — never adjust the expected
value to match the system.

### Board integrity — 2 false flags, both free-lane
- **`safety` says `complete: true` with four items on HOLD** (SAF-B08, SAF-ORPH-01/02/05).
  Score is 34 of 38. Flip to false and surface the holds. **SAF-B08 is `HOLD` *and*
  `prod_verified: true`** — that stamp cannot both exist; resolve it.
- **`users` says `complete: false` with 6 of 6 PASS and prod_verified.** Either flip it or write
  the reason. Silence is the defect.

### Planner UI — code is written, needs review + tests (free lane)
`PlannerGrid.tsx` · `PlannerGrid.css` · `UnifiedTimelinePlanner.tsx` · `LoadsPlanner.tsx` in the
claude worktree, `tsc --noEmit` clean. See `docs/lockdown/GO-PLANNER-UI-DEFECTS-2026-08-31.md`.
Needs: unit tests for `plannerBarLabelTier()`, a test asserting no `.pg-bar` renders a label
wider than its own box at 1280/1440/1920, and the Dispatch tab-badge cleanup (PLAN-04,
including the `"1 items"` pluralization bug).

### Faro repurchase tracker — written, unmerged (free lane)
`db/migrations/202613301700` + `202613301800` and
`docs/lockdown/GO-FARO-REPURCHASE-TRACKER-2026-08-31.md`. Guards to author:
`no-purchased-account-past-repurchase-deadline` (the 95-day wall),
`default-interest-accrues-from-day-35`, `repurchase-price-ties-to-faro-statement`,
`partial-payment-leaves-account-open`, `no-accrued-reserve-release`.

### Dilution control (free lane)
`catalogs.deduction_reason_codes` with `responsible_source`, `accounting.invoice_deductions`
with derived `responsible_user_id`, the Dilution Accountability Report, and
`no-orphan-partial-invoice`. Spec: `docs/specs/DEDUCTION-AND-DILUTION-CONTROL-SPEC-2026-08-30.md`.

---

## The only true blocking item tonight
**CC-1 · 016:** invoice **$4,200** → **$400** credit memo (`unknown_pending_backup`, do not stamp
late) → factor net **$3,800**. Pledge-net and the CoA are live on `a669b0f`+. If the pledge reads
$4,200 after the credit memo, **stop** — that is the pledge bug, not a new 016 ruling.

Until that exists there is **not one live factoring advance in the system** (the only one is
voided), so factoring has nothing to grade. Every other seat has free-lane work above and
**must not wait on it.**
