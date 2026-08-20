#!/usr/bin/env node
/**
 * ACCT-F5625 — fuel.fuel_transactions.load_id is legitimately NULL on the large majority of rows
 * (fuel cards swipe with no load at ingest time), but those same rows overwhelmingly DO carry a real
 * unit_id (indexed, populated at ingest — see fuel.fuel_transactions itself). All three fleet
 * money-reporting queries that attribute fuel cost to a truck joined ONLY through load_id, silently
 * computing $0.00 fuel cost for every truck whose fuel spend has no load_id — confirmed live on prod:
 * 1,416 of 1,556 TRANSP fuel rows have unit_id but zero have load_id, worth $571,802.14 that never
 * reached Unit Financial P&L, Profit-per-Truck, or Cost-Per-Mile.
 *
 * Each query must attribute via COALESCE(<load's assigned unit>, ft.unit_id) — the load-attributed
 * path first (preserving prior behavior for rows that DO have a load), falling back to the
 * transaction's own unit_id — and must exclude archived rows (ft.archived_at IS NULL, the same
 * void-not-delete predicate every other fuel_transactions consumer already applies).
 */
import fs from "node:fs";

const TARGETS = [
  { file: "apps/backend/src/mdata/unit-financial.service.ts", label: "Fleet Unit Financial P&L" },
  { file: "apps/backend/src/reports/profit-per-truck.routes.ts", label: "Profit-per-Truck report" },
  { file: "apps/backend/src/reports/per-truck-cpm/cpm-calculator.service.ts", label: "Per-Truck CPM calculator" },
];

export function run(root = process.cwd()) {
  const failures = [];

  for (const { file, label } of TARGETS) {
    const src = fs.readFileSync(`${root}/${file}`, "utf8");

    // Must find a fuel_transactions query using the COALESCE unit-attribution fallback — anchored on
    // "COALESCE(...assigned_unit_id, ft.unit_id" or the symmetric "COALESCE(l.assigned_unit_id" shape
    // used across all three files.
    const hasCoalesceFallback =
      /COALESCE\(\s*l\.assigned_unit_id\s*,\s*ft\.unit_id\s*\)/i.test(src) &&
      src.includes("fuel.fuel_transactions");
    if (!hasCoalesceFallback) {
      failures.push(
        `${label} (${file}) does not attribute fuel via COALESCE(l.assigned_unit_id, ft.unit_id) — fuel with no load_id is silently $0`
      );
    }

    // The fuel_transactions join must be a LEFT JOIN, not an INNER JOIN — an inner join to
    // mdata.loads/load_scope would drop every no-load fuel row before the fallback ever applies.
    // Anchored on "FROM fuel.fuel_transactions" specifically (not any mention of the string, which
    // also appears in this file's own explanatory SQL comments above the real query).
    const fuelBlockMatch = src.match(/FROM\s+fuel\.fuel_transactions[\s\S]{0,600}/i);
    if (!fuelBlockMatch) {
      failures.push(`${label} (${file}) has no "FROM fuel.fuel_transactions" query to check`);
    } else if (!/LEFT\s+JOIN/i.test(fuelBlockMatch[0])) {
      failures.push(`${label} (${file}) must LEFT JOIN (not JOIN) to the load side of the fuel attribution`);
    }

    if (!/ft\.archived_at\s+IS\s+NULL/i.test(src)) {
      failures.push(`${label} (${file}) must exclude archived fuel_transactions rows (ft.archived_at IS NULL)`);
    }
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-fleet-fuel-unit-attribution-");
  const mk = (rel, body) => {
    fs.mkdirSync(`${tmp}/${rel.split("/").slice(0, -1).join("/")}`, { recursive: true });
    fs.writeFileSync(`${tmp}/${rel}`, body);
  };
  const good = `
    SELECT COALESCE(SUM(ROUND(ft.total_cost::numeric * 100)), 0)::text AS fuel_cents
    FROM fuel.fuel_transactions ft
    LEFT JOIN mdata.loads l ON l.id = ft.load_id
    WHERE ft.operating_company_id = $1::uuid
      AND ft.archived_at IS NULL
      AND COALESCE(l.assigned_unit_id, ft.unit_id) = $2::uuid
  `;
  for (const { file } of TARGETS) mk(file, good);
  if (run(tmp).length) throw new Error("PASS fail: " + run(tmp).join("; "));

  // Regression 1: the old load_id-only INNER JOIN, no fallback at all.
  const bad = `
    SELECT COALESCE(SUM(ROUND(ft.total_cost::numeric * 100)), 0)::text AS fuel_cents
    FROM fuel.fuel_transactions ft
    JOIN mdata.loads l ON l.id = ft.load_id
    WHERE ft.operating_company_id = $1::uuid
      AND l.assigned_unit_id = $2::uuid
  `;
  mk(TARGETS[0].file, bad);
  let f = run(tmp);
  if (!f.length) throw new Error("FAIL fail: load_id-only INNER JOIN with no fallback should be caught");
  if (!f.some((m) => m.includes("Fleet Unit Financial P&L"))) {
    throw new Error("FAIL fail: message should name the Fleet Unit Financial P&L target");
  }
  mk(TARGETS[0].file, good); // restore

  // Regression 2: fallback present but still an INNER JOIN (LEFT JOIN dropped by accident).
  mk(TARGETS[1].file, good.replace("LEFT JOIN mdata.loads", "JOIN mdata.loads"));
  f = run(tmp);
  if (!f.length) throw new Error("FAIL fail: INNER JOIN (fallback unreachable) should be caught");
  mk(TARGETS[1].file, good); // restore

  // Regression 3: archived_at filter dropped.
  mk(TARGETS[2].file, good.replace("AND ft.archived_at IS NULL\n", ""));
  f = run(tmp);
  if (!f.length) throw new Error("FAIL fail: missing archived_at IS NULL should be caught");

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-fleet-fuel-cost-attributes-via-unit-id --selftest OK");
} else {
  const f = run();
  if (f.length) {
    console.error(f.join("\n"));
    process.exit(1);
  }
  console.log("verify-fleet-fuel-cost-attributes-via-unit-id — OK");
}
