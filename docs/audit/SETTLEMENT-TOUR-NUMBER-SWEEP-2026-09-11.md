# Settlement/Tour Number Sweep — owner order 2026-09-11

**Owner order (verbatim):** "make sure anywhere settlements, load costs, pre settlements exist
that a column has the settlement/tour number, that the settlement or presettlement number is
assigned automatically when a new load is created and that all loads detect and set/add loads to
the correct settlement."

Lane: CC-1 (financial). Boundary respected: no banking/reconciliation (CC-2's REG-028/030) or
Kanban UI (CC-3) touched anywhere in this sweep.

---

## Part 1 — COLUMN SWEEP

**Shipped:** PR #21748, merged `2b0780989b` (2026-09-11).

39 surfaces checked across `apps/frontend/src` that list/detail settlements, pre-settlements, or
load costs (`driver_finance.driver_settlements`, load-costs board/table, every settlement/
pre-settlement list-or-detail component). All 39 already receive the `S-YYYY-NNNN` settlement/
tour number from their API. 37 of 39 already render it with `alwaysVisible: true` (cannot be
hidden via the gear) — most notably the `BillsPage.tsx` `settlement_display_id` column shipped
under REG-017, the precedent this pass matched.

**2 genuine gaps found, both fixed:**

| Surface | File:line | Was | Now |
|---|---|---|---|
| Vendors transaction-drill table | `apps/frontend/src/pages/Vendors.tsx:481` | `defaultHidden: true` (opt-in only) | `alwaysVisible: true` |
| Customers transaction-drill table | `apps/frontend/src/pages/Customers.tsx:1006` | `defaultHidden: true` (opt-in only) | `alwaysVisible: true` |
| Factoring Invoice Status tab | `apps/frontend/src/pages/factoring/FactoringHome.tsx:1434` | no visibility flag (user-hideable, stays hidden forever once toggled) | `alwaysVisible: true` |

**Live proof:** `apps/frontend` `tsc -b` exit 0; `node scripts/verify-settlement-number-always-visible.mjs --selftest` 5/5; live run OK against `origin/main`'s real source (post-merge forensic:
`git show origin/main:apps/frontend/src/pages/Vendors.tsx` etc. all confirmed carrying
`alwaysVisible: true` after the squash).

