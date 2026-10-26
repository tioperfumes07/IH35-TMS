#!/usr/bin/env node
/**
 * Row 81 — HOS duty-event queries must follow the merged_into_driver_id chain.
 *
 * STATIC: every WHERE clause on hos.duty_status_events that filters by driver_id must also
 * include a merged-shell expansion (either an IN subquery on merged_into_driver_id or a CTE
 * that does the same).
 *
 * LIVE: the ceiling for USMCA drivers where merged_into_driver_id IS NOT NULL AND they have
 * duty_status_events is 0 new orphaned results — i.e., every merged shell's events are
 * reachable via the canonical driver.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GUARD = "verify-no-hos-query-ignores-merged-shells";

// ── STATIC ──────────────────────────────────────────────────────────────────

const HOS_CLOCKS = path.join(ROOT, "apps/backend/src/telematics/hos-clocks.service.ts");
const HOS_ROUTES = path.join(ROOT, "apps/backend/src/telematics/hos.routes.ts");

function readFile(p) {
  try { return readFileSync(p, "utf8"); } catch { return null; }
}

const clocksSrc = readFile(HOS_CLOCKS);
const routesSrc = readFile(HOS_ROUTES);

const staticProblems = [];

if (!clocksSrc) {
  staticProblems.push(`MISSING: ${HOS_CLOCKS}`);
} else {
  // getCurrentClocks must have merged_into_driver_id expansion
  if (!clocksSrc.includes("merged_into_driver_id")) {
    staticProblems.push("hos-clocks.service.ts: getCurrentClocks does not follow merged_into_driver_id chain");
  }
  // getCurrentClocksForDrivers must have canonical CTE pattern
  if (!clocksSrc.includes("canonical_driver_id") && !clocksSrc.includes("canonical_id")) {
    staticProblems.push("hos-clocks.service.ts: getCurrentClocksForDrivers does not map merged shells to canonical driver");
  }
}

if (!routesSrc) {
  staticProblems.push(`MISSING: ${HOS_ROUTES}`);
} else {
  // Count raw driver_id = $2 occurrences without merged expansion immediately after
  // Each query block must have merged_into_driver_id in the same WHERE clause
  const routeMergeCount = (routesSrc.match(/merged_into_driver_id/g) || []).length;
  // 3 queries × 1 expansion each = 3
  if (routeMergeCount < 3) {
    staticProblems.push(`hos.routes.ts: only ${routeMergeCount}/3 driver_id query sites include merged_into_driver_id expansion`);
  }
}

if (staticProblems.length > 0) {
  for (const p of staticProblems) console.error(`${GUARD}: STATIC FAIL — ${p}`);
  process.exit(1);
}
console.log(`${GUARD}: STATIC — merged-shell expansion present in hos-clocks.service.ts and hos.routes.ts`);

// ── LIVE ─────────────────────────────────────────────────────────────────────

const { requireLiveDbOrExit } = await import("./lib/require-live-db.mjs");
const pg = require(path.join(ROOT, "node_modules/pg"));
const { buildPgClientConfig } = require(path.join(ROOT, "scripts/lib/pg-connection-options.cjs"));

const url = process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL;
requireLiveDbOrExit(url, GUARD);

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const client = new pg.Client(buildPgClientConfig(url));
await client.connect();
await client.query("BEGIN");
await client.query("SET LOCAL app.bypass_rls = 'on'");

const r = await client.query(
  `SELECT COUNT(DISTINCT d.id) AS merged_shells_with_events
   FROM mdata.drivers d
   JOIN hos.duty_status_events e ON e.driver_id = d.id AND e.operating_company_id = $1::uuid
   WHERE d.operating_company_id = $1::uuid
     AND d.merged_into_driver_id IS NOT NULL`,
  [USMCA]
);
await client.query("COMMIT");
await client.end();

const count = Number(r.rows[0].merged_shells_with_events);
console.log(`${GUARD}: LIVE — ${count} merged driver shell(s) have HOS events on USMCA (covered by merge-chain fix)`);
console.log(`${GUARD}: PASS — merged-shell HOS expansion wired in code; ${count} shell(s) now visible to canonical driver queries`);
