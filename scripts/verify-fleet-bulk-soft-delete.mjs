#!/usr/bin/env node
// Guard (FLEET-BULK-INACTIVATE): the Fleet bulk "Inactivate" path must be a SOFT delete —
// it hits the canonical per-unit /deactivate endpoints (units + equipment) and must NEVER
// hard-delete (no DELETE method, no /units|/equipment DELETE). Soft-delete only; records retained.
import { readFileSync } from "node:fs";
import process from "node:process";

const FILE = "apps/frontend/src/components/FleetTable.tsx";
let src = "";
try {
  src = readFileSync(FILE, "utf8");
} catch {
  console.error(`verify:fleet-bulk-soft-delete — FAIL: ${FILE} missing`);
  process.exit(1);
}

function audit(text) {
  const checks = [
    ["canonical deactivate mutation", /const inactivateMutation = useMutation\([\s\S]*\/api\/v1\/mdata\/\$\{resource\}\/\$\{row\.id\}\/deactivate[\s\S]*method: "POST"/],
    ["no hard DELETE", (value) => !/method:\s*["']DELETE["']/.test(value)],
    ["truck reactivation", /patchUnit\(row\.id, input\.companyId, \{ deactivated_at: null \}\)/],
    ["trailer reactivation", /patchTrailer\(row\.id, input\.companyId, \{ deactivated_at: null \}\)/],
    ["confirmation invokes mutation", /onConfirm=\{\(\) => \{[\s\S]*?inactivateMutation\.mutate\(\{[\s\S]*?targets: selectedRows\.map/],
  ];
  return checks.filter(([, check]) => typeof check === "function" ? !check(text) : !check.test(text)).map(([label]) => label);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    src.replace("/${row.id}/deactivate", "/${row.id}/archive"),
    src.replace('method: "POST", body: {}', 'method: "DELETE", body: {}'),
    src.replace("patchUnit(row.id, input.companyId, { deactivated_at: null })", "patchUnit(row.id, input.companyId, {})"),
    src.replace("patchTrailer(row.id, input.companyId, { deactivated_at: null })", "patchTrailer(row.id, input.companyId, {})"),
    src.replace("inactivateMutation.mutate({", "void ({"),
  ];
  const escaped = mutations.filter((fixture) => audit(fixture).length === 0);
  if (audit(src).length || escaped.length) {
    console.error(`verify:fleet-bulk-soft-delete — selftest FAIL: ${escaped.length} mutation(s) escaped`);
    process.exit(1);
  }
  console.log("verify:fleet-bulk-soft-delete — selftest PASS (5/5 lifecycle mutations detected)");
  process.exit(0);
}

const failures = audit(src);
if (failures.length) {
  console.error("verify:fleet-bulk-soft-delete — FAIL");
  for (const failure of failures) console.error("  - " + failure);
  process.exit(1);
}
console.log("verify:fleet-bulk-soft-delete — OK (bulk inactivate is soft-delete via /deactivate, no hard delete)");
