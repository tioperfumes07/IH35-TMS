#!/usr/bin/env node
/**
 * Register rows 164 / 166 / 167 (LEAD 2026-11-03) — readers resolve through the canonical rule.
 *
 *  R164a  Fuel Home MTD spend + avg $/gal read readFuelPeriodSpend (fuel-period-spend.ts), never a private SUM/AVG.
 *  R164b  the shared reader counts live rows only (archived_at + voided_at NULL) and weights $/gal by gallons.
 *  R164c  the Fuel board strip reads the same reader (GET /fuel/spend-summary → getFuelSpendSummary).
 *  R166a  the unit→driver resolver joins the SURVIVOR of a merged shell.
 *  R166b  the scheduler grid's vacant trucks carry the resolver's driver; the Truck planner renders it.
 *  R166c  latest HOS clocks probe the driver AND its merged shells; the HOS poll roster includes Probation drivers.
 *  R167a  driver profile current truck = any OPEN pairing (no source = 'samsara_webhook' filter — 0 of 809 prod rows).
 *  R167b  driver profile credentials fill from merged shells; medical cards read across shells.
 *
 * Prod (read-only, 11-03): Home Oct $91,539.16 / $5.442 vs board $76,349.13 / $5.494 (24 archived+voided rows, $15,190.03);
 * Truck planner 0 of 16 trucks with a driver → 13 of 16; Angel Sosa open pairing T156 (source 'reconciled') hidden;
 * Angel's CDL exp 2029-09-22 only on merged shell fba21d80; 3 Probation drivers, 0 HOS snapshots in 24 h.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-rows-164-166-167-readers";
const FILES = {
  spend: "apps/backend/src/fuel/fuel-period-spend.ts",
  planner: "apps/backend/src/fuel/planner.routes.ts",
  strip: "apps/frontend/src/pages/fuel/components/FuelBoardKpiStrip.tsx",
  unitDriver: "apps/backend/src/dispatch/unit-current-driver.ts",
  scheduler: "apps/backend/src/safety/driver-scheduler.service.ts",
  truckPlanner: "apps/frontend/src/pages/dispatch/planners/TruckPlanner.tsx",
  hosClocks: "apps/backend/src/integrations/samsara/samsara-hos-clocks-pull.service.ts",
  roster: "apps/backend/src/integrations/samsara/active-hos-driver-roster.service.ts",
  aggregate: "apps/backend/src/mdata/driver-aggregate.service.ts",
  unitAggregate: "apps/backend/src/mdata/unit-aggregate.service.ts",
};

export function audit(s) {
  const f = [];
  // R164a
  if (!/readFuelPeriodSpend\(client, companyId, mtdRange\.from, mtdRange\.to\)/.test(s.planner)) f.push("R164a: Fuel Home MTD does not read readFuelPeriodSpend");
  if (/avg\(price_per_gallon\)/.test(s.planner)) f.push("R164a: Fuel Home computes a private unweighted avg(price_per_gallon)");
  if (/purchased_at >= date_trunc\('month', now\(\)\)/.test(s.planner)) f.push("R164a: Fuel Home sums a private UTC-month window");
  // R164b
  if (!/archived_at IS NULL AND \$\{alias\}\.voided_at IS NULL/.test(s.spend) || !/\$\{fuelLiveRowSql\("ft"\)\}/.test(s.spend)) f.push("R164b: shared fuel reader does not exclude archived/voided rows");
  if (!/sum\(ft\.total_cost\) FILTER \(WHERE ft\.gallons > 0\) \/ NULLIF\(sum\(ft\.gallons\)/.test(s.spend)) f.push("R164b: shared fuel reader avg $/gal is not volume-weighted");
  // R164c
  if (!/"\/api\/v1\/fuel\/spend-summary"[\s\S]{0,600}readFuelPeriodSpend\(/.test(s.planner)) f.push("R164c: GET /fuel/spend-summary does not read the shared reader");
  if (!/getFuelSpendSummary\(companyId, range\.from, range\.to\)/.test(s.strip)) f.push("R164c: Fuel board strip does not read getFuelSpendSummary");
  if (/agg\.total_spend_cents/.test(s.strip)) f.push("R164c: Fuel board strip still sums spend client-side");
  // R166a
  if (!/ON ud\.id = \$\{survivorDriverIdSql\("COALESCE\(unit_vda\.driver_id, unit_last_drv\.driver_id\)", companyParam\)\}/.test(s.unitDriver)) f.push("R166a: unit→driver resolver does not resolve merged shells to the survivor (in the company)");
  // R166b
  if (!/ud\.id::text AS driver_id[\s\S]{0,200}FROM mdata\.units u\s+\$\{unitCurrentDriverSql\("u", "\$1::uuid"\)\}/.test(s.scheduler)) f.push("R166b: scheduler vacant trucks do not carry the unit→driver resolver's driver");
  if (!/driverId: u\.driver_id \? String\(u\.driver_id\) : null/.test(s.truckPlanner)) f.push("R166b: Truck planner drops the vacant truck's driver");
  // R166c
  if (!/shell\.merged_into_driver_id = d\.id[\s\S]{0,400}h\.driver_uuid = ids\.id/.test(s.hosClocks)) f.push("R166c: latest HOS clocks ignore merged shells");
  if (!/d\.status IN \('Active', 'Probation'\)/.test(s.roster)) f.push("R166c: HOS poll roster drops Probation drivers");
  // R167a
  if (/vda\.source = 'samsara_webhook'/.test(s.aggregate)) f.push("R167a: driver profile current truck filters source = 'samsara_webhook'");
  if (/vda\.source = 'samsara_webhook'/.test(s.unitAggregate)) f.push("R167a: unit profile current driver filters source = 'samsara_webhook'");
  if (!/vda\.driver_id = ANY\(\$\{driverAndShellIdsSql\("\$1", "\$2"\)\}\)[\s\S]{0,120}vda\.ended_at IS NULL/.test(s.aggregate)) f.push("R167a: driver profile current truck ignores merged shells' open pairing");
  // R167b
  if (!/overlayShellCredentials\(\s*driver as Record<string, unknown>,\s*await loadMergedShellCredentials\(client, driverId, operatingCompanyId\)/.test(s.aggregate)) f.push("R167b: driver profile does not read credentials through merged shells");
  if (!/FROM safety\.medical_cards\s+WHERE driver_id = ANY\(\$\{driverAndShellIdsSql\("\$1", "\$2"\)\}\)/.test(s.aggregate)) f.push("R167b: medical cards not read across merged shells");
  return f;
}

const src = Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, fs.readFileSync(path.join(ROOT, rel), "utf8")]));

if (process.argv.includes("--selftest")) {
  const plant = (k, a, b) => (src[k].includes(a) ? audit({ ...src, [k]: src[k].replace(a, b) }).length > 0 : null);
  const cases = [
    ["clean sources pass", audit(src).length === 0],
    ["164a Home private SUM/AVG FAILS", plant("planner", "const mtd = await readFuelPeriodSpend(client, companyId, mtdRange.from, mtdRange.to);", "const mtd = { spend: 0, avg_price_per_gallon: 0 }; // avg(price_per_gallon)")],
    ["164b archived/voided counted FAILS", plant("spend", "${fuelLiveRowSql(\"ft\")}", "true")],
    ["164b unweighted avg FAILS", plant("spend", "(sum(ft.total_cost) FILTER (WHERE ft.gallons > 0) / NULLIF(sum(ft.gallons) FILTER (WHERE ft.gallons > 0), 0))", "avg(ft.price_per_gallon)")],
    ["164c board client-side sum FAILS", plant("strip", "getFuelSpendSummary(companyId, range.from, range.to)", "Promise.resolve(agg.total_spend_cents)")],
    ["166a shell driver not resolved FAILS", plant("unitDriver", "ON ud.id = ${survivorDriverIdSql(\"COALESCE(unit_vda.driver_id, unit_last_drv.driver_id)\", companyParam)}", "ON ud.id = COALESCE(unit_vda.driver_id, unit_last_drv.driver_id)")],
    ["166b vacant driver dropped (backend) FAILS", plant("scheduler", "      ${unitCurrentDriverSql(\"u\", \"$1::uuid\")}\n", "\n")],
    ["166b vacant driver dropped (planner) FAILS", plant("truckPlanner", "driverId: u.driver_id ? String(u.driver_id) : null", "driverId: null")],
    ["166c HOS ignores shells FAILS", plant("hosClocks", "h.driver_uuid = ids.id", "h.driver_uuid = d.id")],
    ["166c roster drops Probation FAILS", plant("roster", "d.status IN ('Active', 'Probation')", "d.status = 'Active'")],
    ["167a samsara_webhook-only filter FAILS", plant("aggregate", "        AND vda.operating_company_id = $2::uuid\n        AND vda.ended_at IS NULL", "        AND vda.operating_company_id = $2::uuid\n        AND vda.source = 'samsara_webhook'\n        AND vda.ended_at IS NULL")],
    ["167a unit profile samsara_webhook filter FAILS", plant("unitAggregate", "        AND vda.ended_at IS NULL", "        AND vda.source = 'samsara_webhook'\n        AND vda.ended_at IS NULL")],
    ["167b shell credentials ignored FAILS", plant("aggregate", "await loadMergedShellCredentials(client, driverId, operatingCompanyId)", "[]")],
    ["167b medical cards survivor-only FAILS", plant("aggregate", "FROM safety.medical_cards\n      WHERE driver_id = ANY(${driverAndShellIdsSql(\"$1\", \"$2\")})", "FROM safety.medical_cards\n      WHERE driver_id = $1::uuid")],
  ];
  let bad = 0;
  for (const [n, ok] of cases) {
    console.log(`  ${ok ? "✓" : "✗"} ${n}${ok === null ? " (plant anchor missing)" : ""}`);
    if (!ok) bad += 1;
  }
  console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}

const failures = audit(src);
if (failures.length) {
  console.error(`${LABEL}: FAIL — ${failures.length}`);
  for (const x of failures) console.error(`  ✗ ${x}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — fuel MTD/avg one reader; unit driver, HOS and driver profile resolve through merged shells and any open pairing`);
