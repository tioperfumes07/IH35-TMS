# ROUND 155.12 FIX 4 DONE (AUTH-097) — CC-1 — 2026-09-28 11:10Z
Archived: `docs/bus/archive/NOW-CC-1-2026-09-28-18.md`.

## ROUND 155.12 FIX 4 — DONE, AUTH-097, live-verified
13618 and 13621's $0.00 driver bills: root cause was an orphaned bill (an earlier, unrelated
cleanup voided both bills' settlement_lines with a real timestamp but never touched the parent
driver_bills row). Both loads already had real miles_shortest + an active driver pay rate — not a
genuine pricing gap. Extended correctOpenDriverBillMileage
(apps/backend/src/driver-finance/void-open-driver-bill.service.ts) to recognize a fully-voided
(zero live lines) settlement-line set as equally safe to correct as a partially-voided one — same
safety checks (settlement must be open, no approved line) apply unchanged. Void-and-remint per the
order, never a raw UPDATE.
LIVE RESULT: 13618 old bill voided ($0.00) -> new bill open, $647.04 (1348.0mi x $0.48/mi). 13621
old bill voided ($0.00) -> new bill open, $940.27 (1958.9mi x $0.48/mi, rounded).
driver-finance test suite: 247 passed, 1 pre-existing unrelated failure (confirmed on stock main).

## Current full picture across all active rounds — see prior NOW-CC-1 archives for detail
- 155.12 FIX 1/2(a)/2(b)/FIX 4: DONE. FIX 2(c)/(d) (mileage for the 16 real current loads): still
  genuinely blocked, no real source exists (re-confirmed this round, not re-litigated).
- 155.12 FIX 3 (unit assignment): WITHDRAWN by 155.26/157-A in favor of AlwaysTrack ground truth;
  1 of 12 written (13631), the other 11 correctly blocked by uq_loads_one_active_unit until stale
  loads free their trucks (AUTH-095).
- 155.20 JOB 1: DONE (AUTH-093/095, corrected). JOB 2: DONE — diagnosed (Samsara toggle was off for
  USMCA this whole time, flipped 2026-09-28T10:00:08Z), guard shipped, no code defect found. JOB 3
  (advance the stale/delivered loads): still blocked on real delivery-evidence timestamps; CC-2's
  AUTH-096 (real settlement posting for several of them) is authorized but not yet executed as of
  last check — re-verify before touching those loads' status.
- 155.23 JOB 1/2: DONE, live-proven. 13614's lane fix and the two remaining named guards
  (verify-tour-groups-by-tour-id-only.mjs, verify-stop-lane-is-consistent-with-miles.mjs): not
  started, need 13614's real source document first.
- 155.26/157-A item 3 (units/trailers/drivers/customers/WO from AlwaysTrack): WO numbers done for
  all 16, trailers/drivers/customers already matched (no changes needed), lanes already matched
  (no disagreements), units blocked as above.

Next planned: locate 13614's real source document (rate con / AlwaysTrack row) to fix its
Laredo->Laredo lane data, matching 155.23 item 6 and 157-A item 6's own note about it.
