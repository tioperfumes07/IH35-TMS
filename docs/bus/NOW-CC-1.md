# ROUND 166 JOB 1/2/3 DONE (Samsara proven live, fabricated load removed, driver-bill guard shipped) — CC-1 — 2026-09-28 12:05Z
Archived: `docs/bus/archive/NOW-CC-1-2026-09-28-21.md`.

## ROUND 166 JOB 1 (P0, Samsara) — DONE
Live proof, exactly as demanded: telematics.vehicle_latest_position carries a real row for unit
033dcdff-98c7-4b2e-8db3-2c94519dbc89 (T171), captured_at 2026-09-28T11:40:10Z, city=Houston,
state=TX — inside the last 15 minutes. 11 USMCA units total have a position fresher than 20
minutes as of this check. The feed was OFF for USMCA's entire history (is_enabled=false from
2026-08-21 creation until 2026-09-28T10:00:08Z) — confirmed by repeated cron_skipped_samsara_disabled
audit events up to that exact second — and is now genuinely healthy and writing.
Historical backfill for the 16 current loads' PAST stops (c/d in the order) is NOT possible: the
feed has no position history covering their actual transit dates (Sept 23-28), because it was off
the whole time. Going forward, new stops should stamp normally as real position data accumulates.
Permanent alarm shipped: scripts/verify-telematics-feed-is-live.mjs — fails if is_enabled goes
false again, or no USMCA unit has a position inside 20 minutes during operating hours. Selftest
4/4, live PASS.

## ROUND 166 JOB 2 — guard shipped, 2 real defects correctly still flagged
scripts/verify-driver-bill-has-miles-and-rate.mjs covers all three named failure shapes (zero
gross, null/zero miles, null/zero rate) in one check. Live-confirmed it correctly still flags:
- 13544: has a rate (45c/mi) but miles_basis snapshotted as 0.0. No real source document found
  anywhere in Downloads for this load's mileage — NOT reminted (never invented).
- 13595: minted completely empty. Its settlement's own signed PDF (Driver_Settlement_5816.pdf)
  states 351.7 loaded miles; driver's real active rate is $0.45/mi — real correction math is known
  (351.7 x 45c = $158.27) but its settlement is already CLOSED and
  correctOpenDriverBillMileage explicitly refuses to correct a line on a non-open settlement.
  NOT forced through without a verified closed-settlement correction mechanism — flagged as the
  next real step, not silently left broken.
Both baselined as known, real, open debt (2/2), guard live PASS against that baseline.
90007's own $0 bill was already voided by the Lead before this round — confirmed, not redone.

## ROUND 166 JOB 3 — DONE
Detached the real $350 invoice (ITS Logistics LLC, PO 68747) from fabricated load 90007 —
source_load_id set NULL, kept as a non-freight invoice, amount/status/customer untouched, never
deleted. Voided the fabricated load itself through the real cancellation path. Swept every USMCA
load outside the sanctioned 13xxx series: 90007 was the only one; zero remain after this fix.
Guard scripts/verify-no-fabricated-load-numbers.mjs: live PASS (123 active loads, 0 outside the
series).
NOT done this turn: cross-checking JPM RECONCILIATION.csv's other blank-LOAD Faro rows (ITS
Logistics $350 already handled via 90007; Supply Chain Management $4,000, Hawkeye $600 x2,
Refrigerx, Fuze, ES Logistics, others named in the order) against our invoices for a SIMILAR
fabricated-load pattern — the load-number sweep confirms no OTHER fabricated load exists today,
but I have not individually verified each of those specific Faro rows landed cleanly (e.g.,
correctly unlinked, not mis-attached to a real-but-wrong load). Flagging as the next real check,
not claiming it done.

## Round 163 JOB 2/3/4 — still not started (see prior archives)
Given ROUND 166 superseded/extended much of this, next session should re-verify whether these are
now covered by 166's work or still standalone.
