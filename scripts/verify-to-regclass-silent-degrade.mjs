#!/usr/bin/env node
/**
 * CLS-LATCH-TABLE-ABSENT-SILENT-DEGRADE — pin the four silent-degrade instances.
 *
 * Companion to verify-regclass-fallback-intent (2827 baseline ratchet). This guard
 * hard-fails if any of the proven silent sites regresses to a bare
 * `if (!…ok) return` / fail-OPEN `return false` without a declared signal.
 *
 * Instances (CC-3 live 2026-08-07 → FIXED):
 *  - notifications.suppression_rules fail-OPEN → #7706
 *  - pwa.driver_notifications silent drop → #7710
 *  - inventory.parts + maintenance.labor_rates silent skip → #7701
 *
 * --selftest replants a bare return on the PWA helper and expects FAIL.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-to-regclass-silent-degrade";

const PINS = [
  {
    file: "apps/backend/src/notifications/email.service.ts",
    must: [/E_SUPPRESSION_CONTROL_UNAVAILABLE/, /to_regclass\(['"]notifications\.suppression_rules['"]\)/],
    forbid: [/catch\s*\{\s*return false\s*;\s*\}/, /if\s*\(!regclass\.rows\[0\]\?\.regclass\)\s*return false/],
  },
  {
    file: "apps/backend/src/pwa/driver-notifications.ts",
    must: [/E_PWA_DRIVER_NOTIFICATIONS_UNAVAILABLE/, /pwa\.driver_notification\.undelivered/, /to_regclass\(['"]pwa\.driver_notifications['"]\)/],
    forbid: [/if\s*\(!ok\)\s*return\s*;/],
  },
  {
    file: "apps/backend/src/maintenance/wo-cost-context.routes.ts",
    must: [/sources:\s*\{/, /status:\s*partsStatus/, /status:\s*laborStatus/, /"unavailable"/],
    forbid: [],
  },
  {
    file: "apps/backend/src/driver-finance/cash-advance-requests.service.ts",
    must: [/insertDriverPwaNotification/],
    forbid: [/if\s*\(!reg\.rows\[0\]\?\.ok\)\s*return\s*;/],
  },
  {
    file: "apps/backend/src/driver-finance/cash-advance-owner-approval.service.ts",
    must: [/insertDriverPwaNotification/],
    forbid: [/if\s*\(!reg\.rows\[0\]\?\.ok\)\s*return\s*;/],
  },
];

function check(root = ROOT) {
  const errors = [];
  for (const pin of PINS) {
    const full = path.join(root, pin.file);
    if (!fs.existsSync(full)) {
      errors.push(`${pin.file}: missing`);
      continue;
    }
    const src = fs.readFileSync(full, "utf8");
    for (const re of pin.must) {
      if (!re.test(src)) errors.push(`${pin.file}: missing required signal ${re}`);
    }
    for (const re of pin.forbid) {
      if (re.test(src)) errors.push(`${pin.file}: forbidden silent pattern ${re}`);
    }
  }
  // Class ratchet companion must remain present.
  if (!fs.existsSync(path.join(root, "scripts/verify-regclass-fallback-intent.mjs"))) {
    errors.push("scripts/verify-regclass-fallback-intent.mjs: missing class ratchet");
  }
  return errors;
}

function selftest() {
  const tmp = fs.mkdtempSync(path.join(ROOT, "tmp-cls-latch-"));
  try {
    for (const pin of PINS) {
      const dest = path.join(tmp, pin.file);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(path.join(ROOT, pin.file), dest);
    }
    fs.mkdirSync(path.join(tmp, "scripts"), { recursive: true });
    fs.copyFileSync(
      path.join(ROOT, "scripts/verify-regclass-fallback-intent.mjs"),
      path.join(tmp, "scripts/verify-regclass-fallback-intent.mjs")
    );
    const helper = path.join(tmp, "apps/backend/src/pwa/driver-notifications.ts");
    let src = fs.readFileSync(helper, "utf8");
    src = src.replace(/if \(!ok\) \{[\s\S]*?return false;\s*\}/, "if (!ok) return;");
    fs.writeFileSync(helper, src);
    const errs = check(tmp);
    if (errs.length === 0) {
      console.error(`${LABEL} selftest FAIL — bare-return replant did not redden`);
      process.exit(1);
    }
    console.log(`${LABEL} selftest PASS — ${errs.length} error(s) on bare-return replant`);
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
console.log(`${LABEL} PASS — CLS-LATCH silent-degrade pins hold (email/pwa/wo-cost/cash-advance)`);
