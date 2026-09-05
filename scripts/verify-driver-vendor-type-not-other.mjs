#!/usr/bin/env node
// SEED/DRIVERS-ARE-VENDORS (measured live, USMCA) — a driver's A/P payee (mdata.vendors row with
// driver_id set) was minted vendor_type='Other', invisible to any vendor_type='Driver' filter
// (settlement pay posting, vendor Purchases YTD, statements). Source check only — the create path
// must mint 'Driver', never 'Other'. The historical backfill (existing mis-typed rows, missing
// vendor rows) is tracked/applied separately (docs/bus/OUTBOX-CC-3.md), not gated by this guard.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-vendor-type-not-other";
const FILE = "apps/backend/src/mdata/ensure-driver-vendor.shared.ts";

function loadSource(rel) {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

export function collectSourceFailures(source = loadSource(FILE)) {
  const failures = [];
  const insertMatch = source.match(/INSERT INTO mdata\.vendors[\s\S]*?VALUES \(([^)]*)\)/);
  if (!insertMatch) {
    failures.push("could not find the driver-vendor INSERT statement to check");
    return failures;
  }
  if (!/'Driver'/.test(insertMatch[1])) {
    failures.push(`driver-vendor INSERT does not mint vendor_type='Driver' (found: ${insertMatch[1].trim()})`);
  }
  if (/'Other'/.test(insertMatch[1])) {
    failures.push("driver-vendor INSERT still mints vendor_type='Other'");
  }
  return failures;
}

function selftest() {
  const good = loadSource(FILE);
  if (collectSourceFailures(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — good source rejected`);
    process.exit(1);
  }
  const regressed = good.replace("VALUES ($1, $2, 'Driver',", "VALUES ($1, $2, 'Other',");
  if (collectSourceFailures(regressed).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — reverting to 'Other' was not caught`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST OK — 1/1 plant rejected`);
}

if (process.argv.includes("--selftest")) selftest();

const failures = collectSourceFailures();
if (failures.length) {
  console.error(`${LABEL}: FAIL`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — driver-vendor create path mints vendor_type='Driver'`);
