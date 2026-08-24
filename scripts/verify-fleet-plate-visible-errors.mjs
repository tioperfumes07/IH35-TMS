#!/usr/bin/env node
/** FLT-F6323 — Plate create/archive failures must never be silent. */
import fs from "node:fs";

const FILE = "apps/frontend/src/components/vehicle-profile/PlatesTable.tsx";
const source = fs.readFileSync(FILE, "utf8");

function audit(text) {
  const failures = [];
  const need = (condition, message) => { if (!condition) failures.push(message); };
  need(/jurisdiction\.trim\(\)\.length > 0 && plateNumber\.trim\(\)\.length > 0/.test(text), "create must validate both required strings");
  need(/disabled=\{!createValid\}/.test(text), "Save plate must be disabled for invalid input");
  need((text.match(/createMutation\.reset\(\)/g) ?? []).length >= 2, "editing either required field must clear stale create state");
  need(/createMutation\.isError/.test(text) && /Couldn&apos;t save plate/.test(text), "create failure must be visible");
  need(/archiveMutation\.isError/.test(text) && /Couldn&apos;t archive plate/.test(text), "archive failure must be visible");
  need((text.match(/role="alert"/g) ?? []).length >= 2, "both mutation errors must be announced");
  return failures;
}

const failures = audit(source);
if (failures.length) {
  console.error(`verify-fleet-plate-visible-errors FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("jurisdiction.trim().length > 0 && plateNumber.trim().length > 0", "true"),
    source.replace("disabled={!createValid}", "disabled={false}"),
    source.replaceAll("createMutation.reset();", ""),
    source.replace("createMutation.isError", "false"),
    source.replace("archiveMutation.isError", "false"),
    source.replaceAll('role="alert"', 'role="status"'),
  ];
  for (const [index, mutation] of mutations.entries()) {
    if (mutation === source || audit(mutation).length === 0) throw new Error(`mutation ${index + 1} escaped`);
  }
  console.log(`verify-fleet-plate-visible-errors SELFTEST PASS — ${mutations.length} mutations detected`);
}

console.log("verify-fleet-plate-visible-errors PASS — plate create/archive failures are visible");
