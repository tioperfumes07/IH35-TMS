#!/usr/bin/env node
/**
 * verify-reports-profit-per-truck-type-display.mjs
 * LV-REPORTS-PROFIT-PER-TRUCK-RAW-UNKNOWN-TYPE
 *
 * Backend may keep truck_type sentinel "unknown" for API/sort/export.
 * FE Type column must never paint raw "unknown" — use governed "Type — not set".
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-reports-profit-per-truck-type-display";
const PAGE = "apps/frontend/src/pages/reports/ProfitPerTruckPage.tsx";
const API = "apps/backend/src/reports/profit-per-truck.routes.ts";

function read(rel) {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

function analyze() {
  const failures = [];
  const page = read(PAGE);
  const api = read(API);

  if (!/COALESCE\(agg\.truck_type::text,\s*'unknown'\)/.test(api)) {
    failures.push(`${API}: must keep SQL COALESCE truck_type → 'unknown' sentinel (API semantics)`);
  }
  if (!/truck_type:\s*String\(row\.truck_type \?\? "unknown"\)/.test(api)) {
    failures.push(`${API}: must keep JS fallback truck_type ?? "unknown"`);
  }

  if (!/function displayTruckType/.test(page)) {
    failures.push(`${PAGE}: must define displayTruckType helper`);
  }
  if (!/Type — not set/.test(page)) {
    failures.push(`${PAGE}: must use governed unavailable copy "Type — not set"`);
  }
  if (!/key:\s*["']truck_type["'][\s\S]{0,280}?render:\s*\(r\)\s*=>\s*displayTruckType\(r\.truck_type\)/.test(page)) {
    failures.push(`${PAGE}: Type column must render via displayTruckType(r.truck_type)`);
  }
  if (!/key:\s*["']truck_type["'][\s\S]{0,280}?sortValue:\s*\(r\)\s*=>\s*r\.truck_type/.test(page)) {
    failures.push(`${PAGE}: Type column must keep sortValue on raw truck_type`);
  }
  if (/key:\s*["']truck_type["']\s*,\s*label:\s*["']Type["']\s*,\s*sortable:\s*true\s*\}/.test(page)) {
    failures.push(`${PAGE}: truck_type must not be a bare ParityTable column`);
  }
  return failures;
}

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

function selftest() {
  const pagePath = path.join(process.cwd(), PAGE);
  const original = fs.readFileSync(pagePath, "utf8");
  try {
    const planted = original.replace(
      /key:\s*["']truck_type["'][\s\S]*?render:\s*\(r\)\s*=>\s*displayTruckType\(r\.truck_type\)\s*\},/,
      '{ key: "truck_type", label: "Type", sortable: true },',
    );
    fs.writeFileSync(pagePath, planted);
    const bad = analyze();
    if (!bad.some((m) => /displayTruckType|bare ParityTable/.test(m))) {
      fail(`selftest expected bare Type column to fail: ${bad.join("; ") || "none"}`);
    }
  } finally {
    fs.writeFileSync(pagePath, original);
  }
  const good = analyze();
  if (good.length) fail(`selftest expected GOOD after restore: ${good.join("; ")}`);
  console.log(`${LABEL} selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const failures = analyze();
  if (failures.length) {
    for (const f of failures) console.error(`${LABEL} FAIL: ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS — profit-per-truck Type uses "Type — not set" (API keeps unknown sentinel)`);
}

main();
