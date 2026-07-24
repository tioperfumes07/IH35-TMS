#!/usr/bin/env node
// verify-qbo-ap-bill-payments-projection — the inbound QBO A/P PAYMENT clone
// (ap-bill-payments-puller.ts) must:
//   (1) gate BOTH stages on the DB feature flag via isEnabled() (single source of truth, resolved
//       per-entity), NEVER on a process.env var (the hidden-env-gate regression that kept the A/P pull
//       permanently OFF);
//   (2) reference both flags QBO_AP_BILL_PAYMENT_MIRROR_PULL_ENABLED / QBO_AP_BILL_PAYMENTS_PROJECTION_ENABLED;
//   (3) NEVER call a GL poster (subledger-only; GL stays QuickBooks' job);
//   (4) project on the FAN-OUT-safe composite conflict target (operating_company_id, qbo_bill_payment_id, bill_id).
// A migration must register both flags AND replace the 2-col partial unique with the composite one, or
// the projection's ON CONFLICT target does not exist / fan-out collapses N allocations into one.
// The scheduler must wire the payment stages AFTER ap_bills_project.
//
// --selftest exercises the failure detection on synthetic inputs (no repo dependency).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.VERIFY_QBO_AP_BILLPAY_ROOT
  ? path.resolve(process.env.VERIFY_QBO_AP_BILLPAY_ROOT)
  : path.resolve(__dirname, "..");

const PULLER_REL = "apps/backend/src/qbo-sync/ap-bill-payments-puller.ts";
const SCHEDULER_REL = "apps/backend/src/qbo-sync/sync-scheduler.ts";
const MIGRATIONS_DIR = path.join(ROOT, "db", "migrations");
const FLAGS = ["QBO_AP_BILL_PAYMENT_MIRROR_PULL_ENABLED", "QBO_AP_BILL_PAYMENTS_PROJECTION_ENABLED"];
const COMPOSITE_INDEX = "uq_bill_payments_company_qbo_bp_bill";
const OLD_INDEX = "uq_bill_payments_company_qbo_bp_id";

const ENV_GATE_RE = /process\.env\.(QBO_AP_BILL_PAYMENT_MIRROR_PULL_ENABLED|QBO_AP_BILL_PAYMENTS_PROJECTION_ENABLED)\b/;
const IS_ENABLED_CALL_RE = /\bisEnabled\s*\(/;
// A poster import/call would mean GL posting crept into the subledger clone.
const POSTER_RE = /\b(postToLedger|postJournalEntry|createJournalEntry|glPoster|ledgerPoster|postGl)\b/i;

export function analyzePuller(text) {
  const failures = [];
  if (ENV_GATE_RE.test(text)) {
    failures.push(
      "ap-bill-payments-puller.ts reads process.env.QBO_AP_BILL_PAYMENT*_ENABLED — must gate on the DB " +
        "feature flag (isEnabled), not an env var."
    );
  }
  if (!IS_ENABLED_CALL_RE.test(text)) {
    failures.push("ap-bill-payments-puller.ts does not call isEnabled() — both stages must gate on the DB flag.");
  }
  for (const flag of FLAGS) {
    if (!text.includes(flag)) {
      failures.push(`ap-bill-payments-puller.ts no longer references ${flag} — the stage gate was lost.`);
    }
  }
  if (POSTER_RE.test(text)) {
    failures.push("ap-bill-payments-puller.ts references a GL poster — the payment clone must be subledger-only (NO GL).");
  }
  if (!text.includes("source_system") || !/'qbo'/.test(text)) {
    failures.push("ap-bill-payments-puller.ts must project rows as source_system='qbo'.");
  }
  if (!text.includes(`(operating_company_id, qbo_bill_payment_id, bill_id)`)) {
    failures.push(
      "ap-bill-payments-puller.ts projection does not use the composite ON CONFLICT target " +
        "(operating_company_id, qbo_bill_payment_id, bill_id) — fan-out would collapse allocations."
    );
  }
  return failures;
}

function analyzeScheduler(text) {
  const failures = [];
  const payIdx = text.indexOf("ap_bill_payments_project");
  const billIdx = text.indexOf("ap_bills_project");
  if (payIdx < 0) {
    failures.push("sync-scheduler.ts does not wire the ap_bill_payments_project step.");
  } else if (billIdx < 0 || payIdx < billIdx) {
    failures.push("sync-scheduler.ts must wire ap_bill_payments stages AFTER ap_bills_project.");
  }
  if (!text.includes("ap_bill_payments_pull")) {
    failures.push("sync-scheduler.ts does not wire the ap_bill_payments_pull step.");
  }
  return failures;
}

function readAllMigrationsSql() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return "";
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"))
    .join("\n");
}

