#!/usr/bin/env node
/**
 * SETTLEMENT-SUMMARY-LOAD-COUNT-WRONG-DATE-AXIS — /reports/settlement-summary's per-driver "Loads"
 * count used to re-query mdata.loads filtered by created_at (booking date) BETWEEN the report's own
 * UI period AND assigned_primary_driver_id (the load's CURRENT live assignment) -- neither of which
 * reflects what the settlement actually paid for. A settlement's own period_start/period_end is when
 * it was closed/run, not when its underlying loads were booked, and assigned_primary_driver_id can
 * change after the fact (reassignment). Live-confirmed on prod: driver Juan USMCA-Battery's real,
 * closed settlement (period 2026-08-21) has a real settlement_lines row for a load booked
 * 2026-08-02 -- 19 days earlier -- gross pay $1,104.00 matching exactly, yet the report showed
 * "Loads: 0" for that driver.
 *
 * Fixed by deriving load_count from driver_finance.settlement_lines (which carries a real load_id
 * per settlement line), scoped to the SAME settlement ids the report already selected by period --
 * never by re-querying mdata.loads on an unrelated date/assignment axis.
 */
import fs from "node:fs";

const FILE = "apps/backend/src/reports/settlement-summary.routes.ts";
const source = fs.readFileSync(FILE, "utf8");

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function audit(text) {
  const failures = [];
  const need = (condition, message) => {
    if (!condition) failures.push(message);
  };

  const stripped = stripComments(text);

  need(
    /FROM driver_finance\.settlement_lines sl/.test(stripped),
    "the load-count query must select FROM driver_finance.settlement_lines -- the real per-settlement per-load linkage table"
  );
  need(
    /COUNT\(DISTINCT sl\.load_id\)/.test(stripped),
    "load_count must be COUNT(DISTINCT sl.load_id) from settlement_lines, not a count from an unrelated table"
  );
  need(
    /sl\.settlement_id = ANY\(\$1::uuid\[\]\)/.test(stripped),
    "the load-count query must scope to the same settlement ids settlementsRes already selected by period (settlementIds), not re-derive its own date filter"
  );
  // The old, wrong-axis query must not come back.
  need(
    !/assigned_primary_driver_id::text AS driver_id, COUNT\(\*\)::text AS load_count/.test(stripped),
    "the old mdata.loads-based load_count query (keyed on assigned_primary_driver_id + created_at) must not come back -- it uses the wrong date axis and the load's CURRENT assignment instead of who was actually settled"
  );

  return failures;
}

const failures = audit(source);
if (failures.length) {
  console.error(`verify-settlement-summary-load-count-from-settlement-lines FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    {
      name: "revert to the mdata.loads-based query",
      mutate: (t) =>
        t.replace(
          /SELECT s\.driver_id::text AS driver_id, COUNT\(DISTINCT sl\.load_id\)::text AS load_count[\s\S]*?GROUP BY s\.driver_id/,
          `SELECT assigned_primary_driver_id::text AS driver_id, COUNT(*)::text AS load_count
                FROM mdata.loads l
                WHERE l.operating_company_id = $1::uuid
                  AND l.assigned_primary_driver_id IS NOT NULL
                  AND l.created_at::date BETWEEN $2::date AND $3::date
                GROUP BY l.assigned_primary_driver_id`
        ),
    },
    {
      name: "count all lines instead of distinct load_id",
      mutate: (t) => t.replace("COUNT(DISTINCT sl.load_id)::text AS load_count", "COUNT(*)::text AS load_count"),
    },
    {
      name: "drop the settlement_id scoping",
      mutate: (t) => t.replace("sl.settlement_id = ANY($1::uuid[])\n                  AND ", ""),
    },
  ];
  let caught = 0;
  for (const { name, mutate } of mutations) {
    const mutated = mutate(source);
    if (mutated === source) throw new Error(`mutation "${name}" did not change the source -- test is inert`);
    if (audit(mutated).length === 0) throw new Error(`mutation escaped: "${name}" was not caught`);
    caught += 1;
  }
  console.log(
    `verify-settlement-summary-load-count-from-settlement-lines SELFTEST PASS — ${caught}/${mutations.length} mutations detected`
  );
}

console.log(
  "verify-settlement-summary-load-count-from-settlement-lines PASS — load_count derives from settlement_lines, scoped to the report's own settlement ids"
);
