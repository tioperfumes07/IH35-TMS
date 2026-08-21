#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["picker_law"],"leafRe":"^dispatch\\.modal\\.load_create$","task":"DISPATCH-LOAD-CREATE-PICKER-LAW","vertical":"column-wave"} */
import fs from "node:fs";
const LABEL = "verify-dispatch-load-create-picker-law";
const files = {
  form: "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx",
  equipment: "apps/frontend/src/pages/dispatch/components/BookLoadEquipmentSection.tsx",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

function audit(s) {
  const failures = [];
  if (!/<ReferenceSelect[\s\S]{0,700}createKind="customer"/.test(s.form)) failures.push("customer_id ReferenceSelect createKind=customer missing");
  if (!/customer_id.*required:\s*"Select a customer/.test(s.form)) failures.push("customer_id is not required-validated");
  if (!/<EntityPicker[\s\S]{0,200}kind="vendor"[\s\S]{0,200}allowCreate/.test(s.form)) failures.push("factoring company vendor EntityPicker allowCreate missing");
  if (!/<LoadTemplatePicker[\s>]/.test(s.form)) failures.push("LoadTemplatePicker missing");
  if (!/<BookLoadEquipmentSection[\s>]/.test(s.form)) failures.push("BookLoadEquipmentSection not rendered from the load-create form");
  if (!/<EntityPicker[\s\S]{0,60}kind="unit"/.test(s.equipment)) failures.push("unit EntityPicker missing from equipment section");
  if (!/<DriverPickerWithCreate[\s>]/.test(s.equipment)) failures.push("DriverPickerWithCreate missing from equipment section");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["customer-createKind", "form", /createKind="customer"/g, 'createKind="vendor"'],
    ["customer-required", "form", /required:\s*"Select a customer from the list"/g, "false"],
    ["factoring-kind", "form", /<EntityPicker([\s\S]{0,200})kind="vendor"/, "<EntityPicker$1kind=\"driver\""],
    ["factoring-allowCreate", "form", /(kind="vendor"[\s\S]{0,200})allowCreate/, "$1"],
    ["template-picker", "form", /<LoadTemplatePicker/g, "<LoadTemplatePickerRemoved"],
    ["equipment-section", "form", /<BookLoadEquipmentSection/g, "<BookLoadEquipmentSectionRemoved"],
    ["unit-picker", "equipment", /kind="unit"/g, 'kind="trailer"'],
    ["driver-picker", "equipment", /<DriverPickerWithCreate/g, "<DriverPickerWithCreateRemoved"],
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
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — dispatch.modal.load_create's real form (BookLoadModalV4.tsx + BookLoadEquipmentSection.tsx) has real customer/vendor/unit/driver picker_law, closing the guard-organization-theater gap left by the broad module-loop sweep`);
