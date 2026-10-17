#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

// LEAD 443.181 — the Fleet roster renders on ParityTable; its bulk bar is ParityTable's batch-actions bar
// (selected count + Clear selection), carrying the fleet controls (FleetBulkControls + Inactivate / Reactivate)
// behind the same write-role permission gate the shared BulkActionBar applied (useBulkPermission).
const repoRoot = process.cwd();
const targetFile = path.join(repoRoot, "apps/frontend/src/components/FleetTable.tsx");
const source = fs.readFileSync(targetFile, "utf8");

export function audit(src) {
  const failures = [];
  if (!src.includes('from "./fleet/BulkActionBar"') && !src.includes("from './fleet/BulkActionBar'")) {
    failures.push("Missing fleet BulkActionBar (FleetBulkControls) import in FleetTable.tsx");
  }
  if (!/batchActions=\{\(\) =>[\s\S]{0,400}<FleetBulkControls/.test(src)) {
    failures.push("Fleet bulk controls not mounted in the ParityTable batchActions bar");
  }
  if (!/bulkPermission\.canUseBulkOps \?/.test(src) || !/useBulkPermission\(\)/.test(src)) {
    failures.push("Fleet bulk bar lost its write-role permission gate (useBulkPermission)");
  }
  if (!/Inactivate selected/.test(src) || !/Reactivate selected/.test(src)) {
    failures.push("Fleet bulk bar lost Inactivate / Reactivate selected");
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace(/from "\.\/fleet\/BulkActionBar"/, 'from "./fleet/Gone"'),
    source.replace("<FleetBulkControls", "<GoneControls"),
    source.replace("bulkPermission.canUseBulkOps ?", "true ?"),
    source.replace("Inactivate selected", "Gone"),
  ];
  const escaped = mutations.filter((m) => m === source || audit(m).length === 0);
  if (audit(source).length || escaped.length) {
    console.error(`[verify-bulk-action-bar-mounted] selftest FAIL — ${escaped.length} mutation(s) escaped`);
    process.exit(1);
  }
  console.log(`[verify-bulk-action-bar-mounted] selftest PASS (${mutations.length}/${mutations.length})`);
  process.exit(0);
}

const failures = audit(source);
if (failures.length) {
  for (const f of failures) console.error(`[verify-bulk-action-bar-mounted] ${f}`);
  process.exit(1);
}
console.log("[verify-bulk-action-bar-mounted] OK");
