# ROUND 8.9c — CURSOR + CASCADE — main red items in YOUR surface (Claude-Lead, 2026-11-10 4:30 PM CT / 22:30Z)

Measured on origin/main `f0afa5d`. Under ROUND 8.9a the merging seat fixes its own red within 15 minutes. Lead cannot edit these files: they are in your §0b surface, and only your own seat can add the SURFACE-BREACH-AUTHORIZED line for them.

## CURSOR — `apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx` (your #28796 `8a7c8fd`, UI-D1-D2)
1. **verify-ui-design-system-ratchet** FAIL: `off_locked_scale_sizes 0 -> 8` and `raw_font_sizes 129 -> 138`. The cause is 8 × `text-[10.5px]` plus 1 other raw size, in the charges grid labels, Accessorial and Total.
   - Required: `.text-section-header` (11px) for labels and `text-xs` (12px) for values. Raw `text-[12.5px]` must use the scale too.
   - The same file also fails **verify-go26-consolidation-ratchet** (`raw_text_off_locked_scale`).
2. **verify-money-cells-click-through** FAIL: 2 unwired money cells. These are the Accessorial total (`data-testid="book-load-accessorial-total"`) and the Total customer invoice read-out in the new charges grid.
   - Required: render each as `<MoneyCell cents={...} none="Live read-out of the booking form — the load and its invoice are created on submit" />`.
   - When you add those 2 declarations, raise `DECLARED_NO_DRILL` in scripts/verify-money-cells-click-through.mjs from 35 to 37. The owner adopted Lead's recommendation on 2026-11-10: they are form previews with no record behind them. Put that reason in the guard comment.
- Local gate before merge: those 3 guards (plain and --selftest) PASS, `(cd apps/frontend && npx tsc --noEmit -p .)` = 0, and verify-additive-only PASS.
- One PR. Deadline 2026-11-11 15:00Z. If missed, Claude-Lead takes the surface.

## CASCADE — `apps/frontend/src/pages/reports/boards/LoadsReportBoard.tsx`
**verify-fe-load-labels-and-status-sets** FAIL. #28529 gave LoadsReportBoard a private load-status label map.
- Required: build its status filter options from the shared `loadStatusLabel` set, so there is no private map. Lane B's version of the fix is on branch `claude/sweepB-entity-scope-2` (PR #28786, commit `b070a41`). Take the LoadsReportBoard.tsx hunk and the scripts/verify-fe-load-labels-and-status-sets.mjs change (its plant) from there.
- Local gate: that guard (plain and --selftest) PASS, plus the ui/go26 ratchets, verify-no-internal-language-in-prod-ui and frontend tsc.
- One PR. Deadline 2026-11-11 15:00Z.

Superseded and to be closed: #28781 (merged as #28799 without the Book Load hunk) and #28786 (merged as #28797 without LoadsReportBoard).

## ROUND 8.9d — CURSOR, two more reds from your merges (Claude-Lead, 2026-11-10 4:35 PM CT / 22:35Z, measured on origin/main `9f3a65b`)
3. **verify-entity-filters-multi-select** FAIL. This guard is in verify-steps 05 (arch-design), early in the chain, so it stops CI for every seat. Your #28798 `87af8a2` (UI-D3-D4) added it.
   - Location: `apps/frontend/src/pages/dispatch/planners/DispatchPlannersLayout.tsx:114`, the planner's Driver filter.
   - What's wrong: it uses a single-value `EntityPicker kind="driver"`. Entity FILTERS must use the shared `MultiSelectDropdown`; only single-value FORM fields are exempt.
   - Required: change `driverId: string` → `driverIds: string[]` in `PlannerEntityFilterState`, and make TruckPlanner's filter accept any of the ids.
4. **verify-every-selector-multi-select** FAIL: `raw <select> count grew: 3 > baseline 2`. The Status filter is a new native `<select id="planner-filter-status">` in the same file, from the same PR.
   - Required: replace it with `MultiSelectDropdown`. Never raise BASELINE.
5. **verify-no-nested-box / verify-layout-law / verify-factoring-nested-box-baseline** FAIL: `BookLoadModalV4.tsx: 2 nested box(es) (baseline 1)`, from your #28796.
   - Required: flatten the new inner frame of the charges grid. One frame, flat inside.
- Local gate: those 5 guards (plain and --selftest), plus the items 1–2 guards above and frontend tsc 0. You may ship one PR for items 1–5 or two PRs. Deadline 2026-11-11 15:00Z.

Lead's own reds from the same sweep are fixed: #28807 `9f3a65b` (stale-literals baseline measured_at; presettlement-autolink sees the Creator's join).
