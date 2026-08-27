#!/usr/bin/env node
import fs from "node:fs";
import process from "node:process";
const FILE = "apps/frontend/src/pages/insurance/PolicyDetail.tsx";
function inspect(source) {
  const failures = [];
  const checks = [
    ["edit blocked during actions", /const openEditPanel = \(\) => \{\s*if \(updateMutation\.isPending \|\| archiveMutation\.isPending\) return;/],
    ["archive blocked during update", /if \(!policyId \|\| archiveMutation\.isPending \|\| updateMutation\.isPending\) return;/],
    ["cancel guarded", /const closeEditPanel = \(\) => \{\s*if \(updateMutation\.isPending\) return;\s*setEditing\(false\);\s*updateMutation\.reset\(\);/],
    ["cancel bound", /onClick=\{closeEditPanel\} disabled=\{updateMutation\.isPending\}/],
  ];
  for (const [label, pattern] of checks) if (!pattern.test(source)) failures.push(label);
  const locks = source.match(/disabled=\{updateMutation\.isPending\}/g)?.length ?? 0;
  if (locks < 5) failures.push("status/date/archive/cancel controls locked");
  return failures;
}
const source = fs.readFileSync(FILE, "utf8");
if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("if (updateMutation.isPending || archiveMutation.isPending) return;", "// planted"),
    source.replace(" || updateMutation.isPending) return;", ") return;"),
    source.replace("if (updateMutation.isPending) return;\n    setEditing(false);", "setEditing(false);"),
    source.replace("onClick={closeEditPanel}", "onClick={() => setEditing(false)}"),
    source.replace("disabled={updateMutation.isPending}", "disabled={false}"),
  ];
  const survived = mutations.filter((candidate) => inspect(candidate).length === 0);
  if (survived.length) { console.error(`FAIL verify-insurance-policy-update-pending-lock --selftest: ${survived.length}/${mutations.length} survived`); process.exit(1); }
  console.log(`PASS verify-insurance-policy-update-pending-lock --selftest (${mutations.length} mutations killed)`); process.exit(0);
}
const failures = inspect(source);
if (failures.length) { console.error(`FAIL verify-insurance-policy-update-pending-lock: ${failures.join("; ")}`); process.exit(1); }
console.log("PASS verify-insurance-policy-update-pending-lock");
