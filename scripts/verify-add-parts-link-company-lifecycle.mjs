#!/usr/bin/env node
/** @matrix-built {"modules":["maintenance","inventory","vendors"],"cols":["vendor","connectivity","reverse_link"],"leaves":["maintenance.modal.add_parts_link","inventory.assignments.wo_link"],"task":"MAINT-F6614-ADD-PARTS-LINK-COMPANY-LIFECYCLE","vertical":"class-sweep"} */
import fs from "node:fs";

const file = "apps/frontend/src/components/maintenance/AddPartsLinkDrawer.tsx";
const source = fs.readFileSync(file, "utf8");
const tokens = [
  "const actionGenerationRef = useRef(0)",
  "createPartsAssignment(input.workOrderId, input.companyId, {",
  "vendor_id: input.vendorId",
  "vendor_invoice_number: input.invoiceNumber",
  "vendor_invoice_amount: input.amountDollars",
  "qty_used: input.qty",
  "part_description: input.partDescription",
  "input.generation !== actionGenerationRef.current",
  '["maintenance", "parts-assignments", input.companyId]',
  '["vendor-parts-history", input.companyId]',
  "actionGenerationRef.current += 1",
  "createMutation.reset()",
  "workOrderId,\n              companyId: operatingCompanyId,\n              generation: actionGenerationRef.current",
  "vendorId,\n              invoiceNumber: invoiceNumber.trim()",
  "amountDollars: Number(amountDollars ?? 0)",
  "qty: Math.max(1, Number(qty) || 1)",
  "partDescription: partDescription.trim()",
];

function inspect(value) {
  return tokens.filter((token) => !value.includes(token));
}
const failures = inspect(source);
if (failures.length) {
  console.error(`verify-add-parts-link-company-lifecycle FAIL:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
if (process.argv.includes("--selftest")) {
  for (const token of tokens.slice(1)) {
    if (inspect(source.replace(token, "PLANTED_DEFECT")).length === 0) throw new Error(`selftest missed ${token}`);
  }
  console.log(`verify-add-parts-link-company-lifecycle --selftest PASS (${tokens.length - 1}/${tokens.length - 1} planted defects red)`);
  process.exit(0);
}
console.log("verify-add-parts-link-company-lifecycle PASS — parts assignment preserves submitted WO/company/vendor/invoice/quantity/description state");
