#!/usr/bin/env node
/**
 * REG-038 (owner 2026-09-10/11, verbatim): "the kpis in dispatch home are not real ... each kpi
 * must have its own columns and look clean." Reuses the pattern already established by CC-1's
 * verify-no-dead-kpi-cards (which already generically covers this file for hardcoded-value theater)
 * with a narrower, REG-038-specific structural contract:
 *
 *   1. Dispatch Home renders 8 top-level KPI tiles, each drilling to a real anchor/route -- includes
 *      the two net-new tiles this ticket added (Round-trip exposure, Days since last delivery), so a
 *      future edit cannot silently drop one back to a bare unclickable number.
 *   2. The four REG-038 panels (Units needing return / Unassigned units / Days since last delivery /
 *      Round-trip exposure) each mount the shared KpiColumnHeader with a real Unit/Driver/Load column
 *      set -- not the old single-span "unit · driver · load" concatenation.
 *   3. Round-trip exposure no longer slices to PANEL_ROW_LIMIT (it is now a KPI-tile-backed panel
 *      bound by this file's own "tile value must equal drill table row count" law).
 *   4. The backend units-without-load endpoint selects a real last-delivered load id/number (the
 *      Load-column data source for 3 of the 4 panels above), not just a bare timestamp.
 *
 * Self-testing static guard. Run: node scripts/verify-reg038-dispatch-home-kpi-columns.mjs [--selftest]
 */
import fs from "node:fs";

const FRONTEND_FILE = "apps/frontend/src/pages/dispatch/DispatchOverview.tsx";
const BACKEND_FILE = "apps/backend/src/dispatch/loads.routes.ts";

const originals = {
  frontend: fs.readFileSync(FRONTEND_FILE, "utf8"),
  backend: fs.readFileSync(BACKEND_FILE, "utf8"),
};

const KPI_TILES = [
  "Active loads",
  "Delivered — pending docs",
  "At-risk / late",
  "Detention",
  "Units available",
  "Units needing return",
  "Round-trip exposure",
  "Days since last delivery",
];

const REG038_PANEL_TESTIDS = [
  "dispatch-units-needing-return-panel",
  "dispatch-unassigned-units-panel",
  "dispatch-days-since-last-delivery-panel",
  "dispatch-round-trip-exposure-panel",
];

/** Extracts the source block for one `<KpiCard ... />` call by its label, so contract 1 can
 * check that specific tile's own `to=`/drill wiring without a whole-file substring search. */
function kpiCardBlock(source, label) {
  const re = new RegExp(`<KpiCard\\s+label="${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[\\s\\S]*?\\/>`);
  return re.exec(source)?.[0] ?? "";
}

/** Extracts the source block for one panel: from its `data-testid="..."` marker to the FIRST
 * `</DataPanel>` closing tag after it (DataPanel calls in this file never nest), so contract 2/3
 * can assert against just that panel's own JSX -- not a sibling panel's identical column labels,
 * and not accidentally run past it into an UNRELATED later panel that legitimately still uses
 * PANEL_ROW_LIMIT (a naive "next `<div id=` " boundary undershoots here, since most sibling panels
 * below Round-trip exposure are bare `<DataPanel>` calls with no wrapping id div at all). */
function panelBlock(source, testId) {
  const start = source.indexOf(`data-testid="${testId}"`);
  if (start === -1) return "";
  const close = source.indexOf("</DataPanel>", start);
  if (close === -1) return "";
  return source.slice(start, close + "</DataPanel>".length);
}

const contracts = [
  [
    "all 8 KPI tiles present, each with a real drill (to=) -- not a bare number",
    (files) => {
      for (const label of KPI_TILES) {
        const block = kpiCardBlock(files.frontend, label);
        if (!block) return false;
        if (!/to=(\{[^}]+\}|"[^"]+")/.test(block)) return false;
      }
      return true;
    },
    (files) => ({
      ...files,
      frontend: files.frontend.replace(
        /(<KpiCard\s+label="Round-trip exposure"[\s\S]*?)to="\/dispatch#round-trip-exposure"/,
        "$1REMOVED_DRILL"
      ),
    }),
  ],
  [
    "each of the 4 REG-038 panels mounts a real Unit/Driver/Load KpiColumnHeader, not a concatenated span",
    (files) => {
      for (const testId of REG038_PANEL_TESTIDS) {
        const block = panelBlock(files.frontend, testId);
        if (!block) return false;
        if (!/<KpiColumnHeader columns=\{\[[^\]]*"Unit"[^\]]*"Driver"[^\]]*"Load"[^\]]*\]\}/.test(block)) return false;
      }
      return true;
    },
    (files) => ({
      ...files,
      frontend: files.frontend.replace(
        /(data-testid="dispatch-days-since-last-delivery-panel"[\s\S]*?)<KpiColumnHeader/,
        "$1<KpiColumnHeaderREMOVED"
      ),
    }),
  ],
  [
    "Round-trip exposure panel renders every row (no PANEL_ROW_LIMIT slice) now that it backs a KPI tile",
    (files) => {
      const block = panelBlock(files.frontend, "dispatch-round-trip-exposure-panel");
      // Checks the actual .slice(...) CALL, not the bare word -- this file's own explanatory
      // comments legitimately mention "PANEL_ROW_LIMIT" in prose (e.g. explaining why this panel no
      // longer slices), and a naive whole-word check would flag its own commentary as the violation.
      return block.length > 0 && !/\.slice\(\s*0\s*,\s*PANEL_ROW_LIMIT\s*\)/.test(block);
    },
    (files) => ({
      ...files,
      frontend: files.frontend.replace(
        /(data-testid="dispatch-round-trip-exposure-panel"[\s\S]*?)exposureLoads\.map/,
        '$1exposureLoads.slice(0, PANEL_ROW_LIMIT).map'
      ),
    }),
  ],
  [
    "backend units-without-load selects a real last-delivered load id + number (the Load-column data source)",
    (files) =>
      /last_delivery\.load_id AS last_delivered_load_id/.test(files.backend) &&
      /last_delivery\.load_number AS last_delivered_load_number/.test(files.backend),
    (files) => ({
      ...files,
      backend: files.backend.replace("last_delivery.load_id AS last_delivered_load_id,", ""),
    }),
  ],
];

function audit(files) {
  const errors = [];
  for (const [name, test] of contracts) {
    if (!test(files)) errors.push(name);
  }
  return errors;
}

const failures = audit(originals);
if (failures.length) {
  console.error(`[verify-reg038-dispatch-home-kpi-columns] FAILED\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  let caught = 0;
  for (const [name, test, mutate] of contracts) {
    const mutated = mutate(originals);
    if (mutated.frontend === originals.frontend && mutated.backend === originals.backend) {
      throw new Error(`selftest mutate() was a no-op for: ${name}`);
    }
    if (!test(mutated)) caught += 1;
    else throw new Error(`selftest failed to catch: ${name}`);
  }
  console.log(`[verify-reg038-dispatch-home-kpi-columns] SELFTEST PASS — ${caught}/${contracts.length} mutations detected`);
  process.exit(0);
}

console.log(
  "[verify-reg038-dispatch-home-kpi-columns] OK — 8 KPI tiles all drill to real data, 4 REG-038 panels render real Unit/Driver/Load columns, Round-trip exposure unsliced, backend Load-column source present"
);
