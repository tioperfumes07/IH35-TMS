#!/usr/bin/env node
// ROW-39 (owner 2026-09-05 15:04Z) — "Samsara holds 732 deactivated drivers; the TMS mirror
// integrations.samsara_drivers holds 78 rows, all active, last synced 2026-05-31 ... collector must
// pull driverActivationStatus=deactivated too ... 0 rows with driverActivationStatus NULL."
//
// Two checks, both required:
//   1. SOURCE — samsara-client.ts must carry a real second-pass fetch for "deactivated" (not just
//      "active"), and the driver-mirror collector must exist and be wired into the existing
//      5 */12 * * * cron.
//   2. LIVE (--live, not part of static CI — no reachable Postgres/Samsara there): after the
//      collector has run at least once, the mirrored driver count is >= 78 + 732 and 0 rows have
//      raw_payload->>'driverActivationStatus' IS NULL.
//
// Run: node scripts/verify-samsara-driver-mirror-both-statuses.mjs [--live] [--selftest]
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-samsara-driver-mirror-both-statuses";
const MIN_TOTAL = 78 + 732;

function loadSource(rel) {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

export function collectSourceFailures(files = {
  client: loadSource("apps/backend/src/integrations/samsara/samsara-client.ts"),
  collector: loadSource("apps/backend/src/integrations/samsara/driver-mirror-collector.ts"),
  cron: loadSource("apps/backend/src/cron/samsara-remote-count-collector.cron.ts"),
}) {
  const failures = [];
  if (!/driverActivationStatus:\s*activationStatus/.test(files.client) || !/"deactivated"/.test(files.client)) {
    failures.push("samsara-client.ts: no real pass for driverActivationStatus=deactivated found");
  }
  if (!/INSERT INTO integrations\.samsara_drivers/.test(files.collector)) {
    failures.push("driver-mirror-collector.ts: no upsert into integrations.samsara_drivers found");
  }
  if (!/local_driver_id/.test(files.collector) || !/cdl_number|mexican_license_number/.test(files.collector)) {
    failures.push("driver-mirror-collector.ts: no license-number-based local_driver_id linking found");
  }
  if (!/collectSamsaraDriverMirror/.test(files.cron)) {
    failures.push("samsara-remote-count-collector.cron.ts: driver-mirror collector not wired into the 5 */12 * * * tick");
  }
  return failures;
}

async function liveCheck() {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const client = await pool.connect();
  try {
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    const totalRes = await client.query(`SELECT count(*)::int AS total FROM integrations.samsara_drivers`);
    const nullRes = await client.query(
      `SELECT count(*)::int AS missing FROM integrations.samsara_drivers WHERE raw_payload->>'driverActivationStatus' IS NULL`
    );
    return { total: totalRes.rows[0].total, missing: nullRes.rows[0].missing };
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const live = args.includes("--live");
  const selftest = args.includes("--selftest");

  if (selftest) {
    const good = {
      client: 'driverActivationStatus: activationStatus }); "deactivated"',
      collector: "INSERT INTO integrations.samsara_drivers local_driver_id cdl_number mexican_license_number",
      cron: "collectSamsaraDriverMirror(operatingCompanyId",
    };
    if (collectSourceFailures(good).length) {
      console.error(`${LABEL} SELFTEST FAIL — good sources rejected`);
      process.exit(1);
    }
    const missingDeactivated = { ...good, client: 'driverActivationStatus: "active" });' };
    const missingLinking = { ...good, collector: "INSERT INTO integrations.samsara_drivers" };
    const missingWiring = { ...good, cron: "" };
    for (const [name, plant] of [
      ["missing deactivated pass", missingDeactivated],
      ["missing license linking", missingLinking],
      ["missing cron wiring", missingWiring],
    ]) {
      if (collectSourceFailures(plant).length === 0) {
        console.error(`${LABEL} SELFTEST FAIL — ${name} was not caught`);
        process.exit(1);
      }
    }
    console.log(`${LABEL} SELFTEST OK — 3/3 plants rejected`);
  }

  const sourceFailures = collectSourceFailures();
  if (sourceFailures.length) {
    console.error(`${LABEL}: FAIL (source)`);
    for (const f of sourceFailures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: source OK — both-status fetch, license-linked upsert, and cron wiring all present`);

  if (live) {
    const { total, missing } = await liveCheck();
    if (total < MIN_TOTAL) {
      console.error(`${LABEL}: FAIL (live) — mirrored driver count ${total} < required ${MIN_TOTAL}`);
      process.exit(1);
    }
    if (missing > 0) {
      console.error(`${LABEL}: FAIL (live) — ${missing} row(s) with driverActivationStatus NULL`);
      process.exit(1);
    }
    console.log(`${LABEL}: live OK — ${total} mirrored drivers (>= ${MIN_TOTAL}), 0 with driverActivationStatus NULL`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
