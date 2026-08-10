#!/usr/bin/env node
/**
 * SYS-S05 — System module QuickBooks Sync panel must clearly document that
 * QBO write-back is OFF by design (owner-law / architecture: pull-only, no TMS→QBO write-back).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const FILE = "apps/frontend/src/pages/system/SystemModulePage.tsx";

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(ROOT, relativePath));
}

export function run() {
  const failures = [];
  if (!exists(FILE)) {
    failures.push(`MISSING: ${FILE}`);
    return failures;
  }
  const src = read(FILE);

  if (!/getQboSyncHealth\s*\(/.test(src)) {
    failures.push(`${FILE}: must call getQboSyncHealth to load QBO sync status`);
  }

  if (!/QBO write-back/.test(src)) {
    failures.push(`${FILE}: must surface a 'QBO write-back' status row`);
  }

  if (!/OFF \(by design\)/.test(src)) {
    failures.push(`${FILE}: must display QBO write-back as 'OFF (by design)'`);
  }

  if (!/(no write-back|write-back is OFF|pull-only)/i.test(src)) {
    failures.push(`${FILE}: must include explanatory text that the sync is pull-only / no write-back`);
  }

  return failures;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--selftest")) {
    const realPath = path.join(ROOT, FILE);
    const backup = fs.readFileSync(realPath, "utf8");
    try {
      fs.writeFileSync(realPath, backup.replace(/OFF \(by design\)/g, "ON"), "utf8");
      const planted = run();
      if (planted.length === 0) {
        console.error("[verify-sys-s05-qbo-sync-writeback-off] SELFTEST FAIL: planted 'ON' did not fail");
        process.exit(1);
      }
      console.log(`[verify-sys-s05-qbo-sync-writeback-off] SELFTEST PASS (${planted.length} planted failures detected)`);
    } finally {
      fs.writeFileSync(realPath, backup, "utf8");
    }
    process.exit(0);
  }

  const failures = run();
  if (failures.length > 0) {
    console.error("\n[verify-sys-s05-qbo-sync-writeback-off] FAILED:\n");
    for (const f of failures) {
      console.error(`  ✗ ${f}`);
    }
    process.exit(1);
  }
  console.log("[verify-sys-s05-qbo-sync-writeback-off] All checks passed ✓");
  process.exit(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
