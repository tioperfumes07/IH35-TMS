#!/usr/bin/env node
/** @matrix-built {"modules":["system"],"cols":["connectivity","qbo_chrome"],"leaves":["admin.launch_toggles"],"task":"SYSTEM-F6623-LAUNCH-TOGGLE-ACTION-SNAPSHOT","vertical":"column-wave"} */
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/admin/LaunchToggles.tsx";
const source = fs.readFileSync(FILE, "utf8");

function inspect(value) {
  const failures = [];
  const checks = [
    [/pendingAction, setPendingAction/, "missing immutable toggle action snapshot"],
    [/postToggleAction\(input\.carrierId, input\.action, input\.notes\)/, "toggle writer reads mutable action or notes"],
    [/setPendingAction\(\{[\s\S]*carrierId: row\.operating_company_id,[\s\S]*companyCode: row\.company_code,[\s\S]*action: "launch",[\s\S]*notes: notes\.trim\(\)/, "launch action snapshot is incomplete"],
    [/setPendingAction\(\{[\s\S]*carrierId: row\.operating_company_id,[\s\S]*companyCode: row\.company_code,[\s\S]*action: "rollback",[\s\S]*notes: notes\.trim\(\)/, "rollback action snapshot is incomplete"],
    [/<ConfirmModal[\s\S]*const input = pendingAction;[\s\S]*setPendingAction\(null\);[\s\S]*setPendingId\(input\.carrierId\);[\s\S]*actionMutation\.mutate\(input\)/, "toggle actions lack canonical confirmation cleanup"],
  ];
  for (const [pattern, message] of checks) if (!pattern.test(value)) failures.push(message);
  if (/window\.confirm\(/.test(value)) failures.push("native confirmation still blocks launch toggle actions");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    "pendingAction, setPendingAction",
    "postToggleAction(input.carrierId, input.action, input.notes)",
    'action: "launch",',
    'action: "rollback",',
    "<ConfirmModal",
  ];
  for (const token of mutations) {
    if (!source.includes(token)) throw new Error(`fixture missing ${token}`);
    if (inspect(source.replace(token, "REMOVED_BY_SELFTEST")).length === 0) throw new Error(`missed ${token}`);
  }
  console.log(`verify-launch-toggle-action-snapshot selftest PASS — ${mutations.length}/${mutations.length} planted defects red`);
  process.exit(0);
}

const failures = inspect(source);
if (failures.length) {
  console.error(`verify-launch-toggle-action-snapshot FAIL — ${failures.join("; ")}`);
  process.exit(1);
}
console.log("verify-launch-toggle-action-snapshot PASS — launch/rollback submit immutable carrier/action/notes snapshots");
