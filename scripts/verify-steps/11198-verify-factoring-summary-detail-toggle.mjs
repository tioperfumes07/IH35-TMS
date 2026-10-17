/**
 * REG-044 guard (verify-step 11198, Cursor EVEN band):
 * Asserts Summary/Detail toggle presence on the factoring tabs whose Summary and Detail are different views:
 *   Aging, Chargebacks/Overpayments, Payment-To-You, Purchase Report, Statements & Settings, Faro Import.
 *
 * Account Summary (heavy CI peel, repointed — same rule, stricter): 5787aafb9a (#26844, LEAD 443.174, owner rule "it has
 * summary and detail. but it shows the same data") REMOVED the Account Summary toggle — that panel is a list of balances
 * with no rows to group, so a Summary/Detail switch there can only show the same data twice. The guard now asserts it
 * stays removed instead of requiring it.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const FACTORING_HOME = join(repoRoot, "apps", "frontend", "src", "pages", "factoring", "FactoringHome.tsx");

const REQUIRED_TOGGLES = [
  { tab: "Aging", prefix: "factoring-aging" },
  { tab: "Chargebacks/Overpayments", prefix: "factoring-chargebacks-overpayments" },
  { tab: "Payment-To-You", prefix: "factoring-payments-to-you" },
  { tab: "Purchase Report", prefix: "factoring-purchase-report" },
  { tab: "Statements & Settings", prefix: "factoring-statements-view-toggle" },
  { tab: "Faro Import", prefix: "factoring-faro-import" },
];
const REQUIRED_STATES = ["agingView", "chargebacksOverpaymentsView", "paymentsToYouView", "purchaseReportView", "faroImportView"];

export function check(src) {
  const failures = [];
  // 1. The shared summaryDetailToggle function must exist.
  if (!src.includes("function summaryDetailToggle(")) failures.push("Missing shared summaryDetailToggle function");
  // 2. Each tab with two different views calls summaryDetailToggle with its specific prefix.
  for (const { tab, prefix } of REQUIRED_TOGGLES) {
    if (!src.includes(`"${prefix}"`)) failures.push(`${tab}: missing summaryDetailToggle call with prefix "${prefix}"`);
  }
  // 3. State variables for each tab's view mode.
  for (const state of REQUIRED_STATES) {
    if (!src.includes(`const [${state}, set${state.charAt(0).toUpperCase() + state.slice(1)}]`)) failures.push(`Missing state variable: ${state}`);
  }
  // 4. Account Summary stays a balances panel (5787aafb9a): no toggle, no view state.
  if (/summaryDetailToggle\([^)]*"factoring-account-summary"/.test(src) || /const \[accountSummaryView, setAccountSummaryView\]/.test(src)) {
    failures.push('Account Summary must not carry a Summary/Detail toggle — it is a balances panel with no rows to group (5787aafb9a, owner same-rows rule)');
  }
  return failures;
}

function main() {
  const src = readFileSync(FACTORING_HOME, "utf8");
  if (process.argv.includes("--selftest")) {
    const plants = [
      ["the real FactoringHome passes", src, false],
      ["shared helper removed -> caught", src.replace("function summaryDetailToggle(", "function removedToggle("), true],
      ["Aging toggle prefix removed -> caught", src.split('"factoring-aging"').join('"factoring-x"'), true],
      ["agingView state removed -> caught", src.replace("const [agingView, setAgingView]", "const [x, setX]"), true],
      ["Account Summary toggle re-added -> caught", src + '\n{summaryDetailToggle(accountSummaryView, setAccountSummaryView, "factoring-account-summary")}', true],
    ];
    let bad = 0;
    for (const [name, s, expectCaught] of plants) {
      const caught = check(s).length > 0;
      if (caught !== expectCaught) { bad++; console.error(`  FAIL  ${name}`); } else console.log(`  PASS  ${name}`);
    }
    if (bad) { console.error(`verify-factoring-summary-detail-toggle --selftest FAIL ${bad}/${plants.length}`); process.exit(1); }
    console.log(`verify-factoring-summary-detail-toggle --selftest PASS ${plants.length}/${plants.length}`);
    return;
  }
  const failures = check(src);
  if (failures.length > 0) {
    console.error(`verify-factoring-summary-detail-toggle FAILED (${failures.length}):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`verify-factoring-summary-detail-toggle: OK — ${REQUIRED_TOGGLES.length} tabs have Summary/Detail toggles, shared helper + state vars present; Account Summary stays a balances panel`);
}

main();
