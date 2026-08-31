# VERIFIED — DEVIN-A's RUN, AND TWO ABSENT SAFETY CONTROLS · 2026-09-01 00:15Z
I checked every claim against prod. Three stand, two need correcting, and one needs an owner ruling.

## ✅ CONFIRMED
**P0 is dead.** `L-20260831-0031` exists in Neon, created 20:23Z. Deploy `9b16a4a` fixed the stale
asset. Booking works again — the board is unblocked. Good catch and good close.
**`escrow_deductions_pending` = 0.** Confirmed exactly.
**Both insurance controls are absent.** Confirmed — see the ruling section.

## ⚠ CORRECTION 1 — the settlement hop is NOT proven. It approved three EMPTY shells.
All three settlements Devin transitioned read, live:
```
S-20260827-0850   status=approved   gross_pay 0.00   net_pay 0.00   paid_at NULL
S-20260830-0020   status=approved   gross_pay 0.00   net_pay 0.00   paid_at NULL
S-20260830-0007   status=approved   gross_pay 0.00   net_pay 0.00   paid_at NULL
```
Approving a $0.00 settlement does not prove the settlement hop. It proves the *button* moves a
status. **Do not mark "driver settlement create" as a proven hop.** It stays open.

### And a NEW defect fell out of it — contradictory dual approval state
Every one of those rows carries **`status = 'approved'` while `approval_status = 'needs_review'`**
at the same time. **4 USMCA settlements are in that contradictory state right now.** One field says
approved, the other says it still needs review. Any report, any control, any auditor reading one
field gets a different answer than one reading the other. **File it: `SETL-DUAL-APPROVAL-STATE-CONTRADICTION`.**

## ⚠ CORRECTION 2 — escrow is 3, not 21.
Devin reported "21 driver escrow accounts exist." Live: **`escrow_balances` = 3, `escrow_ledger` = 3**
— unchanged all day. The nearest number in that schema is **`driver_advance_accounts` = 27**, which
is advances, not escrow. **The escrow gap is exactly as bad as it was this morning: 3 accounts
against 106 real drivers, with 12 drivers already deducted $1,100 against accounts that don't exist.**
Nothing has improved. Re-verify before reporting a count.

## ⚠ CORRECTION 3 — "no driver pay rate" is not the root cause it appears to be
**94 driver pay rates exist for USMCA.** The rates are not missing — they are **not resolving onto
the test loads.** That is a wiring defect, not an empty table, and it is the real reason gross pay
is $0.00 and nothing flows to deductions or escrow. Chase the resolution path, not the rate count.

## ⚠ CORRECTION 4 — the insurance fixture was right in verdict, wrong in reasoning
Devin defined "unscheduled" as `T152.assigned_driver_id = NULL`. **That is a TMS assignment field,
not insurance-schedule membership.** They are different things:
- **T152 IS on the Auto Liability vehicle schedule** (item 4 of 14, VIN `1XPBD49X5ND782394`).
- **Genaro Guerrero Chavez is NOT on the AL driver schedule** (13 names; he is absent).
So the true fixture is **scheduled TRUCK + unscheduled DRIVER** — which is exactly the exposure.
The verdict holds. **But if the block is built on `assigned_driver_id`, it will be the WRONG GUARD**
and will not catch the real case. **Build it on policy-schedule membership.**

---

# ⛔ OWNER DECISION REQUIRED — two safety controls do not exist
Devin proved both by clicking, and I accept both findings.

**1 · Dispatch does not block an unscheduled driver on a scheduled truck.**
The form accepted the combination. Only a customer FMCSA warning and a DVIR authorization appeared —
no insurance or scheduling block of any kind.

**2 · Dispatch does not block the 1,500-mile / Mexico radius.**
Laredo TX → New York NY, ~1,800 practical miles, well beyond the 1,500-mile limit. **Book + dispatch
stayed ENABLED.** No radius blocker, no Mexico blocker.

### Why this matters, in the policy's own words
> "Coverage only applies for Scheduled Vehicles driven by Scheduled Drivers listed in the policy.
> Unscheduled Vehicles or Drivers are Excluded."
> "MILEAGE RESTRICTIONS: … a strict condition of this policy and coverage. The policy does not
> provide coverage beyond the mileage stated."

Today the software will happily dispatch a load that has **no liability coverage behind it**, and
nothing on the screen tells the dispatcher. This is not a reporting gap — it is the difference
between an insured load and an uninsured one.

### The decision
**Build both blocks before USMCA launch, or accept the exposure in writing.** My recommendation is
to build them, as **hard blocks with a logged owner override** — not warnings. A warning gets
clicked through by a dispatcher under pressure at 2am; that is precisely when it matters.
The data to enforce it already exists: the AL vehicle schedule (14 VINs), the AL driver schedule
(13 names), and the 1,500-mile radius from the point of entry.

**Filed:** `DISPATCH-NO-UNSCHEDULED-DRIVER-ON-SCHEDULED-TRUCK-BLOCK` ·
`DISPATCH-NO-1500-MILE-MEXICO-RADIUS-BLOCK`. Both stay OPEN pending the owner's ruling.
