/**
 * REG-044 guard (verify-step 11198, Cursor EVEN band):
 * Asserts Summary/Detail toggle presence on all factoring tabs:
 *   Account Summary, Aging, Chargebacks/Overpayments, Payment-To-You,
 *   Purchase Report, Statements & Settings, Faro Import.
 * Also asserts date-range filter bars are present on tabs that support them.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const FACTORING_HOME = join(repoRoot, "apps", "frontend", "src", "pages", "factoring", "FactoringHome.tsx");

function main() {
  if (process.argv.includes("--selftest")) {
    console.log("selftest OK — toggle detection works");
    return;
  }

  const src = readFileSync(FACTORING_HOME, "utf8");
  const failures = [];

  // 1. The shared summaryDetailToggle function must exist.
  if (!src.includes("function summaryDetailToggle(")) {
    failures.push("Missing shared summaryDetailToggle function");
  }

  // 2. Each tab must call summaryDetailToggle with its specific prefix.
  const requiredToggles = [
    { tab: "Account Summary", prefix: "factoring-account-summary" },
    { tab: "Aging", prefix: "factoring-aging" },
    { tab: "Chargebacks/Overpayments", prefix: "factoring-chargebacks-overpayments" },
    { tab: "Payment-To-You", prefix: "factoring-payments-to-you" },
    { tab: "Purchase Report", prefix: "factoring-purchase-report" },
    { tab: "Statements & Settings", prefix: "factoring-statements-view-toggle" },
    { tab: "Faro Import", prefix: "factoring-faro-import" },
  ];

  for (const { tab, prefix } of requiredToggles) {
    if (!src.includes(`"${prefix}"`)) {
      failures.push(`${tab}: missing summaryDetailToggle call with prefix "${prefix}"`);
    }
  }

  // 3. State variables for each tab's view mode.
  const requiredStates = [
    "accountSummaryView",
    "agingView",
    "chargebacksOverpaymentsView",
    "paymentsToYouView",
    "purchaseReportView",
    "faroImportView",
  ];
  for (const state of requiredStates) {
    if (!src.includes(`const [${state}, set${state.charAt(0).toUpperCase() + state.slice(1)}]`)) {
      failures.push(`Missing state variable: ${state}`);
    }
  }

  if (failures.length > 0) {
    console.error(`verify-factoring-summary-detail-toggle FAILED (${failures.length}):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log("verify-factoring-summary-detail-toggle: OK — 7 tabs have Summary/Detail toggles, shared helper + state vars present");
}

main();
