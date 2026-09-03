#!/usr/bin/env node
/**
 * verify-dispatch-overview-units-kpi-full-drill.mjs
 *
 * PASTE-ALL-SEATS-LOAD-COSTS-ELEMENT-MANIFEST-2026-09-03 Packet E — "Finish Dispatch Load-board
 * KPI drill-through... tile.value === drill.rowCount."
 *
 * THE DEFECT THIS PINS: DispatchOverview.tsx's own header comment states the law ("Tile value
 * must equal the drill table row count") for its 5-tile "Loads — live board" strip. Two of those
 * tiles ("Units available", "Units needing return") have no dedicated list PAGE to drill to --
 * units are a fleet-bounded dataset, not load-volume-bounded, so their `to` is an in-page anchor
 * (#unassigned-units / #units-needing-return) pointing at a panel rendered lower on the SAME page.
 * Both panels used to `.slice(0, PANEL_ROW_LIMIT)` (6) like every other preview panel on this page
 * -- correct for the OTHER panels, which are previews of data a dedicated route also shows in
 * full, but wrong here: once a fleet has more than 6 idle or return-pending units, the tile said
 * (say) 9 while the only place that tile's own click took you showed 6, with no further escape
 * hatch for the missing 3. Root cause: one shared PANEL_ROW_LIMIT slice pattern applied uniformly
 * to two panels that are NOT previews of something else -- they ARE the whole answer.
 *
 * FIX: both panels render every matching unit (no slice); the "Units available" tile's `to`
 * moved from the unrelated general loads board (`/dispatch?view=loads`, which does not show
 * units-without-load data at all) to the panel that actually holds the counted units.
 *
 * Static, source-level checks only.
 */
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/dispatch/DispatchOverview.tsx";

function violations(src) {
  const errors = [];

  if (!/to="\/dispatch#unassigned-units"/.test(src)) {
    errors.push('"Units available" tile must drill to #unassigned-units (the panel holding the units it counts), not an unrelated route');
  }
  if (!/to="\/dispatch#units-needing-return"/.test(src)) {
    errors.push('"Units needing return" tile must drill to #units-needing-return');
  }
  if (!/id="unassigned-units"/.test(src)) {
    errors.push('the "Unassigned units" panel is missing its id="unassigned-units" anchor target');
  }
  if (!/id="units-needing-return"/.test(src)) {
    errors.push('the "Units needing return" panel is missing its id="units-needing-return" anchor target');
  }

  // Neither units panel may re-introduce a PANEL_ROW_LIMIT slice: that would silently truncate the
  // panel below the tile's own count once the fleet exceeds the limit. Scope the check to each
  // panel's own block (from its id= wrapper to the next sibling DataPanel/section) so a slice on an
  // unrelated panel elsewhere in the file is never mistaken for a regression here.
  const panelBlock = (anchorId) => {
    const start = src.indexOf(`id="${anchorId}"`);
    if (start < 0) return "";
    const nextSectionStart = src.indexOf("<DataPanel", src.indexOf("</DataPanel>", start));
    const end = nextSectionStart > start ? nextSectionStart : start + 2000;
    return src.slice(start, end);
  };
  if (/\.slice\(0,\s*PANEL_ROW_LIMIT\)/.test(panelBlock("unassigned-units"))) {
    errors.push('"Unassigned units" panel must render every row (no PANEL_ROW_LIMIT slice) -- it is the tile\'s only drill target');
  }
  if (/\.slice\(0,\s*PANEL_ROW_LIMIT\)/.test(panelBlock("units-needing-return"))) {
    errors.push('"Units needing return" panel must render every row (no PANEL_ROW_LIMIT slice) -- it is the tile\'s only drill target');
  }

  return errors;
}

function check(src) {
  const errors = violations(src);
  if (errors.length) throw new Error(errors.join("; "));
}

const src = fs.readFileSync(FILE, "utf8");

if (process.argv.includes("--selftest")) {
  const mutations = [
    src.replace('to="/dispatch#unassigned-units"', 'to="/dispatch?view=loads"'),
    src.replace('to="/dispatch#units-needing-return"', 'to="/dispatch?view=loads"'),
    src.replace('id="unassigned-units"', 'id="unassigned-units-renamed"'),
    src.replace('id="units-needing-return"', 'id="units-needing-return-renamed"'),
    src.replace("unitsWithoutLoad.map((unit: UnitsWithoutLoad) => (", "unitsWithoutLoad.slice(0, PANEL_ROW_LIMIT).map((unit: UnitsWithoutLoad) => ("),
    src.replace("returnUnits.map((unit) => (", "returnUnits.slice(0, PANEL_ROW_LIMIT).map((unit) => ("),
  ];
  let caught = 0;
  for (const [index, mutated] of mutations.entries()) {
    try {
      check(mutated);
    } catch {
      caught += 1;
      continue;
    }
    throw new Error(`selftest mutation ${index + 1} escaped detection`);
  }
  try {
    check(src);
  } catch (error) {
    throw new Error(`selftest good file failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (caught !== mutations.length) throw new Error(`selftest caught ${caught}/${mutations.length} planted regressions`);
  console.log(`PASS verify-dispatch-overview-units-kpi-full-drill --selftest (${caught}/${mutations.length})`);
} else {
  check(src);
  console.log("PASS verify-dispatch-overview-units-kpi-full-drill");
}
