#!/usr/bin/env node
/**
 * verify-driver-hos-detail-ambiguous-id.mjs  (TELEMATICS-F1)
 *
 * Root cause: GET /api/v1/telematics/drivers/:driver_id/hos's 24-hour timeline query joins
 * `hos.duty_status_events e` with `mdata.units u`, both of which have an `id` column, but the
 * SELECT list referenced a bare, unqualified `id` — Postgres has no way to know which table's `id`
 * is meant, so the query 500'd on every call with `42702 could not determine data type of parameter`
 * — actually `42702 column reference "id" is ambiguous` — regardless of whether the driver had any
 * events. Live-reproduced 2026-08-23: clicking "Drill-down" on the ELD module's Live Duty Status
 * table (or any other caller of Driver HOS Detail) landed on a page with a correctly-resolved
 * header (driver name via a separate, unaffected query) but a completely empty body — the frontend
 * silently swallowed the 500 with zero error shown, zero console exception, zero visible sign the
 * timeline fetch had failed. Confirmed directly against prod Postgres: the exact buggy SELECT shape
 * throws 42702; qualifying the column as `e.id` returns cleanly (this driver had 0 events in range,
 * an honest empty result, not an error).
 *
 * This guard makes the regression impossible to re-ship: the 24h timeline query's SELECT list must
 * qualify `id` (and its sibling columns) with the `e.` alias, not leave them bare.
 *
 * Usage:
 *   node scripts/verify-driver-hos-detail-ambiguous-id.mjs            # scan
 *   node scripts/verify-driver-hos-detail-ambiguous-id.mjs --selftest # regression harness -> must FAIL on bug
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const ROUTES_FILE = "apps/backend/src/telematics/hos.routes.ts";

const JOIN_MARKER = "LEFT JOIN mdata.units u";
const BARE_ID_BEFORE_JOIN = /SELECT\s+id::text,/;

export function checkNoAmbiguousId(src) {
  const offenders = [];
  const joinIdx = src.indexOf(JOIN_MARKER);
  if (joinIdx === -1) {
    offenders.push(`${ROUTES_FILE}: LEFT JOIN mdata.units marker not found — has the 24h timeline query moved or been rewritten? Re-verify this guard still applies.`);
    return offenders;
  }
  // The SELECT immediately preceding this JOIN is the 24h timeline query; its own `id` column must
  // be qualified as `e.id`, not a bare `id` (ambiguous once joined against mdata.units, which also
  // has an id column).
  const window = src.slice(Math.max(0, joinIdx - 400), joinIdx);
  if (BARE_ID_BEFORE_JOIN.test(window)) {
    offenders.push(
      `${ROUTES_FILE}: the 24h timeline SELECT (joined against mdata.units) references a bare "id::text" — TELEMATICS-F1 regression shape (Postgres 42702 column reference "id" is ambiguous on every call)`
    );
  }
  return offenders;
}

export function run() {
  const abs = path.join(repoRoot, ROUTES_FILE);
  const src = fs.readFileSync(abs, "utf8");
  const offenders = checkNoAmbiguousId(src);
  return { ok: offenders.length === 0, offenders };
}

if (process.argv.includes("--selftest")) {
  const buggy = `
    const events24hRes = await client.query(
      \`
        SELECT
          id::text,
          duty_status,
          started_at::text,
          e.unit_id::text,
          u.unit_number
        FROM hos.duty_status_events e
        LEFT JOIN mdata.units u
          ON u.id = e.unit_id
        WHERE e.operating_company_id = $1::uuid
      \`,
      [x]
    );
  `;
  const fixed = `
    const events24hRes = await client.query(
      \`
        SELECT
          e.id::text,
          e.duty_status,
          e.started_at::text,
          e.unit_id::text,
          u.unit_number
        FROM hos.duty_status_events e
        LEFT JOIN mdata.units u
          ON u.id = e.unit_id
        WHERE e.operating_company_id = $1::uuid
      \`,
      [x]
    );
  `;

  const buggyFails = checkNoAmbiguousId(buggy).length > 0;
  const fixedPasses = checkNoAmbiguousId(fixed).length === 0;

  if (buggyFails && fixedPasses) {
    console.log("verify:driver-hos-detail-ambiguous-id selftest OK");
    process.exit(0);
  }
  console.error("verify:driver-hos-detail-ambiguous-id selftest FAILED", { buggyFails, fixedPasses });
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok, offenders } = run();
  if (!ok) {
    console.error("verify:driver-hos-detail-ambiguous-id FAIL:\n  " + offenders.map((o) => "✗ " + o).join("\n  "));
    process.exit(1);
  }
  console.log("verify:driver-hos-detail-ambiguous-id OK — the 24h timeline query's id column is table-qualified, no ambiguity");
}
