#!/usr/bin/env node
/**
 * LV-EMAIL-SUPPRESSION-FAILS-OPEN ratchet:
 *  1) migration creates notifications.suppression_rules (FORCE RLS, no DELETE grant)
 *  2) isSuppressed throws E_SUPPRESSION_CONTROL_UNAVAILABLE when to_regclass is null
 *  3) no catch { return false } fail-OPEN around the suppression check
 *
 * --selftest restores the fail-OPEN shape and expects FAIL.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIG = "db/migrations/202608161400_notifications_suppression_rules.sql";
const SVC = "apps/backend/src/notifications/email.service.ts";
const LABEL = "verify-email-suppression-fail-closed";

function check(root = ROOT) {
  const errors = [];
  const mig = fs.readFileSync(path.join(root, MIG), "utf8");
  if (!/CREATE TABLE IF NOT EXISTS notifications\.suppression_rules/.test(mig)) {
    errors.push(`${MIG}: must create notifications.suppression_rules`);
  }
  if (!/FORCE ROW LEVEL SECURITY/.test(mig)) {
    errors.push(`${MIG}: must FORCE RLS`);
  }
  if (!/REVOKE DELETE ON notifications\.suppression_rules FROM ih35_app/.test(mig)) {
    errors.push(`${MIG}: must REVOKE DELETE from ih35_app`);
  }
  if (!/chk_suppression_rules_max_7d/.test(mig)) {
    errors.push(`${MIG}: must enforce ≤7-day WF-064.3 window`);
  }

  const svc = fs.readFileSync(path.join(root, SVC), "utf8");
  if (/catch\s*\{\s*return false\s*;\s*\}/.test(svc)) {
    errors.push(`${SVC}: catch { return false } fail-OPEN is forbidden on suppression path`);
  }
  if (!/E_SUPPRESSION_CONTROL_UNAVAILABLE/.test(svc)) {
    errors.push(`${SVC}: missing table must throw E_SUPPRESSION_CONTROL_UNAVAILABLE`);
  }
  if (/if\s*\(!regclass\.rows\[0\]\?\.regclass\)\s*return false/.test(svc)) {
    errors.push(`${SVC}: missing to_regclass must not return false (fail-OPEN)`);
  }
  return errors;
}

function selftest() {
  const tmp = fs.mkdtempSync(path.join(ROOT, "tmp-email-supp-"));
  try {
    const migDir = path.join(tmp, "db/migrations");
    const svcDir = path.join(tmp, "apps/backend/src/notifications");
    fs.mkdirSync(migDir, { recursive: true });
    fs.mkdirSync(svcDir, { recursive: true });
    fs.copyFileSync(path.join(ROOT, MIG), path.join(tmp, MIG));
    let svc = fs.readFileSync(path.join(ROOT, SVC), "utf8");
    // Replant the fail-OPEN defect.
    svc = svc.replace(
      /if \(!regclass\.rows\[0\]\?\.regclass\) \{[\s\S]*?throw new Error\([\s\S]*?\);\s*\}/,
      "if (!regclass.rows[0]?.regclass) return false;"
    );
    if (!svc.includes("return false;")) {
      svc = svc.replace(
        "return await withLuciaBypass(async (client) => {",
        "try {\n  return await withLuciaBypass(async (client) => {"
      );
      svc += "\n} catch { return false; }\n";
    }
    fs.writeFileSync(path.join(tmp, SVC), svc);
    const errs = check(tmp);
    if (errs.length === 0) {
      console.error(`${LABEL} selftest FAIL — fail-OPEN replant did not redden`);
      process.exit(1);
    }
    console.log(`${LABEL} selftest PASS — ${errs.length} error(s) on fail-OPEN replant`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = check();
if (errors.length) {
  console.error(`${LABEL} FAIL:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — suppression table migration + fail-closed isSuppressed`);
