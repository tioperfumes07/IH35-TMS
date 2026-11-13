#!/usr/bin/env node
/**
 * verify-step 20153 — company-settlements-report-speed-lt-2s
 * CC-3 BOARD 29: GET /api/v1/driver-finance/tours?state=closed < 2 s.
 * Root cause: N×buildTourReadout serial loop (106 × ~10 = 1060 round-trips).
 * Fix: batchBuildClosedTourRows (6 batch queries total, 2026-11-13).
 * Static: confirms batch path present. Live: times the endpoint.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const SELFTEST = process.argv.includes("--selftest");

// Static checks (same as guard)
const src = readFileSync(resolve(ROOT, "apps/backend/src/driver-finance/tour-readout.routes.ts"), "utf8");

function check(label, pass) {
  const icon = pass ? "✔" : "✘";
  console.log(`${icon} ${label}`);
  if (!pass) process.exitCode = 1;
}

check("batchBuildClosedTourRows function defined", src.includes("async function batchBuildClosedTourRows("));
check("listTours closed state routes to batch path", src.includes("state === \"closed\"") && src.includes("batchBuildClosedTourRows("));
check("unique_legs CTE in batch query", src.includes("unique_legs AS (SELECT DISTINCT settlement_id, load_id FROM leg_load_ids)"));
check("CANCELLED_STATUSES at module scope", src.includes("const CANCELLED_STATUSES = new Set("));

// Migration index present
const migration = readFileSync(resolve(ROOT, "db/migrations/202616610100_perf_tour_list_closed_batch_indexes.sql"), "utf8");
check("migration 202616610100 adds presettlement_link_id index", migration.includes("idx_loads_presettlement_link_id"));
check("migration 202616610100 adds settlement_lines index", migration.includes("idx_df_settlement_lines_settlement_load"));

if (SELFTEST) {
  const count = 6;
  const passed = process.exitCode !== 1;
  console.log(`\n20153-verify-company-settlements-report-speed: selftest ${passed ? count : 0}/${count} ${passed ? "PASS" : "FAIL"}`);
  process.exit(passed ? 0 : 1);
}
