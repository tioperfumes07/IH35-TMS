# OWNER RULINGS — DRIVER ACCOUNTS · MILEAGE CLOSED · INSURANCE REQUEST AUTHORIZED
2026-09-01 00:40Z. Four rulings. One is a build authorization. One closes a finding I opened.

## 0 · MY PROCESS ERROR
The owner said these answers already exist in the repo. **They do, and I did not read them first.**
`.claude/skills/ih35-accounting-decisions` line 114 states it plainly and it is OWNER-LOCKED:
> **Driver Cash Advance = asset**; **Driver Escrow = LIABILITY** (held-in-trust, returned 60–90d
> post-separation net of damage/late-fee/fine deductions). Additive CoA account **Driver Damage
> Loss**. Net-pay clearing account.
**Standing rule for every seat, me included: search the locked decisions and the questionnaire
BEFORE asking the owner anything financial. A question already answered is a defect in us.**

## 1 · RULING — every driver gets BOTH accounts, automatically
Owner: *"for each driver the software automatically creates a liability and asset account."*
That maps exactly onto the locked decision:
- **liability account = driver ESCROW** (held in trust for the driver — not our cash)
- **asset account = driver CASH ADVANCE**

### The gap, measured live — USMCA, 86 Active drivers
```
Active drivers                                    86
  with an ADVANCE (asset) account                 14
  with an ESCROW (liability) account               2
  with NEITHER                                    73
```
**73 of 86 active drivers have no financial accounts at all. Only 2 have the liability account the
locked decision requires.** This is the same defect that let 12 drivers be deducted $1,100 against
escrow accounts that do not exist.

**BUILD — CC-1 owns, CC-2 grades:**
1. **Auto-create the PAIR on driver activation** — escrow liability + advance asset, together, never
   one without the other. That is the invariant.
2. **Backfill all 86 active drivers.** Both accounts each.
3. **Backfill the 12 drivers with historical escrow deductions** ($1,100 total, all August, all
   inside the open period) at their **original dates**, so the period lands correctly.
4. **Guard + selftest, NAMED IN A WORKFLOW:** no Active driver may exist without both accounts; no
   escrow deduction may post against a driver with no escrow account.
5. Reuse the existing poster. **Never invent new GL math** (locked decision).

## 2 · CLOSED — the 1,500-mile / Mexico radius is NOT a defect
Owner: *"the 1500 mile limit is not an issue, disregard that… there is no mileage restriction."*
**`DISPATCH-NO-1500-MILE-MEXICO-RADIUS-BLOCK` is CLOSED — not a defect, not a gap, not deferred.**
Delete it from every queue. Devin-A's Laredo→New York test result is correct behaviour. **Nobody
builds a radius block. Nobody re-raises this.** I opened it; I am closing it.

## 3 · RULING — unscheduled driver: WARN + CONFIRM, not a hard block
Owner: *"officially the dispatcher needs to receive a message on the screen and must confirm…
warnings and override by owner. loads are assigned during the day when they are booked."*

**I withdraw my "hard block" recommendation.** It was wrong for this operation — loads are assigned
during the day as they are booked, and a hard block would stop normal dispatching.

**BUILD — the correct control:**
- On booking/assigning a driver **not yet on the insurance schedule**, the dispatcher gets an
  **on-screen message that must be explicitly confirmed.** Not a passive toast — a confirm.
- The confirmation is **logged**: who confirmed, when, which driver, which load, which truck.
- **Owner override** for anything beyond that.
- **Build it on POLICY-SCHEDULE MEMBERSHIP, not `assigned_driver_id`.** That field is a TMS
  assignment, not insurance-schedule membership. Building on it produces the wrong guard.
- **Context that makes this a warning and not an error:** the uploaded driver list was a
  **setup-time snapshot. EVERY driver is sent to the insurer.** Drivers are still being set up. So
  "not on the schedule" usually means "not submitted yet" — a workflow state, not a violation.
- Guard + selftest, named in a workflow: the confirm cannot be bypassed, and every confirm is logged.

## 4 · ⚡ AUTHORIZED NOW — the INSURANCE REQUEST feature
Owner: *"that is the thing we still need to wire here in the app — the insurance request, using our
email we will be able to send the insurance request either for a COI for a customer or a driver."*
**AUTHORIZED. Build it.**

**Two request types, one pipeline:**
1. **COI request for a CUSTOMER** — a certificate of insurance sent to a broker/shipper.
2. **DRIVER ADD request to the insurer** — submit a driver onto the policy schedule.
   *(Unit add follows the same shape — build the pipeline so it extends.)*

**Wiring — reuse what exists, build nothing twice:**
- **`insurance.coi_request` ALREADY EXISTS** (1 row). Use it. Extend additively if a driver-add
  request needs fields it lacks. **Do not create a second request table.**
- Send through the **existing email pipeline** — `apps/backend/src/email/` with the
  `email.email_queue` worker, per-entity sender via `EMAIL_FROM_BY_COMPANY`. **Do not build a new
  sender.** Recipients: EDSA (`eduardo@edsainsurance.com`) for the broker path.
- Attach the generated request to `docs.files`, hub-linked (Rule 14).
- **Status lifecycle:** requested → sent → acknowledged → issued/declined, with the returned COI or
  updated schedule attached back to the request.
- When a driver-add request comes back **issued**, that driver becomes schedule-resident and the
  dispatcher warning in §3 stops firing for them. **That closes the loop.**
- **Nothing sends automatically.** A human presses send. Every send is logged.

## STANDING — unchanged
LIVE CLICK to create · a fix is not done until its guard is NAMED and RUNNING · TEST-FREEZE on
proven hops · void sequence P-A → P-B → VOID → re-run guards → real chain → trace · reverse never
erase · nobody closes August but the owner.
