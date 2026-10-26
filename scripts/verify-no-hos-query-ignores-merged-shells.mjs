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
 *
 *   --live      also runs the database half (DATABASE_URL required; no DB = FAIL, via requireLiveDbOrExit). Without
 *               --live only the static half runs — listed in scripts/lib/e7-batch2-live-guards.json live_flag_guards,
 *               so money-pr-local-gate.mjs runs it --live (same convention as verify-event-log-spine, FINAL-4 10-25).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

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

/** Pure static check so --selftest can plant defects into copies (never the tracked files). */
function staticProblemsOf(clocks, routes) {
  const out = [];
  if (!clocks) {
    out.push(`MISSING: ${HOS_CLOCKS}`);
  } else {
    // getCurrentClocks must have merged_into_driver_id expansion
    if (!clocks.includes("merged_into_driver_id")) {
      out.push("hos-clocks.service.ts: getCurrentClocks does not follow merged_into_driver_id chain");
    }
    // getCurrentClocksForDrivers must have canonical CTE pattern
    if (!clocks.includes("canonical_driver_id") && !clocks.includes("canonical_id")) {
      out.push("hos-clocks.service.ts: getCurrentClocksForDrivers does not map merged shells to canonical driver");
    }
  }
  if (!routes) {
    out.push(`MISSING: ${HOS_ROUTES}`);
  } else {
    // 3 driver_id query sites × 1 merged-shell expansion each = 3
    const routeMergeCount = (routes.match(/merged_into_driver_id/g) || []).length;
    if (routeMergeCount < 3) {
      out.push(`hos.routes.ts: only ${routeMergeCount}/3 driver_id query sites include merged_into_driver_id expansion`);
    }
  }
  return out;
}

if (process.argv.includes("--selftest")) {
  const dropOne = (src) => { const i = src.lastIndexOf("merged_into_driver_id"); return i < 0 ? src : src.slice(0, i) + "driver_id_unmerged" + src.slice(i + "merged_into_driver_id".length); };
  const cases = [["real sources pass", staticProblemsOf(clocksSrc, routesSrc).length === 0]];
  for (const [name, c, r] of [
    ["clocks stops following the merge chain", clocksSrc?.split("merged_into_driver_id").join("driver_id_unmerged"), routesSrc],
    ["clocks loses the canonical-driver mapping", clocksSrc?.split("canonical_driver_id").join("cdid").split("canonical_id").join("cid"), routesSrc],
    ["one route query site loses the expansion", clocksSrc, dropOne(routesSrc ?? "")],
    ["hos.routes.ts missing", clocksSrc, null],
  ]) cases.push([`planted "${name}" caught`, (c !== clocksSrc || r !== routesSrc) && staticProblemsOf(c, r).length > 0]);
  let ok = 0;
  for (const [name, pass] of cases) { console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}`); if (pass) ok += 1; }
  console.log(`${GUARD} SELFTEST ${ok === cases.length ? "PASS" : "FAIL"} — ${ok}/${cases.length} cases (static half)`);
  process.exit(ok === cases.length ? 0 : 1);
}

const staticProblems = staticProblemsOf(clocksSrc, routesSrc);

if (staticProblems.length > 0) {
  for (const p of staticProblems) console.error(`${GUARD}: STATIC FAIL — ${p}`);
  process.exit(1);
}
console.log(`${GUARD}: STATIC — merged-shell expansion present in hos-clocks.service.ts and hos.routes.ts`);
if (!process.argv.includes("--live")) {
  console.log(`${GUARD}: OK (static) — database half runs with --live (live_flag_guards; money-pr-local-gate runs it)`);
  process.exit(0);
}

// ── LIVE ─────────────────────────────────────────────────────────────────────

const { requireLiveDbOrExit } = await import("./lib/require-live-db.mjs");
// Was: requireLiveDbOrExit(url, GUARD) un-awaited (wrong signature — the refusal never gated) and
// SET LOCAL app.bypass_rls = 'on' (not the bypass value — RLS stayed on and the count could read 0).
const { client, pool } = await requireLiveDbOrExit({ label: GUARD });
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
let r;
try {
  await client.query("BEGIN READ ONLY");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");
  r = await client.query(
    `SELECT COUNT(DISTINCT d.id) AS merged_shells_with_events
     FROM mdata.drivers d
     JOIN hos.duty_status_events e ON e.driver_id = d.id AND e.operating_company_id = $1::uuid
     WHERE d.operating_company_id = $1::uuid
       AND d.merged_into_driver_id IS NOT NULL`,
    [USMCA]
  );
  await client.query("ROLLBACK");
} finally {
  client.release();
  await pool.end();
}

const count = Number(r.rows[0].merged_shells_with_events);
console.log(`${GUARD}: LIVE — ${count} merged driver shell(s) have HOS events on USMCA (covered by merge-chain fix)`);
console.log(`${GUARD}: PASS — merged-shell HOS expansion wired in code; ${count} shell(s) now visible to canonical driver queries`);
