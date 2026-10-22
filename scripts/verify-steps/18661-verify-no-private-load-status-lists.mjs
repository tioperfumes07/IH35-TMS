#!/usr/bin/env node
/**
 * LEAD 443.238 sweep A — register B5 / C1 + AUDIT2 F21 leftovers: private load-status lists that drifted from the one vocabulary.
 *   1. telematics/geofence-detector.service.ts resolveDriverIdForUnit named a GPS point's driver from the unit's latest load with
 *      `status NOT IN ('delivered','cancelled')` — invoiced / closed / voided / abandoned / draft loads leaked in. THE RULE: the
 *      unit's current load is the load service's board set (canonicalDispatchWorkWhereClause), earliest pickup first.
 *   2. reports/exception-queue.routes.ts "loads without a tour" (count + list) filtered `status <> 'cancelled'` only — voided loads
 *      counted as needing a tour. THE RULE: canonicalHappenedNotVoidedLoadClause + voided_at IS NULL.
 * --selftest plants each regression.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const F = {
  fence: "apps/backend/src/telematics/geofence-detector.service.ts",
  exceptions: "apps/backend/src/reports/exception-queue.routes.ts",
};
const read = (rel) => readFileSync(resolve(ROOT, rel), "utf8");

export function check(src = {}) {
  const s = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, src[k] ?? read(rel)]));
  const p = [];
  const fn = s.fence.slice(s.fence.indexOf("async function resolveDriverIdForUnit("), s.fence.indexOf("async function fetchContainmentRows("));
  if (!/\$\{canonicalDispatchWorkWhereClause\("l", "\$1::uuid"\)\}/.test(fn))
    p.push(`${F.fence}: resolveDriverIdForUnit must read the unit's current load from the load service's board set`);
  if (/status(::text)?\s+NOT IN\s*\(/i.test(fn)) p.push(`${F.fence}: resolveDriverIdForUnit uses a private NOT IN status list`);
  const tours = s.exceptions.match(/AND l\.presettlement_link_id IS NULL/g) ?? [];
  const gated = s.exceptions.match(/\$\{canonicalHappenedNotVoidedLoadClause\("l"\)\} AND l\.voided_at IS NULL\s*\n\s*AND l\.presettlement_link_id IS NULL/g) ?? [];
  if (tours.length !== gated.length)
    p.push(`${F.exceptions}: ${tours.length - gated.length} "no tour" read(s) without the happened-not-voided gate (voided loads count as needing a tour)`);
  if (/status <> 'cancelled'\s*\n\s*AND l\.presettlement_link_id IS NULL/.test(s.exceptions))
    p.push(`${F.exceptions}: a "no tour" read is back on status <> 'cancelled' only`);
  return p;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain && process.argv.includes("--selftest")) {
  const base = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, read(rel)]));
  if (check(base).length) {
    console.error("SELFTEST FAIL: baseline not clean", check(base));
    process.exit(1);
  }
  const plants = [
    ["fence current load back on a private list", { fence: base.fence.replace('AND ${canonicalDispatchWorkWhereClause("l", "$1::uuid")}', "AND l.status::text NOT IN ('delivered', 'cancelled')") }],
    ["no-tour read back on cancelled only", { exceptions: base.exceptions.replace('${canonicalHappenedNotVoidedLoadClause("l")} AND l.voided_at IS NULL', "l.status <> 'cancelled'") }],
  ];
  for (const [n, src] of plants) {
    const k = Object.keys(src)[0];
    if (src[k] === base[k]) {
      console.error(`SELFTEST FAIL: plant "${n}" did not apply`);
      process.exit(1);
    }
    if (!check(src).length) {
      console.error(`SELFTEST FAIL: plant "${n}" not caught`);
      process.exit(1);
    }
  }
  console.log(`SELFTEST PASS: ${plants.length} plants caught`);
  process.exit(0);
}
if (isMain) {
  const p = check();
  if (p.length) {
    console.error(`verify-no-private-load-status-lists: FAIL —\n  ${p.join("\n  ")}`);
    process.exit(1);
  }
  console.log("verify-no-private-load-status-lists: OK — the fence driver and the no-tour exceptions read the one load vocabulary.");
}
