#!/usr/bin/env node
/**
 * ROUND 301 follow-up — CONFIRMED F-RETRY scheduled writers must not double-insert on a
 * double tick. Asserts the business-key guards landed for the money / spam paths fixed after
 * the independent 642-engine audit.
 *
 * Static only. --selftest exercises the same asserts against this repo tip.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const CHECKS = [
  {
    name: "drift-alerts ON CONFLICT open unique",
    file: "apps/backend/src/banking/drift-alerts.service.ts",
    mustInclude: [
      "ON CONFLICT (operating_company_id, bank_account_id, drift_kind)",
      "WHERE resolved_at IS NULL AND voided_at IS NULL",
    ],
  },
  {
    name: "depreciation claim + WHERE NOT EXISTS run log",
    file: "apps/backend/src/cron/depreciation-autopost.cron.ts",
    mustInclude: [
      "pg_advisory_xact_lock(hashtext('depr_autopost:'",
      "WHERE NOT EXISTS",
      "depreciation_autopost_claim",
    ],
  },
  {
    name: "compliance notification_log day business key",
    file: "apps/backend/src/compliance/compliance-reminder.job.ts",
    mustInclude: [
      "WHERE NOT EXISTS",
      "notification_log",
      "(n.sent_at AT TIME ZONE 'America/Chicago')::date",
    ],
  },
  {
    name: "ledger findings WHERE NOT EXISTS open scope",
    file: "apps/backend/src/reconciliation/ledger-integrity-detectors.service.ts",
    mustInclude: ["WHERE NOT EXISTS", "status = 'open'", "resource_scope"],
  },
  {
    name: "samsara hos pull claim window",
    file: "apps/backend/src/cron/samsara-hos-pull.cron.ts",
    mustInclude: [
      "pg_advisory_xact_lock(hashtext('samsara_hos_pull:'",
      "interval '45 minutes'",
      "samsara_hos_pull",
    ],
  },
];

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function run() {
  for (const check of CHECKS) {
    const abs = path.join(ROOT, check.file);
    if (!fs.existsSync(abs)) fail(`missing ${check.file}`);
    const src = fs.readFileSync(abs, "utf8");
    for (const needle of check.mustInclude) {
      if (!src.includes(needle)) fail(`${check.name}: missing ${JSON.stringify(needle)} in ${check.file}`);
    }
    console.log(`OK ${check.name}`);
  }
  console.log(`PASS verify-f-retry-scheduled-writers-idempotent (${CHECKS.length} writers)`);
}

if (process.argv.includes("--selftest") || process.argv.includes("--check")) {
  run();
} else {
  run();
}
