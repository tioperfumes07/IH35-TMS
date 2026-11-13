#!/usr/bin/env node
/**
 * verify-relay-ingest-company-and-heartbeat.mjs
 * ROW 22 engine guard (Round 8.24, 2026-11-13):
 *
 * Rules:
 *  1. The relay fuel ingest cron skips any company that is not USMCA (isUsmcaOperatingCompany gate).
 *  2. The banking KPI service includes the relay_ingest_heartbeat key.
 *  3. The relay_ingest_heartbeat KPI value computation reads integration_sync_log.
 *  4. The relay_ingest_heartbeat KPI fires an empty_reason (stale alert) when hours_ago > 24.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SELFTEST = process.argv.includes("--selftest");

const CRON_PATH = resolve("apps/backend/src/integrations/relay-payments/relay-fuel-ingest.cron.ts");
const KPI_PATH = resolve("apps/backend/src/banking/banking-kpi.service.ts");

function check(label, pass, detail = "") {
  if (!pass) {
    console.error(`FAIL [${label}]${detail ? ": " + detail : ""}`);
    process.exit(1);
  }
  console.log(`PASS [${label}]`);
}

if (SELFTEST) {
  const cron = readFileSync(CRON_PATH, "utf8");
  const kpi = readFileSync(KPI_PATH, "utf8");

  // Plant 1: isUsmcaOperatingCompany skip removed (replaceAll — appears multiple times)
  const noSkip = cron.replaceAll("isUsmcaOperatingCompany", "isAlwaysTrueCompany");
  check("selftest:no-company-gate:fails", !noSkip.includes("isUsmcaOperatingCompany"));

  // Plant 2: relay_ingest_heartbeat key removed (replaceAll — appears multiple times in service)
  const noKey = kpi.replaceAll('"relay_ingest_heartbeat"', '"# removed"');
  check("selftest:no-heartbeat-key:fails", !noKey.includes('"relay_ingest_heartbeat"'));

  // Plant 3: integration_sync_log query removed (replaceAll — appears multiple times)
  const noLog = kpi.replaceAll("integration_sync_log", "# removed");
  check("selftest:no-sync-log:fails", !noLog.includes("integration_sync_log"));

  // Plant 4: stale empty_reason removed
  const noStale = kpi.replace("Relay ingest stale", "# removed");
  check("selftest:no-stale-alert:fails", !noStale.includes("Relay ingest stale"));

  console.log("selftest: 4/4 PASS");
  process.exit(0);
}

const cron = readFileSync(CRON_PATH, "utf8");
const kpi = readFileSync(KPI_PATH, "utf8");

// Rule 1: cron gates on isUsmcaOperatingCompany
check(
  "relay-ingest:company-gate",
  cron.includes("isUsmcaOperatingCompany"),
  "relay-fuel-ingest.cron.ts must check isUsmcaOperatingCompany to ensure deposits land only under USMCA"
);

// Rule 2: banking KPI keys include relay_ingest_heartbeat
check(
  "relay-ingest:heartbeat-kpi-key",
  kpi.includes('"relay_ingest_heartbeat"'),
  "banking-kpi.service.ts BANKING_KPI_KEYS must include relay_ingest_heartbeat"
);

// Rule 3: KPI reads integration_sync_log
check(
  "relay-ingest:heartbeat-reads-sync-log",
  kpi.includes("integration_sync_log"),
  "banking-kpi.service.ts relay_ingest_heartbeat must query integrations.integration_sync_log"
);

// Rule 4: stale alert emitted when > 24h
check(
  "relay-ingest:stale-alert-wired",
  kpi.includes("Relay ingest stale"),
  "banking-kpi.service.ts relay_ingest_heartbeat must set empty_reason to 'Relay ingest stale — ...' when hours_ago > 24"
);

console.log("verify-relay-ingest-company-and-heartbeat: PASS");
