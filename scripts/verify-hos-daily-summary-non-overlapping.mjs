#!/usr/bin/env node
/**
 * verify-hos-daily-summary-non-overlapping.mjs (HOS-F6312)
 *
 * Root cause: the "Last 8 days summary" panel on `/drivers/:id/hos`
 * (apps/frontend/src/pages/drivers/DriverHosDetailPage.tsx) was fed by a raw SQL SUM over
 * `hos.duty_status_events`, grouped by the calendar day an event STARTED, summing each row's raw
 * duration independently. ELD/Samsara ingest legitimately writes many overlapping/duplicate rows
 * for one real duty period into this append-only table (a polling-snapshot pattern) —
 * live-confirmed for a real driver on 2026-08-20: ~15 "driving" events all sharing one ended_at
 * with staggered started_at values, summing to 141h+ for a single calendar day. The exact same
 * overlap-safety problem was already found and fixed ONCE for the HOS clocks panel
 * (hos-clocks.service.ts's flattenDutySegments(), whose own comment cites a real prior incident:
 * "CAZARES 06-14 summed to 35h in a 24h day -> the 8-day cycle clamped to 0 -> a FALSE
 * violation") — but that fix was never applied to the sibling daily-summary query.
 *
 * Fix: `computeDailyDutySummary()` in hos-clocks.service.ts reuses flattenDutySegments() (the
 * SAME non-overlapping reconstruction the clocks panel already requires), then splits each flat
 * segment across the calendar-day boundaries it spans. hos.routes.ts now fetches raw events and
 * calls this function instead of running a raw SQL SUM.
 *
 * Usage:
 *   node scripts/verify-hos-daily-summary-non-overlapping.mjs            # scan
 *   node scripts/verify-hos-daily-summary-non-overlapping.mjs --selftest # regression harness
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const CLOCKS_FILE = "apps/backend/src/telematics/hos-clocks.service.ts";
const ROUTES_FILE = "apps/backend/src/telematics/hos.routes.ts";

function checkClocksFile(src) {
  const offenders = [];
  if (!/export function computeDailyDutySummary\(/.test(src)) {
    offenders.push(`${CLOCKS_FILE}: computeDailyDutySummary() is missing — HOS-F6312 regression.`);
    return offenders;
  }
  if (!/flattenDutySegments\(events, asOf\)/.test(src.slice(src.indexOf("computeDailyDutySummary")))) {
    offenders.push(`${CLOCKS_FILE}: computeDailyDutySummary() no longer reuses flattenDutySegments() — the daily summary can double/N-count overlapping ELD ingest rows again.`);
  }
  return offenders;
}

function checkRoutesFile(src) {
  const offenders = [];
  if (!/computeDailyDutySummary/.test(src)) {
    offenders.push(`${ROUTES_FILE}: does not import/call computeDailyDutySummary — the daily summary regression risk is back.`);
  }
  const rawSumRe = /SUM\(\s*\n?\s*EXTRACT\(\s*\n?\s*EPOCH FROM/;
  if (rawSumRe.test(src)) {
    offenders.push(`${ROUTES_FILE}: still contains a raw SQL SUM(EXTRACT(EPOCH FROM ...)) duration aggregate for the daily summary — the non-overlapping flattening was removed.`);
  }
  return offenders;
}

export function checkHosDailySummary(clocksSrc, routesSrc) {
  return [...checkClocksFile(clocksSrc), ...checkRoutesFile(routesSrc)];
}

export function run() {
  const clocksSrc = fs.readFileSync(path.join(repoRoot, CLOCKS_FILE), "utf8");
  const routesSrc = fs.readFileSync(path.join(repoRoot, ROUTES_FILE), "utf8");
  const offenders = checkHosDailySummary(clocksSrc, routesSrc);
  return { ok: offenders.length === 0, offenders };
}

if (process.argv.includes("--selftest")) {
  const buggyClocks = `
    export function flattenDutySegments(events, asOf) { return []; }
    export function computeHosClocks(events, asOf) { return {}; }
  `;
  const buggyRoutes = `
    const summary8dRes = await client.query(
      \`
        SELECT
          to_char(date_trunc('day', started_at), 'YYYY-MM-DD') AS service_day,
          duty_status,
          FLOOR(
            SUM(
              EXTRACT(
                EPOCH FROM
                (
                  LEAST(COALESCE(ended_at, now()), now())
                  - GREATEST(started_at, now() - interval '8 days')
                )
              ) / 60.0
            )
          )::int AS total_minutes
        FROM hos.duty_status_events
        WHERE operating_company_id = $1::uuid
        GROUP BY 1, 2
      \`,
      [operatingCompanyId]
    );
  `;
  const fixedClocks = fs.readFileSync(path.join(repoRoot, CLOCKS_FILE), "utf8");
  const fixedRoutes = fs.readFileSync(path.join(repoRoot, ROUTES_FILE), "utf8");

  const buggyOffenders = checkHosDailySummary(buggyClocks, buggyRoutes);
  const fixedOffenders = checkHosDailySummary(fixedClocks, fixedRoutes);

  if (buggyOffenders.length >= 2 && fixedOffenders.length === 0) {
    console.log("verify-hos-daily-summary-non-overlapping selftest OK");
    process.exit(0);
  }
  console.error("verify-hos-daily-summary-non-overlapping selftest FAILED", { buggyOffenders, fixedOffenders });
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok, offenders } = run();
  if (!ok) {
    console.error(
      "verify-hos-daily-summary-non-overlapping FAIL:\n  " + offenders.map((o) => "✗ " + o).join("\n  "),
    );
    process.exit(1);
  }
  console.log(
    "verify-hos-daily-summary-non-overlapping OK — the 8-day HOS duty-status summary is computed via flattenDutySegments()'s non-overlapping reconstruction, not a raw SQL SUM over the append-only event table",
  );
}
