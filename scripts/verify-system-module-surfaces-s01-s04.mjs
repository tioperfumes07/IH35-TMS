#!/usr/bin/env node
/**
 * SYS-S01 / SYS-S02 / SYS-S03 / SYS-S04 — System module surface ratchet.
 *
 * Asserts that SystemModulePage:
 *  - mounts the canonical tab set (S01 / DOD-A)
 *  - renders live QBO reconciliation + sync status honestly (S01 / DOD-B)
 *  - shows software/build health from live /healthz probes, including DEGRADED (S02 / VERIFY-6)
 *  - mirrors program tracker counts and links to /program (S03 / DOD-C)
 *  - lists deep health checks with name/tier/status in the Health & Deploys drill-in (S04 / VERIFY-1)
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

  // S01 — canonical tab set + live QBO recon/sync
  const requiredTabs = ["overview", "qbo-recon", "qbo-sync", "program", "software", "claude-coder"];
  for (const id of requiredTabs) {
    if (!src.includes(`"${id}"`)) failures.push(`${FILE}: missing tab '${id}' in SYSTEM_TABS`);
  }
  if (!/getQboReconciliation\s*\(/.test(src)) {
    failures.push(`${FILE}: must call getQboReconciliation for QBO reconciliation status`);
  }
  if (!/getQboSyncHealth\s*\(/.test(src)) {
    failures.push(`${FILE}: must call getQboSyncHealth for QBO sync status`);
  }
  if (!/open_findings_count|Unresolved reconciliation alerts/.test(src)) {
    failures.push(`${FILE}: must surface unresolved reconciliation alerts honestly`);
  }

  // S02 — live health probes, not static green
  if (!/fetchHealth|healthz/.test(src)) {
    failures.push(`${FILE}: must fetch live healthz for Software/Build status`);
  }
  if (!/DEGRADED/.test(src)) {
    failures.push(`${FILE}: must be able to show DEGRADED when health checks fail`);
  }

  // S03 — program tracker mirror counts + link to /program
  if (!/(getProgramTracker\s*\(|queryFn:\s*getProgramTracker)/.test(src)) {
    failures.push(`${FILE}: must call getProgramTracker to mirror program board counts`);
  }
  if (!/registered_total/.test(src) || !/view_counts/.test(src)) {
    failures.push(`${FILE}: must render program tracker registered_total and view_counts`);
  }
  if (!/to="\/program(\/[a-z-]+)?"/.test(src)) {
    failures.push(`${FILE}: must link from system Program Tracker card to /program board`);
  }

  // S04 — Health & Deploys drill-in lists checks with reason/name/tier/status
  if (!/Service checks|Health & Deploys/.test(src)) {
    failures.push(`${FILE}: must render a Health & Deploys / Service checks drill-in`);
  }
  if (!/h\.checks\.map|c\.name/.test(src)) {
    failures.push(`${FILE}: must map over live health checks and show each check name`);
  }
  if (!/c\.tier/.test(src)) {
    failures.push(`${FILE}: must show each health check tier`);
  }
  if (!/c\.ok\s*\?\s*<Pill tone="ok">OK<\/Pill>\s*:\s*<Pill tone="off">DOWN<\/Pill>/.test(src)) {
    failures.push(`${FILE}: must show per-check OK/DOWN status`);
  }

  return failures;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--selftest")) {
    const realPath = path.join(ROOT, FILE);
    const backup = fs.readFileSync(realPath, "utf8");
    try {
      fs.writeFileSync(realPath, backup.replace(/getProgramTracker/g, "fetchTracker"), "utf8");
      const planted = run();
      if (planted.length === 0) {
        console.error("[verify-system-module-surfaces-s01-s04] SELFTEST FAIL: planted rename did not fail");
        process.exit(1);
      }
      console.log(`[verify-system-module-surfaces-s01-s04] SELFTEST PASS (${planted.length} planted failures detected)`);
    } finally {
      fs.writeFileSync(realPath, backup, "utf8");
    }
    process.exit(0);
  }

  const failures = run();
  if (failures.length > 0) {
    console.error("\n[verify-system-module-surfaces-s01-s04] FAILED:\n");
    for (const f of failures) {
      console.error(`  ✗ ${f}`);
    }
    process.exit(1);
  }
  console.log("[verify-system-module-surfaces-s01-s04] All checks passed ✓");
  process.exit(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
