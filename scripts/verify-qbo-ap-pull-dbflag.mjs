#!/usr/bin/env node
// verify-qbo-ap-pull-dbflag — the inbound QBO A/P pull (ap-bills-puller.ts) MUST gate on the DB feature
// flag via isEnabled() (single source of truth, resolved per-entity), NEVER on a process.env var. A
// prior hidden env gate (process.env.QBO_AP_MIRROR_PULL_ENABLED) silently kept the daily pull OFF, so
// accounting.bills stayed empty while QBO carried the real A/P. This guard makes that regression fail CI.
//
// Also asserts both flags are registered in a migration so isEnabled() has a catalog row to resolve.
//
// --selftest exercises the failure detection on synthetic inputs (no repo dependency).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.VERIFY_QBO_AP_PULL_DBFLAG_ROOT
  ? path.resolve(process.env.VERIFY_QBO_AP_PULL_DBFLAG_ROOT)
  : path.resolve(__dirname, "..");

const PULLER_REL = "apps/backend/src/qbo-sync/ap-bills-puller.ts";
const MIGRATIONS_DIR = path.join(ROOT, "db", "migrations");
const FLAGS = ["QBO_AP_MIRROR_PULL_ENABLED", "QBO_AP_BILLS_PROJECTION_ENABLED"];

// A process.env read of either flag = the hidden env gate is back = fail.
const ENV_GATE_RE = /process\.env\.(QBO_AP_MIRROR_PULL_ENABLED|QBO_AP_BILLS_PROJECTION_ENABLED)\b/;
const IS_ENABLED_CALL_RE = /\bisEnabled\s*\(/;

function analyzePuller(text) {
  const failures = [];
  if (ENV_GATE_RE.test(text)) {
    failures.push(
      "ap-bills-puller.ts reads process.env.QBO_AP_*_ENABLED — the pull must gate on the DB feature " +
        "flag (isEnabled), not an env var. Remove the env gate."
    );
  }
  if (!IS_ENABLED_CALL_RE.test(text)) {
    failures.push("ap-bills-puller.ts does not call isEnabled() — both stages must gate on the DB flag.");
  }
  for (const flag of FLAGS) {
    if (!text.includes(flag)) {
      failures.push(`ap-bills-puller.ts no longer references ${flag} — the stage gate was lost.`);
    }
  }
  return failures;
}

function migrationsRegisterFlags() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return FLAGS.slice();
  const sql = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"))
    .join("\n");
  const registerRe = /INSERT\s+INTO\s+lib\.feature_flags\b/i;
  const missing = [];
  for (const flag of FLAGS) {
    if (!(registerRe.test(sql) && sql.includes(flag))) missing.push(flag);
  }
  return missing;
}

if (process.argv.includes("--selftest")) {
  const good = `import { isEnabled } from "../lib/feature-flags/service.js";
    const AP_MIRROR_PULL_FLAG = "QBO_AP_MIRROR_PULL_ENABLED";
    const AP_BILLS_PROJECTION_FLAG = "QBO_AP_BILLS_PROJECTION_ENABLED";
    await isEnabled(client, AP_MIRROR_PULL_FLAG, { operating_company_id });`;
  const badEnv = `const AP = process.env.QBO_AP_MIRROR_PULL_ENABLED === "true";
    const AP2 = process.env.QBO_AP_BILLS_PROJECTION_ENABLED === "true";`;
  const badNoFlag = `import { isEnabled } from "x"; await isEnabled(client, "SOMETHING_ELSE", {});`;
  const okFail = analyzePuller(good).length === 0;
  const envFail = analyzePuller(badEnv).length > 0;
  const noFlagFail = analyzePuller(badNoFlag).length > 0;
  if (okFail && envFail && noFlagFail) {
    console.log("verify-qbo-ap-pull-dbflag --selftest: PASS");
    process.exit(0);
  }
  console.error("verify-qbo-ap-pull-dbflag --selftest: FAIL", { okFail, envFail, noFlagFail });
  process.exit(1);
}

const pullerAbs = path.join(ROOT, PULLER_REL);
if (!fs.existsSync(pullerAbs)) {
  console.error(`verify-qbo-ap-pull-dbflag: missing ${PULLER_REL}`);
  process.exit(1);
}

const failures = analyzePuller(fs.readFileSync(pullerAbs, "utf8"));
const missingFlags = migrationsRegisterFlags();
for (const flag of missingFlags) {
  failures.push(`No migration registers ${flag} in lib.feature_flags — isEnabled() would resolve false forever.`);
}

if (failures.length > 0) {
  console.error("verify-qbo-ap-pull-dbflag: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("verify-qbo-ap-pull-dbflag: PASS (DB-flag gate present; both flags registered in a migration)");
process.exit(0);
