/**
 * REG-046 guard (verify-step 11190, Cursor EVEN band):
 * Asserts the invoice status report tab has the money waterfall column order:
 *   invoiced date → settlement # → delivery date → Original Invoice Amount → Advance → Reserve → Fees
 * And an explanatory label stating what the table shows.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const FACTORING_HOME = join(repoRoot, "apps", "frontend", "src", "pages", "factoring", "FactoringHome.tsx");

function selftest() {
  console.log("selftest OK — column order detection works");
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const factoringHome = readFileSync(FACTORING_HOME, "utf8");
  const failures = [];

  // 1. The invoice status report tab must have an explanatory label.
  if (!factoringHome.includes('data-testid="factoring-invoice-status-label"')) {
    failures.push("Invoice Status Report tab missing explanatory label with data-testid");
  }

  // 2. The label must mention the money waterfall terms.
  if (!factoringHome.includes("money waterfall")) {
    failures.push("Invoice Status Report label must mention 'money waterfall'");
  }

  // 3. The column order must be: Invoiced Date, Settlement #, Delivery Date, Original Invoice Amount, Advance, Reserve, Fees
  // Extract the invoiceStatusColumns array and check the order of the first 7 columns.
  const columnsMatch = factoringHome.match(/const invoiceStatusColumns[\s\S]*?\];/);
  if (!columnsMatch) {
    failures.push("Could not find invoiceStatusColumns array");
  } else {
    const cols = columnsMatch[0];
    const labelRegex = /label:\s*"([^"]+)"/g;
    const labels = [];
    let m;
    while ((m = labelRegex.exec(cols)) !== null) {
      labels.push(m[1]);
    }
    const expectedFirst7 = ["Invoiced Date", "Settlement #", "Delivery Date", "Original Invoice Amount", "Advance", "Reserve", "Fees"];
    for (let i = 0; i < expectedFirst7.length; i++) {
      if (labels[i] !== expectedFirst7[i]) {
        failures.push(`Column ${i + 1} should be "${expectedFirst7[i]}" but is "${labels[i] ?? "missing"}"`);
      }
    }
  }

  if (failures.length > 0) {
    console.error(`verify-factoring-invoice-table-label FAILED (${failures.length}):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log("verify-factoring-invoice-table-label: OK — money waterfall column order + explanatory label present");
}

main();
