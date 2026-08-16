#!/usr/bin/env node
/**
 * LV-DRIVER-PWA-NOTIFY-SILENTLY-DROPPED ratchet:
 *  1) migration creates pwa.driver_notifications (FORCE RLS, REVOKE DELETE)
 *  2) shared helper records undelivered outbox when table absent (no bare return)
 *  3) cash-advance / equipment-transfer / legal / load-distribution call the helper
 *
 * --selftest restores a bare `if (!ok) return` and expects FAIL.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIG = "db/migrations/202608161500_pwa_driver_notifications.sql";
const HELPER = "apps/backend/src/pwa/driver-notifications.ts";
const CALL_SITES = [
  "apps/backend/src/driver-finance/cash-advance-requests.service.ts",
  "apps/backend/src/driver-finance/cash-advance-owner-approval.service.ts",
  "apps/backend/src/dispatch/equipment-transfer/notify.ts",
  "apps/backend/src/legal/matters-reminder.cron.ts",
  "apps/backend/src/dispatch/load-distribution.service.ts",
];
const LABEL = "verify-pwa-driver-notifications-table";

function check(root = ROOT) {
  const errors = [];
  const mig = fs.readFileSync(path.join(root, MIG), "utf8");
  if (!/CREATE TABLE IF NOT EXISTS pwa\.driver_notifications/.test(mig)) {
    errors.push(`${MIG}: must create pwa.driver_notifications`);
  }
  if (!/FORCE ROW LEVEL SECURITY/.test(mig)) {
    errors.push(`${MIG}: must FORCE RLS`);
  }
  if (!/REVOKE DELETE ON pwa\.driver_notifications FROM ih35_app/.test(mig)) {
    errors.push(`${MIG}: must REVOKE DELETE from ih35_app`);
  }

  const helper = fs.readFileSync(path.join(root, HELPER), "utf8");
  if (!/E_PWA_DRIVER_NOTIFICATIONS_UNAVAILABLE/.test(helper)) {
    errors.push(`${HELPER}: missing-table path must record E_PWA_DRIVER_NOTIFICATIONS_UNAVAILABLE`);
  }
  if (!/pwa\.driver_notification\.undelivered/.test(helper)) {
    errors.push(`${HELPER}: missing-table path must enqueue pwa.driver_notification.undelivered`);
  }
  if (/if\s*\(!ok\)\s*return\s*;/.test(helper)) {
    errors.push(`${HELPER}: bare if (!ok) return is forbidden`);
  }

  for (const site of CALL_SITES) {
    const src = fs.readFileSync(path.join(root, site), "utf8");
    if (!/insertDriverPwaNotification/.test(src)) {
      errors.push(`${site}: must call insertDriverPwaNotification`);
    }
    // Ban the pre-fix silent latch at call sites (helper owns the probe).
    if (/if\s*\(!reg\.rows\[0\]\?\.ok\)\s*return\s*;/.test(src)) {
      errors.push(`${site}: bare if (!reg.rows[0]?.ok) return is forbidden`);
    }
  }
  return errors;
}

function selftest() {
  const tmp = fs.mkdtempSync(path.join(ROOT, "tmp-pwa-notify-"));
  try {
    fs.mkdirSync(path.join(tmp, "db/migrations"), { recursive: true });
    fs.mkdirSync(path.join(tmp, "apps/backend/src/pwa"), { recursive: true });
    for (const site of CALL_SITES) {
      fs.mkdirSync(path.join(tmp, path.dirname(site)), { recursive: true });
      fs.copyFileSync(path.join(ROOT, site), path.join(tmp, site));
    }
    fs.copyFileSync(path.join(ROOT, MIG), path.join(tmp, MIG));
    let helper = fs.readFileSync(path.join(ROOT, HELPER), "utf8");
    // Replant the silent-drop defect.
    helper = helper.replace(
      /if \(!ok\) \{[\s\S]*?return false;\s*\}/,
      "if (!ok) return;"
    );
    if (!/if \(!ok\) return;/.test(helper)) {
      console.error(`${LABEL} selftest FAIL — could not replant bare return`);
      process.exit(1);
    }
    fs.writeFileSync(path.join(tmp, HELPER), helper);
    const errs = check(tmp);
    if (errs.length === 0) {
      console.error(`${LABEL} selftest FAIL — silent-drop replant did not redden`);
      process.exit(1);
    }
    console.log(`${LABEL} selftest PASS — ${errs.length} error(s) on silent-drop replant`);
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
console.log(`${LABEL} PASS — pwa.driver_notifications migration + no silent drop`);
