#!/usr/bin/env node
/** @matrix-built {"modules":["accounting"],"cols":["picker_law"],"leafRe":"^accounting\\.(modal\\.invoice_create|parity\\.invoice_create|modal\\.record_expense)$","task":"PICKER-LAW-DEEP-CHILD-accounting","vertical":"column-wave"}
 *  @matrix-built {"modules":["dispatch"],"cols":["picker_law"],"leafRe":"^dispatch\\.wizard\\.border_crossing_wizard_page$","task":"PICKER-LAW-DEEP-CHILD-dispatch","vertical":"column-wave"}
 *
 * Closes guard-organization theater for 3 more picker_law leaves whose surface_path files are real
 * top-level entry points but delegate the actual EntityPicker/ReferenceSelect wiring to a child a few
 * hops deep — never opened by the broad verify-cursor-vertical-qbo-picker-modules.mjs module-loop
 * sweep, the leaves' only prior credit. Same class as dispatch.modal.load_create (#13382), except
 * here the required.json surface_path is already correct — no metadata fix needed, just a real check
 * on the real (child) file:
 *   - accounting.modal.invoice_create / accounting.parity.invoice_create: InvoiceCreateModal.tsx ->
 *     InvoiceCreateBlankPage.tsx -> ManualInvoiceModal.tsx -> InvoiceTypeModalBase.tsx, which has a
 *     required (zod .min(1)/.uuid()) customer_id ReferenceSelect(createKind="customer") plus a
 *     bill-to driver/vendor EntityPicker.
 *   - accounting.modal.record_expense: RecordExpenseModal.tsx -> RecordExpenseForm.tsx, which has a
 *     real unit EntityPicker, vendor ReferenceSelect(createKind="vendor"), and DriverPickerWithCreate.
 *   - dispatch.wizard.border_crossing_wizard_page: BorderCrossingWizardPage.tsx -> WizardStep1.tsx,
 *     which has 3 real EntityPickers (load/unit/driver).
 */
import fs from "node:fs";
const LABEL = "verify-picker-law-deep-child-real-accounting-dispatch";
const files = {
  invoiceBase: "apps/frontend/src/pages/accounting/modals/InvoiceTypeModalBase.tsx",
  expenseForm: "apps/frontend/src/components/expenses/RecordExpenseForm.tsx",
  wizardStep1: "apps/frontend/src/components/border-crossing/WizardStep1.tsx",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

function audit(s) {
  const failures = [];
  if (!/customer_id:\s*z\.string\(\)\.min\(1,\s*"Customer is required"\)/.test(s.invoiceBase)) failures.push("invoice customer_id is not required-validated");
  if (!/<ReferenceSelect[\s\S]{0,1050}createKind="customer"/.test(s.invoiceBase)) failures.push("invoice customer ReferenceSelect createKind=customer missing");
  if (!/<EntityPicker[\s\S]{0,200}kind=\{billToEntityType\}/.test(s.invoiceBase)) failures.push("invoice bill-to driver/vendor EntityPicker missing");
  if (!/<EntityPicker[\s\S]{0,60}kind="unit"/.test(s.expenseForm)) failures.push("expense unit EntityPicker missing");
  if (!/<ReferenceSelect[\s\S]{0,850}createKind="vendor"/.test(s.expenseForm)) failures.push("expense vendor ReferenceSelect createKind=vendor missing");
  if (!/<DriverPickerWithCreate[\s>]/.test(s.expenseForm)) failures.push("expense DriverPickerWithCreate missing");
  if (!/<EntityPicker[\s\S]{0,60}kind=\{?"?load/.test(s.wizardStep1) && !/value=\{form\.loadId/.test(s.wizardStep1)) failures.push("wizard load EntityPicker missing");
  if ((s.wizardStep1.match(/<EntityPicker[\s>]/g) || []).length < 3) failures.push("wizard does not have 3 EntityPickers (load/unit/driver)");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["invoice-required", "invoiceBase", /z\.string\(\)\.min\(1,\s*"Customer is required"\)/, 'z.string().optional()'],
    ["invoice-createKind", "invoiceBase", /createKind="customer"/g, 'createKind="vendor"'],
    ["invoice-billto-kind", "invoiceBase", /kind=\{billToEntityType\}/g, 'kind="driver"'],
    ["expense-unit-kind", "expenseForm", /<EntityPicker([\s\S]{0,60})kind="unit"/, '<EntityPicker$1kind="trailer"'],
    ["expense-vendor-createKind", "expenseForm", /createKind="vendor"/g, 'createKind="customer"'],
    ["expense-driver-picker", "expenseForm", /<DriverPickerWithCreate/g, "<DriverPickerWithCreateRemoved"],
    ["wizard-picker-count", "wizardStep1", /<EntityPicker/g, "<EntityPickerX"],
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
console.log(`${LABEL} PASS — invoice_create/record_expense/border_crossing_wizard_page all have real, required picker_law wiring in their real (deeper) child components`);
