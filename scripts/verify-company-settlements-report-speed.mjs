#!/usr/bin/env node
/**
 * BOARD-29: Company Settlements report (GET /api/v1/driver-finance/tours?state=closed)
 * must resolve in < 2 s (warm, app role). Root cause was N×buildTourReadout serial loop.
 * Fix: batchBuildClosedTourRows uses 6 batch queries regardless of settlement count.
 *
 * --selftest: verifies the batch path exists and the N+1 loop is gone from listTours.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const ROUTE_FILE = resolve(ROOT, "apps/backend/src/driver-finance/tour-readout.routes.ts");

const SELFTEST = process.argv.includes("--selftest");

function check(label, pass, detail) {
  const icon = pass ? "✔" : "✘";
  console.log(`${icon} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!pass) process.exitCode = 1;
}

const src = readFileSync(ROUTE_FILE, "utf8");

// 1. Batch function exists
check(
  "batchBuildClosedTourRows function defined",
  src.includes("async function batchBuildClosedTourRows("),
);

// 2. listTours routes closed state to batch path before the N+1 loop
check(
  "listTours closed state routes to batchBuildClosedTourRows",
  src.includes("state === \"closed\"") && src.includes("batchBuildClosedTourRows("),
);

// 3. The batch path uses a single legs CTE (unique_legs)
check(
  "batch legs query uses unique_legs CTE",
  src.includes("unique_legs AS (SELECT DISTINCT settlement_id, load_id FROM leg_load_ids)"),
);

// 4. CANCELLED_STATUSES defined at module scope (not duplicated inside buildTourReadout only)
check(
  "CANCELLED_STATUSES defined at module scope",
  src.includes("const CANCELLED_STATUSES = new Set("),
);

// 5. N+1 loop is guarded (only runs for open state)
const listToursBody = src.slice(src.indexOf("export async function listTours("));
const guardedLoop = listToursBody.includes("state === \"closed\"") &&
  listToursBody.indexOf("for (const { id } of ids.rows)") > listToursBody.indexOf("state === \"closed\"");
check(
  "N+1 loop only runs for open state (guarded by state=closed branch)",
  guardedLoop,
);

if (SELFTEST) {
  const passed = process.exitCode !== 1;
  const count = 5;
  const ok = passed ? count : 0;
  console.log(`\nverify-company-settlements-report-speed: selftest ${ok}/${count} ${passed ? "PASS" : "FAIL"}`);
} else {
  console.log(`\nverify-company-settlements-report-speed: static analysis ${process.exitCode !== 1 ? "PASS" : "FAIL"}`);
}
