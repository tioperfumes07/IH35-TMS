#!/usr/bin/env node
/**
 * LEAD 443.251 items 4–7 (owner, 2026-10-22 6:00 PM CT): "the range, should be in a filter format … the columns
 * arent adjustible … the driver name column … if i only select certain days, the rest of the days should not be
 * empty, those columns need to move".
 *
 * Static guard over the ONE planner grid + shared range state (all four planners render through them):
 *   R1  the range controls live INSIDE the Filters popover (extra slot), never as a row outside it; chips render;
 *   R2  presets Today / This week / Next 7 days / 14 days come from the company date;
 *   R3  "Show days" toggles exist and the drawn day set is weekday-filtered (visiblePlannerDays);
 *   R4  the day width fills the grid (no 120px cap); hidden-day bar edges snap by side; hour ticks 6/12/18;
 *   R5  the frozen columns are resizable (useResizableColumns) and persisted per user (storageScope);
 *   R6  a bar cut by the range says "← started" / "continues →";
 *   R7  the Driver planner passes the visible days into its grid;
 *   R8  overlapping bars in one row stack into sub-lanes (13690 under 13693 on T177, live 10-22) and the truck
 *       planner shows the driver in the wide secondary column, proper-cased.
 * --selftest plants each regression and requires a FAIL.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = "apps/frontend/src/pages/dispatch/planners";
const FILES = {
  layout: `${DIR}/DispatchPlannersLayout.tsx`,
  range: `${DIR}/planner-range.ts`,
  context: `${DIR}/PlannerRangeContext.tsx`,
  grid: `${DIR}/PlannerGrid.tsx`,
  driver: `${DIR}/DriverPlanner.tsx`,
  driverGrid: `${DIR}/SafetyDriverSchedulerGrid.tsx`,
  truck: `${DIR}/TruckPlanner.tsx`,
  bar: "apps/frontend/src/components/planner/UniversalFilterBar.tsx",
};

export function audit(s) {
  const f = [];
  const need = (rule, cond, msg) => {
    if (!cond) f.push(`${rule}: ${msg}`);
  };
  // R1
  need("R1", /extra=\{[\s\S]{0,120}<PlannerRangeToolbar \/>/.test(s.layout), "the range toolbar is not inside the Filters popover (extra slot)");
  need("R1", !/<\/UniversalFilterBar>\s*\n?\s*<PlannerRangeToolbar \/>|\/>\s*\n\s*<PlannerRangeToolbar \/>\s*\n\s*<\/>/.test(s.layout), "a range button row renders outside the Filters popover");
  need("R1", /\{extra\}/.test(s.bar), "UniversalFilterBar does not render page controls inside the popover");
  need("R1", /<PlannerFilterChips \/>/.test(s.layout), "active filters do not render as chips");
  // R2
  need("R2", /PLANNER_PRESET_KEYS[^=]*=\s*\["today", "this_week", "next_7", "next_14"/.test(s.layout), "presets are not Today / This week / Next 7 / 14 days");
  need("R2", /plannerPresetRange\(next\.period/.test(s.layout), "planner presets are not computed from the company date");
  // R3
  need("R3", /<PlannerShowDays \/>/.test(s.layout), "no Show-days toggles");
  need("R3", /visiblePlannerDays\(range, hiddenWeekdays\)/.test(s.range), "the drawn days are not weekday-filtered");
  // R4
  need("R4", !/Math\.min\(120,/.test(s.grid), "day width is capped at 120px — selected days do not fill the grid");
  need("R4", /clampDayIndex\(days, bar\.startYmd, "start"\)/.test(s.grid) && /clampDayIndex\(days, bar\.endYmd, "end"\)/.test(s.grid), "bar edges on hidden days do not snap by side");
  need("R4", /PLANNER_HOUR_TICKS = \[6, 12, 18\]/.test(s.grid) && /planner-hour-tick/.test(s.grid), "no hour ticks at 6/12/18");
  // R5
  need("R5", /useResizableColumns\(/.test(s.grid) && /planner-col-resize-/.test(s.grid), "frozen columns are not resizable");
  need("R5", /storageScope/.test(s.grid) && /storageScope: auth\.user\?\.uuid/.test(s.context), "column widths are not persisted per user");
  // R6
  need("R6", /← started/.test(s.grid) && /continues →/.test(s.grid), "a bar cut by the range does not say started / continues");
  // R7
  need("R7", /days=\{days\}/.test(s.driver) && /visibleDays \?\?/.test(s.driverGrid), "the Driver planner draws every day regardless of Show days");
  // R8
  need("R8", /export function stackPlannerBars\(/.test(s.grid) && /stacked\.lane\.get\(bar\.id\)/.test(s.grid), "overlapping bars in one row are drawn on top of each other");
  need("R8", /secondary: row\.driverName \?/.test(s.truck) && !/unit: row\.driverName \?/.test(s.truck) && /driverName: dr\.driver_name \? formatPersonName\(String\(dr\.driver_name\)\) : null/.test(s.truck), "the truck planner squeezes the driver into the 56px unit column / not proper-cased");
  return f;
}

function load() {
  const out = {};
  for (const [k, rel] of Object.entries(FILES)) out[k] = fs.readFileSync(path.join(ROOT, rel), "utf8");
  return out;
}

if (process.argv.includes("--selftest")) {
  const real = load();
  const base = audit(real).length;
  const plant = (key, from, to) => {
    if (!real[key].includes(from)) return null;
    return audit({ ...real, [key]: real[key].replace(from, to) }).length > base;
  };
  const cases = [
    ["range toolbar back outside the popover FAILS", plant("layout", "extra={", "data-x={")],
    ["UTC presets instead of the company date FAIL", plant("layout", "plannerPresetRange(next.period", "void (next.period")],
    ["every day drawn regardless of Show days FAILS", plant("range", "visiblePlannerDays(range, hiddenWeekdays)", "listPlannerDays(range)")],
    ["the 120px day cap FAILS", plant("grid", "return Math.max(44, available / days.length);", "return Math.max(44, Math.min(120, available / days.length));")],
    ["fixed (non-resizable) columns FAIL", plant("grid", "useResizableColumns(", "useFixedColumns(")],
    ["no continues marker FAILS", plant("grid", '"continues →"', '""')],
    ["driver grid ignoring the visible days FAILS", plant("driver", "days={days}", "")],
    ["bars drawn without their stacked lane FAIL", plant("grid", "stacked.lane.get(bar.id)", "stackedLaneIgnored")],
    ["driver back in the unit slot FAILS", plant("truck", "secondary: row.driverName ?", "unit: row.driverName ?")],
    ["raw ALL-CAPS truck-planner driver name FAILS", plant("truck", "driverName: dr.driver_name ? formatPersonName(String(dr.driver_name)) : null", "driverName: dr.driver_name ? String(dr.driver_name) : null")],
  ];
  let bad = 0;
  for (const [n, ok] of cases) {
    console.log(`  ${ok ? "✓" : "✗"} ${n}${ok === null ? " (plant anchor missing)" : ""}`);
    if (!ok) bad += 1;
  }
  console.log(bad ? "verify-planner-selected-days-fill-and-filters --selftest FAIL" : `verify-planner-selected-days-fill-and-filters --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}

const failures = audit(load());
if (failures.length) {
  console.error(`verify-planner-selected-days-fill-and-filters: FAIL — ${failures.length}`);
  for (const x of failures) console.error(`  ✗ ${x}`);
  process.exit(1);
}
console.log("verify-planner-selected-days-fill-and-filters: OK — range in Filters, selected days fill the grid, resizable persisted columns, started/continues markers, stacked bars (R1–R8)");
