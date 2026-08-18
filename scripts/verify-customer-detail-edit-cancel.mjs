import fs from "node:fs";

const source = fs.readFileSync("apps/frontend/src/pages/CustomerDetail.tsx", "utf8");
const failures = [];

if (!source.includes('setForm({});\n                  setEditMode(false);')) {
  failures.push("Cancel must discard the staged form before leaving edit mode");
}
if (!/variant="secondary"[\s\S]{0,220}>\s*Cancel\s*<\/Button>/.test(source)) {
  failures.push("Edit actions must expose a secondary Cancel button");
}
if (!/disabled=\{updateCustomerMutation\.isPending\}/.test(source)) {
  failures.push("Cancel must be disabled while Save is pending");
}

if (failures.length) {
  console.error(`verify-customer-detail-edit-cancel FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log("verify-customer-detail-edit-cancel PASS — customer inline edit can discard staged values without saving");
