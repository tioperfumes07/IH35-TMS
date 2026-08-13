#!/usr/bin/env node
/** @matrix-built {"modules":["customers"],"cols":["reverse_link"],"leafRe":"^md\\.tasks$","task":"ENTITY-TASKS-REVERSE-LEAVES","vertical":"column-wave"} */
/** @matrix-built {"modules":["vendors"],"cols":["reverse_link"],"leafRe":"^detail\\.profile$","task":"ENTITY-TASKS-REVERSE-LEAVES","vertical":"column-wave"} */
/** @matrix-built {"modules":["fleet"],"cols":["reverse_link"],"leafRe":"^unit\\.detail\\.tasks$","task":"ENTITY-TASKS-REVERSE-LEAVES","vertical":"column-wave"} */
import fs from "node:fs";

const LABEL = "verify-entity-tasks-reverse-leaves";
const source = {
  tab: fs.readFileSync("apps/frontend/src/components/tasks/TasksTab.tsx", "utf8"),
  customer: fs.readFileSync("apps/frontend/src/pages/Customers.tsx", "utf8"),
  vendor: fs.readFileSync("apps/frontend/src/pages/VendorDetail.tsx", "utf8"),
  unit: fs.readFileSync("apps/frontend/src/pages/units/UnitDetail.tsx", "utf8"),
};

function audit(s) {
  const failures = [];
  if (!/fetchTasksByTarget\(\{ operating_company_id: operatingCompanyId, target_type: targetType, target_id: targetId \}\)/.test(s.tab)) failures.push("scoped target query missing");
  if (!/presetLink=\{\{ target_type: targetType, target_id: targetId, label: targetLabel \}\}/.test(s.tab) || !/onCreated=\{\(\) => void tasksQuery\.refetch\(\)\}/.test(s.tab)) failures.push("create R=W target/refetch missing");
  if (!/tasksQuery\.isError/.test(s.tab) || !/Could not load linked tasks\./.test(s.tab) || !/No tasks linked to this record yet\./.test(s.tab)) failures.push("honest task states missing");
  if (!/<TasksTab[\s\S]{0,180}targetType="customer"[\s\S]{0,100}targetId=\{selectedCustomer\.id\}/.test(s.customer)) failures.push("customer task reverse mount missing");
  if (!/<TasksTab[\s\S]{0,180}targetType="vendor"[\s\S]{0,100}targetId=\{vendor\.id\}/.test(s.vendor)) failures.push("vendor task reverse mount missing");
  if (!/<TasksTab[\s\S]{0,180}targetType="unit"[\s\S]{0,100}targetId=\{id\}/.test(s.unit)) failures.push("unit task reverse mount missing");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["scope", "tab", /operating_company_id: operatingCompanyId/g, "operating_company_id: ''"],
    ["target", "tab", /target_id: targetId/g, "target_id: ''"],
    ["refetch", "tab", /tasksQuery\.refetch\(\)/g, "undefined"],
    ["error", "tab", /Could not load linked tasks\./g, "Loading"],
    ["customer", "customer", /targetType="customer"/g, 'targetType="vendor"'],
    ["vendor", "vendor", /targetType="vendor"/g, 'targetType="customer"'],
    ["unit", "unit", /targetType="unit"/g, 'targetType="customer"'],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const candidate = { ...source, [key]: source[key].replace(pattern, replacement) };
    if (candidate[key] === source[key] || audit(candidate).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`);
  process.exit(0);
}

const failures = audit(source);
if (failures.length) { console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log(`${LABEL} PASS — customer/vendor/unit task reverse mounts are scoped, R=W, and honest`);
