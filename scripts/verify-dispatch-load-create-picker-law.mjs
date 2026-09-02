#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["picker_law"],"leafRe":"^dispatch\\.modal\\.load_create$","task":"DISPATCH-LOAD-CREATE-PICKER-LAW","vertical":"column-wave"} */
import fs from "node:fs";
const LABEL = "verify-dispatch-load-create-picker-law";
const files = {
  form: "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx",
  equipment: "apps/frontend/src/pages/dispatch/components/BookLoadEquipmentSection.tsx",
  stops: "apps/frontend/src/pages/dispatch/components/BookLoadStopsSection.tsx",
  combobox: "apps/frontend/src/components/Combobox.tsx",
  comboboxTest: "apps/frontend/src/components/Combobox.test.tsx",
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
  if (!/import \{ DatePicker \}/.test(s.stops) || !/<DatePicker[^>]*data-testid=\{`stop-date-\$\{index\}`\}/.test(s.stops)) {
    failures.push("Book Load stop dates must use the shared DatePicker");
  }
  if (/<input\b[^>]*\btype\s*=\s*["']date["']/.test(s.stops)) failures.push("Book Load stop dates regressed to a native date input");
  if (!/addEventListener\("mousedown",\s*onDocumentClick\)/.test(s.combobox) || !/containerRef\.current\?\.contains\(target\)/.test(s.combobox)) {
    failures.push("Book Load picker engine must dismiss on outside click");
  }
  if (!/event\.key === "Escape"[\s\S]{0,160}closeListbox\(\)/.test(s.combobox)) failures.push("Book Load picker engine must dismiss on Escape");
  for (const title of ["Escape closes without committing the highlighted option", "outside click closes without committing the highlighted option"]) {
    const testCase = s.comboboxTest.match(new RegExp(`it\\("${title}"[\\s\\S]*?\\n\\s*}\\);`))?.[0] ?? "";
    if (!/not\.toHaveBeenCalled/.test(testCase)) failures.push(`Book Load picker engine test missing no-forced-pick proof: ${title}`);
  }
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
    ["stop-shared-date", "stops", /<DatePicker/g, '<input type="date"'],
    ["stop-native-date", "stops", /<DatePicker data-testid=\{`stop-date-\$\{index\}`\}/, '<input type="date" data-testid={`stop-date-${index}`}'],
    ["picker-outside-dismiss", "combobox", /document\.addEventListener\("mousedown", onDocumentClick\)/, "void onDocumentClick"],
    ["picker-escape-dismiss", "combobox", /event\.key === "Escape"/, 'event.key === "Never"'],
    ["picker-no-forced-selection", "comboboxTest", /expect\(onChange\)\.not\.toHaveBeenCalled\(\)/, "expect(onChange).toHaveBeenCalled()"],
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
console.log(`${LABEL} PASS — dispatch.modal.load_create has canonical pickers, shared stop dates, and dismiss-without-forced-selection behavior`);
