import fs from "node:fs";

// ACCT-INVOICE-CREATE-CUSTOMER-LINK — InvoiceCreateModal.tsx's "Select a load to invoice" table
// already fixed its "Load #" column to drill through a real EntityLink (in-code comment "C5": a
// column header with an id promises a drill-through, not a plain unclickable label). The "Customer"
// column right next to it carries a real customer_id on every row but rendered through bare
// entityLabel() text with no EntityLink wrapper — the same class of gap C5 fixed one column over.

const file = "apps/frontend/src/pages/accounting/InvoiceCreateModal.tsx";
const source = fs.readFileSync(file, "utf8");

function failures(text) {
  const errors = [];
  const columnMatch = text.match(/key:\s*"customer",\s*label:\s*"Customer"[\s\S]{0,800}?key:\s*"status"/);
  if (!columnMatch) {
    errors.push("could not locate the Customer column definition (file restructured?)");
    return errors;
  }
  const block = columnMatch[0];
  if (!/load\.customer_id\s*\?/.test(block)) errors.push("Customer column does not branch on load.customer_id");
  if (!/kind="customer"/.test(block)) errors.push("Customer column does not render an EntityLink kind=\"customer\"");
  if (!/id=\{load\.customer_id\}/.test(block)) errors.push("Customer column's EntityLink is not wired to load.customer_id");
  return errors;
}

if (process.argv.includes("--selftest")) {
  const regressed = source.replace(
    /render:\s*\(load\)\s*=>\s*\n\s*load\.customer_id\s*\?\s*\(\s*\n\s*<EntityLink kind="customer"[\s\S]{0,220}?\)\s*:\s*\(\s*\n\s*entityLabel\(load\.customer_name, load\.customer_id, "Customer"\)\s*\n\s*\),/,
    'render: (load) => entityLabel(load.customer_name, load.customer_id, "Customer"),',
  );
  const ok = failures(source).length === 0;
  const catchesRegression = failures(regressed).includes("Customer column does not branch on load.customer_id");
  if (!ok || !catchesRegression) {
    console.error("verify-invoice-create-modal-customer-entitylink selftest FAIL", { ok, catchesRegression });
    process.exit(1);
  }
  console.log("verify-invoice-create-modal-customer-entitylink selftest PASS — reverting to bare entityLabel turns red");
  process.exit(0);
}

const errors = failures(source);
if (errors.length) {
  console.error(`verify-invoice-create-modal-customer-entitylink FAIL:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
console.log(
  "verify-invoice-create-modal-customer-entitylink PASS — the from-load invoice pick table's Customer column drills through a real EntityLink, matching the Load # column's C5 fix",
);