export function analyzeMigrations(sql) {
  const failures = [];
  const registerRe = /INSERT\s+INTO\s+lib\.feature_flags\b/i;
  for (const flag of FLAGS) {
    if (!(registerRe.test(sql) && sql.includes(flag))) {
      failures.push(`No migration registers ${flag} in lib.feature_flags — isEnabled() would resolve false forever.`);
    }
  }
  if (!sql.includes(COMPOSITE_INDEX)) {
    failures.push(`No migration creates the composite unique index ${COMPOSITE_INDEX} — the projection ON CONFLICT target is missing.`);
  }
  if (!new RegExp(`DROP\\s+INDEX\\s+IF\\s+EXISTS\\s+accounting\\.${OLD_INDEX}`, "i").test(sql)) {
    failures.push(`No migration drops the old 2-col unique ${OLD_INDEX} — the fan-out replacement is incomplete.`);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const goodPuller = `import { isEnabled } from "../lib/feature-flags/service.js";
    const A = "QBO_AP_BILL_PAYMENT_MIRROR_PULL_ENABLED";
    const B = "QBO_AP_BILL_PAYMENTS_PROJECTION_ENABLED";
    await isEnabled(client, A, { operating_company_id });
    'qbo' source_system ON CONFLICT (operating_company_id, qbo_bill_payment_id, bill_id)`;
  const badEnv = `const A = process.env.QBO_AP_BILL_PAYMENT_MIRROR_PULL_ENABLED === "true";`;
  const badPoster = goodPuller + "\n postJournalEntry(client, je);";
  const goodMig = `INSERT INTO lib.feature_flags QBO_AP_BILL_PAYMENT_MIRROR_PULL_ENABLED QBO_AP_BILL_PAYMENTS_PROJECTION_ENABLED
    CREATE UNIQUE INDEX IF NOT EXISTS uq_bill_payments_company_qbo_bp_bill
    DROP INDEX IF EXISTS accounting.uq_bill_payments_company_qbo_bp_id`;
  const badMig = `INSERT INTO lib.feature_flags QBO_AP_BILL_PAYMENT_MIRROR_PULL_ENABLED`;
  const goodSched = `ap_bills_project ... ap_bill_payments_pull ... ap_bill_payments_project`;
  const badSched = `ap_bill_payments_project ... ap_bills_project`;
  const ok =
    analyzePuller(goodPuller).length === 0 &&
    analyzePuller(badEnv).length > 0 &&
    analyzePuller(badPoster).length > 0 &&
    analyzeMigrations(goodMig).length === 0 &&
    analyzeMigrations(badMig).length > 0 &&
    analyzeScheduler(goodSched).length === 0 &&
    analyzeScheduler(badSched).length > 0;
  if (ok) {
    console.log("verify-qbo-ap-bill-payments-projection --selftest: PASS");
    process.exit(0);
  }
  console.error("verify-qbo-ap-bill-payments-projection --selftest: FAIL");
  process.exit(1);
}

const pullerAbs = path.join(ROOT, PULLER_REL);
const schedulerAbs = path.join(ROOT, SCHEDULER_REL);
if (!fs.existsSync(pullerAbs)) {
  console.error(`verify-qbo-ap-bill-payments-projection: missing ${PULLER_REL}`);
  process.exit(1);
}
if (!fs.existsSync(schedulerAbs)) {
  console.error(`verify-qbo-ap-bill-payments-projection: missing ${SCHEDULER_REL}`);
  process.exit(1);
}

const failures = [
  ...analyzePuller(fs.readFileSync(pullerAbs, "utf8")),
  ...analyzeScheduler(fs.readFileSync(schedulerAbs, "utf8")),
  ...analyzeMigrations(readAllMigrationsSql()),
];

if (failures.length > 0) {
  console.error("verify-qbo-ap-bill-payments-projection: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  "verify-qbo-ap-bill-payments-projection: PASS (DB-flag gate; both flags registered; composite fan-out index replaces the 2-col unique; subledger-only; scheduler wired after ap_bills_project)"
);
process.exit(0);
