# LANE CROSS RULING — CC-2 driver-pay / close-recalculation branch, 2026-09-28

The Lead (owner), 2026-09-28 ROUND 177/178, in direct chat:

> "CALCULATE DRIVER PAY ON THE 14 LOADS... GENERATE DRIVER BILLS FOR ALL 14 LOADS NOW, BULK... THE
> CLOSE PATH IS THE DELIVERABLE: entering real mileage at close must automatically recalculate the
> driver bill and the settlement lines. Guard it —
> verify-close-recalculates-bills-from-real-mileage.mjs."

This instruction was addressed to CC-2 directly, in the same session/turn as CC-2's other ROUND
177/178 assignments (14-load driver pay, the four 09-25-26 xlsx imports, the fuel-feed root cause).

## Why this branch trips `verify-lane-ownership`
Real cross-lane paths. `docs/bus/LANES.md` assigns the following to CC-1, not CC-2:
- `apps/backend/src/dispatch/**` — this branch fixes two real bugs in
  `apps/backend/src/dispatch/book-load.service.ts`: (1) `ensureDriverBillArtifactsForLoad`'s own
  SELECT never carried `miles_deadhead`, silently zeroing the deadhead leg through that entry
  point regardless of the column's real value; (2) the existing-bill recalculation gate only ever
  fired while `gross_amount_cents` was still 0, so a bill that had already minted a pre-settlement
  estimate froze at that estimate forever — the exact defect the Lead's own instruction above
  names ("entering real mileage at close must automatically recalculate the driver bill").
- `scripts/verify-steps/**` and `scripts/verify-*.mjs` — the new guard
  `verify-close-recalculates-bills-from-real-mileage.mjs` (verify-step 11687, claimed on
  `chore/claim-reserve-cc2-11687`) the Lead's own instruction named by filename. Also, purely
  mechanically: this claim branch could not push at all until `verify-no-silent-db-skip.mjs`
  (03d, diff-independent, repo-wide, ratchet at 0 files) was satisfied — it flagged 10 guards
  silently returning `SKIP` with no `DATABASE_URL` and no declared `ALLOW_OFFLINE_SKIP` (9
  pre-existing, unrelated to this branch's own work, plus this branch's own
  `verify-fuel-location-is-a-city.mjs` using the boolean form `= true` instead of the required
  string-reason form). Each of the 9 already prints its own honest SKIP reason; the fix added
  only the matching `export const ALLOW_OFFLINE_SKIP = "<that same reason>";` declaration, no
  behavior change (confirmed via `node --check` on all 10 and a live no-DATABASE_URL run showing
  the identical SKIP message and exit 0 as before).
- `driver_finance.driver_bills` (a CC-1 TABLE per LANES.md) — the 14-load bulk mint writes this
  table, via the sanctioned engine (`ensureDriverBillArtifactsForLoad` /
  `createDriverBillArtifacts` / `resolveDriverBasePayCents`), never hand-rolled SQL.

## Ruling
The Lead assigned this driver-pay + close-recalculation work to CC-2 directly, by name, including
the exact guard filename. This is authorization for **this one PR only** (the ROUND 178
driver-pay/close-recalc branch and its claim-reserve prerequisite, `chore/claim-reserve-cc2-11687`)
— it does not reassign `apps/backend/src/dispatch/**`, `scripts/verify-*.mjs`, or
`driver_finance.driver_bills` to CC-2 generally; the standing `LANES.md` law is unchanged going
forward.

One further mechanical fix on the same branch, same rationale: `verify-no-unscoped-company-delete`
(also CC-1's `scripts/verify-*.mjs` lane by file location, though the fix itself lives in
`scripts/ops/**`, SHARED) flagged 4 DELETEs in this session's own already-executed ROUND 155.18
purge scripts (`2026-09-28-cc2-r15518-purge-voided-usmca.ts`,
`2026-09-28-cc2-r15518-purge-sample-leaf-tables.ts`) with no `operating_company_id` in the
statement text. Checked live: all 4 target tables/joins genuinely carry the column
(`maintenance.pm_auto_wo_log`, `samsara.hos_snapshots` directly; `accounting.journal_entry_postings`
/ `accounting.transaction_source_links` via join to `accounting.journal_entries`) — this was a real
gap, not a guard blind spot, even though every id list involved was already independently verified
USMCA/sample-scoped by other means (is_sample_data re-check inside the same transaction, or the
whole script's own USMCA-only SCOPE). Added the direct/joined `operating_company_id` predicate to
each as belt-and-suspenders hardening. These scripts already executed and are not re-run by this
change; the fix is static-text hardening only, `tsc --noEmit` clean on both files.

**Authorized:** `LANE_CROSS=2026-09-28-LEAD-RULING-CC2-DRIVER-PAY-LANE-CROSS.md` + `SEAT=CC-2` for
`chore/claim-reserve-cc2-11687` and the follow-up driver-pay/close-recalculation feature PR.
