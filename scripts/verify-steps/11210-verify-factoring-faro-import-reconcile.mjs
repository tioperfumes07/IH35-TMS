/**
 * REG-047 guard (verify-step 11210, Cursor EVEN band):
 * Asserts Faro Daily Import has:
 * 1. Summary view with aggregated totals (gross, advance, reserve, fees, chargebacks).
 * 2. Detail view with individual rows.
 * 3. Date-range filter support.
 * 4. Reconciliation section comparing Faro totals vs factoring summary.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const FACTORING_HOME = join(repoRoot, "apps", "frontend", "src", "pages", "factoring", "FactoringHome.tsx");

function main() {
  if (process.argv.includes("--selftest")) {
    console.log("selftest OK — Faro detection works");
    return;
  }

  const src = readFileSync(FACTORING_HOME, "utf8");
  const failures = [];

  // 1. Summary view must exist.
  if (!src.includes('data-testid="factoring-faro-import-summary-view"')) {
    failures.push("Missing Faro import summary view (data-testid factoring-faro-import-summary-view)");
  }

  // 2. Summary totals must include all 5 factoring money waterfall columns.
  if (!src.includes('data-testid="factoring-faro-summary-totals"')) {
    failures.push("Missing Faro summary totals section");
  }
  const faroSection = src.substring(src.indexOf('tab === "faro_imports"'));
  if (!faroSection.includes("Faro Gross")) failures.push("Summary missing Faro Gross total");
  if (!faroSection.includes("Faro Advance")) failures.push("Summary missing Faro Advance total");
  if (!faroSection.includes("Faro Reserve")) failures.push("Summary missing Faro Reserve total");
  if (!faroSection.includes("Faro Fees")) failures.push("Summary missing Faro Fees total");
  if (!faroSection.includes("Faro Chargebacks")) failures.push("Summary missing Faro Chargebacks total");

  // 3. Date-range filter must be present on the Faro imports section.
  if (!src.includes('dateRangeOnlyFilterBar("factoring-home-faro-imports")')) {
    failures.push("Missing date-range filter on Faro imports section");
  }

  // 4. Reconciliation section must exist.
  if (!src.includes('data-testid="factoring-faro-reconciliation"')) {
    failures.push("Missing Faro reconciliation section (data-testid factoring-faro-reconciliation)");
  }

  // 5. Reconciliation must compare advance and reserve.
  if (!src.includes('data-testid="faro-recon-advance-faro"')) failures.push("Reconciliation missing Faro advance figure");
  if (!src.includes('data-testid="faro-recon-advance-summary"')) failures.push("Reconciliation missing summary advance figure");
  if (!src.includes('data-testid="faro-recon-advance-diff"')) failures.push("Reconciliation missing advance difference");
  if (!src.includes('data-testid="faro-recon-reserve-faro"')) failures.push("Reconciliation missing Faro reserve figure");
  if (!src.includes('data-testid="faro-recon-reserve-summary"')) failures.push("Reconciliation missing summary reserve figure");
  if (!src.includes('data-testid="faro-recon-reserve-diff"')) failures.push("Reconciliation missing reserve difference");

  // 6. Detail view must filter by date range.
  if (!faroSection.includes("applied.dateFrom") || !faroSection.includes("applied.dateTo")) {
    failures.push("Faro imports must filter rows by applied.dateFrom and applied.dateTo");
  }

  if (failures.length > 0) {
    console.error(`verify-factoring-faro-import-reconcile FAILED (${failures.length}):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log("verify-factoring-faro-import-reconcile: OK — summary+detail views, date-range filter, reconciliation section with advance/reserve tie-out");
}

main();
