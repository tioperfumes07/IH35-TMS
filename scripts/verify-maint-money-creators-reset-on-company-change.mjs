#!/usr/bin/env node
import fs from "node:fs";

const cases = [
  {
    file: "apps/frontend/src/pages/maintenance/components/CreateExpenseModal.tsx",
    form: "RecordExpenseForm",
    key: 'key={`maintenance-expense-${operatingCompanyId}`}',
  },
  {
    file: "apps/frontend/src/pages/maintenance/components/CreateBillModal.tsx",
    form: "VendorBillForm",
    key: 'key={`maintenance-bill-${operatingCompanyId}`}',
  },
];

function failures(overrides = new Map()) {
  const errors = [];
  for (const entry of cases) {
    const source = overrides.get(entry.file) ?? fs.readFileSync(entry.file, "utf8");
    if (!source.includes("[open, linkedWoId, linkedUnitId, operatingCompanyId]")) {
      errors.push(`${entry.file}: wrapper linkage reset must depend on operatingCompanyId`);
    }
    const formTag = source.match(new RegExp(`<${entry.form}\\b[\\s\\S]*?>`))?.[0] ?? "";
    if (!formTag.includes(entry.key)) errors.push(`${entry.file}: ${entry.form} must remount per operating company`);
    if (!formTag.includes("operatingCompanyId={operatingCompanyId}")) errors.push(`${entry.file}: selected company prop missing`);
    if (!formTag.includes("linkedWoId={linkedWoId ?? pickedWoId ?? undefined}") && entry.form === "VendorBillForm") {
      errors.push(`${entry.file}: bill WO FK missing`);
    }
    if (!formTag.includes("workOrderId={linkedWoId ?? pickedWoId ?? undefined}") && entry.form === "RecordExpenseForm") {
      errors.push(`${entry.file}: expense WO FK missing`);
    }
  }
  return errors;
}

if (process.argv.includes("--selftest")) {
  const mutations = cases.flatMap((entry) => {
    const source = fs.readFileSync(entry.file, "utf8");
    return [
      new Map([[entry.file, source.replace(", operatingCompanyId]", "]")]]),
      new Map([[entry.file, source.replace(entry.key, 'data-stale-company="true"')]]),
    ];
  });
  const caught = mutations.filter((overrides) => failures(overrides).length).length;
  if (caught !== mutations.length) {
    console.error(`FAIL: caught ${caught}/${mutations.length} planted Maintenance money-creator company defects`);
    process.exit(1);
  }
  console.log(`PASS: ${caught}/${mutations.length} planted Maintenance money-creator company defects caught`);
}

const errors = failures();
if (errors.length) {
  console.error(errors.map((error) => `FAIL: ${error}`).join("\n"));
  process.exit(1);
}
console.log("PASS: Maintenance Bill and Expense creators reset wrapper and embedded form state per selected company");