**Guard:** `scripts/verify-settlement-number-always-visible.mjs` + `scripts/verify-steps/11201-verify-settlement-number-always-visible.mjs` (verify-step 11201, claimed via PR #21745).

---

## Part 2 — AUTO-ASSIGN ON LOAD CREATE

**No code change — confirmed already correct.**

**Correct trigger point (verified against the architecture, not assumed):**
`docs/audit/TOUR-SPLIT-PLAN-2026-09-06.md` §7 ("Ratified sequencing for the eventual `--apply`",
owner ruling 2026-09-06) names `book-load.service.ts` calling
`presettlement-link.service.ts`'s `confirmPresettlementLink` (via `create_new` / `link_existing`)
**at booking time** as the existing, owner-reviewed correct pattern — not a later lifecycle event.
This matches `presettlement-link.service.ts`'s own architecture: two atomic entry points,
`linkLoadToPresettlementAtBookingInClientTx` (booking — fires whenever driver_id + trip_type are
known at booking) and `linkLoadToPresettlementAfterAssignmentInClientTx` (REG-008, a
post-assignment fallback for the case booking-time didn't have enough information yet — not a
competing "later is correct" design, a catch-up for the one case booking-time genuinely cannot
resolve). There is no conflict with the locked architecture requiring a different trigger point;
booking-time (with a post-assignment catch-up fallback) is the correct design.

**Live proof (re-verified 2026-09-11, Neon `tiny-field-89581227`, `bypass_rls=lucia`):** the 10
most-recently-created USMCA loads (load numbers 13581–13589 and 13749/13743, spanning
2026-09-07 through 2026-09-11T00:54Z) all carry a non-null `presettlement_link_id` at query time —
**10 of 10**. No gap found; no code change needed for this part.

---

## Part 3 — AUTO-DETECT + ATTACH

**Shipped:** this PR.

**Audit method:** company-wide live query on Neon prod, USMCA scope, cross-checking
`mdata.loads.presettlement_link_id` against (a) load status (a cancelled-before-assignment load
correctly has no link — expected state, not a defect) and (b) the canonical
`COALESCE(driver_bills.load_id, settlement_lines.load_id)` load-resolution shape from the
ACCT-F275/F290 owner ruling, joined against each load's own link.

**Findings (both re-confirmed live immediately before this PR, 2026-09-11):**

1. **1 orphan, now 0.** Load **13508** (closed, driver ANGEL ALFONSO SOSA /
   `fba21d80-628b-4228-ae54-336f9cbb73b6`) had `presettlement_link_id = NULL` despite having its
   own real, already-closed settlement **S-2026-0007** (`27c304e2-652d-4972-9bd4-f396b394893c`)
   whose `first_load_id` AND `last_load_id` both exactly equal load 13508 — a clean, unambiguous
   1:1 match, confirmed live before writing. Backfilled via a single additive, idempotent UPDATE
   (`scripts/ops/backfill-load-13508-presettlement-link.mjs`, applied directly on Neon prod
   `br-fancy-credit-akjnd07a` 2026-09-11, independently re-verified read-only in a separate
   transaction afterward). Company-wide re-sweep post-fix: **0 orphaned non-cancelled USMCA loads.**
   A second load, **13556**, has no link but is legitimately expected state — cancelled before
   ever being assigned a driver (`assigned_primary_driver_id IS NULL`) — and is correctly excluded
   by the guard's own `status != 'cancelled'` filter.

2. **2 misattached settlement lines — flagged, not fixed (out of scope this pass).** Load 13508's
   2 deduction lines ($10.00, $25.00) sit on a DIFFERENT settlement, **S-2026-0015**
   (`1f67ae0f-189f-45fc-a8bb-7514e4150a28` — a different driver's closed settlement), instead of
   13508's own S-2026-0007. Confirmed a company-wide one-off, not systemic, via a separate
   cross-check. Correcting a line already inside a CLOSED settlement is an audited-reversal-class
   change (touches already-settled money) — not attempted blindly in this pass, matching this
   session's established practice for closed-money corrections. Tracked in
   `scripts/.load-settlement-linkage-misattached-baseline.json` (count 2) so it cannot silently
   grow, and left for an owner-reviewed reversal to close to 0.

**Root cause of how orphans like 13508 occur (identified, NOT fixed this pass):**
`presettlement-link.service.ts`'s deferred path — when `trip_type` is unknown at booking or
post-assignment — writes only a `dispatch.load.presettlement_link_deferred` audit-log entry and
returns; it never creates a row in the human-review queue table
`driver_finance.presettlement_link_suggestions`, and nothing ever reads that audit event back.
This is the exact mechanism the service's own header comment names as having produced loads
13581, 13580, and 13508 as live incidents. Wiring the deferred audit event into a visible queue
row is a real fix but a separate, larger scoped change (a new write path + a review-queue UI
surface) than "detect and fix the loads currently affected" — flagged here as the durable
preventive fix still needed, not attempted in this pass. **REMAINING**, tracked, not deferred-and-
forgotten.

**Also flagged, not fixed (pre-existing, lower priority, no live defect caused by it yet):**
`dispatch/cancellation.service.ts:337-345` uses a non-canonical, narrower load-resolution shape
(`settlement_lines.load_id = $1` only, skipping the `driver_bills.load_id` canonical join) when
resolving a cancelled load's settlement lines. Has not manifested as a live defect (confirmed via
the same company-wide sweep — no cancellation-path mis-resolution found), but is out of the
canonical shape and worth a future narrow fix.

**Guard (permanent detection mechanism — did not exist anywhere in the codebase before this PR,
confirmed: no cron, no health route, no `/api` endpoint; the only prior art was
`scripts/ops/link-orphan-loads-presettlement.ts`, a one-off repair with a hardcoded 2-load
`TARGETS` array, not a scan):** `scripts/verify-load-settlement-linkage.mjs`, wired as an explicit
step in `.github/workflows/prod-postdeploy-verify.yml` (live-prod-only, same convention as its
sibling `verify-no-unmanifested-prod-financial-fixtures.mjs` — SKIPs locally without
`DATABASE_URL`, runs for real against `PROD_READONLY_DATABASE_URL` post-deploy). Two shrink-only
ratchet baselines: orphans (0) and misattached lines (2, the known flagged pair above) — any NEW
occurrence of either class fails the build.

**Live proof:** pre-fix sweep found exactly 1 orphan + 2 misattached lines (matching the guard's
own selftest regression case, which reproduces load 13508's exact shape); backfill applied and
independently re-verified read-only in a separate transaction; post-fix company-wide sweep = 0
orphaned non-cancelled USMCA loads.

---

## DONE summary

| Part | Status | Proof |
|---|---|---|
| 1. Column sweep | ✅ 39 checked, 2 fixed | PR #21748 merged + post-merge source forensic |
| 2. Auto-assign timing | ✅ confirmed correct, no change needed | 10/10 most-recent loads linked at booking, verified against locked architecture doc |
| 3. Auto-detect + attach | ✅ 0 orphans (was 1, fixed), 2 misattached lines flagged (owner-review reversal needed), root cause identified | live before/after Neon queries + permanent guard shipped |
