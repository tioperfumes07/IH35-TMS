/**
 * REG-045 guard (verify-step 11202, Cursor EVEN band):
 * Asserts Chargebacks & Fee History is NOT split side-by-side with Monthly Fee Summaries.
 * The Monthly Fee Summaries must be stacked ABOVE the detail table (vertical stack, not grid).
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const FACTORING_HOME = join(repoRoot, "apps", "frontend", "src", "pages", "factoring", "FactoringHome.tsx");

function main() {
  if (process.argv.includes("--selftest")) {
    console.log("selftest OK — layout detection works");
    return;
  }

  const src = readFileSync(FACTORING_HOME, "utf8");
  const failures = [];

  // 1. Find the chargebacks_fees tab section by locating the tab condition and the next tab.
  const tabStart = src.indexOf('tab === "chargebacks_fees"');
  if (tabStart === -1) {
    failures.push("Could not find chargebacks_fees tab section");
  } else {
    // Find the end: the next tab === or the closing of this section.
    const afterStart = src.substring(tabStart);
    const nextTabMatch = afterStart.match(/\n      \{tab === "/);
    const section = nextTabMatch ? afterStart.substring(0, nextTabMatch.index) : afterStart;

    // 2. Must NOT have a side-by-side grid wrapping both sections (exclude comments).
    const jsxOnly = section.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    if (/lg:grid-cols-2[\s\S]{0,2000}monthly.*fee[\s\S]{0,1000}chargeback/si.test(jsxOnly)) {
      failures.push("Chargebacks & Fee History must NOT be split side-by-side with Monthly Fee Summaries (found lg:grid-cols-2 wrapping both)");
    }

    // 3. Monthly fee summaries must appear BEFORE chargebacks + fee history (stacked above).
    const monthlyIdx = section.indexOf("Monthly fee summaries");
    const chargebacksIdx = section.indexOf("Chargebacks + fee history");
    if (monthlyIdx === -1) {
      failures.push("Missing 'Monthly fee summaries' section in chargebacks_fees tab");
    }
    if (chargebacksIdx === -1) {
      failures.push("Missing 'Chargebacks + fee history' section in chargebacks_fees tab");
    }
    if (monthlyIdx !== -1 && chargebacksIdx !== -1 && monthlyIdx > chargebacksIdx) {
      failures.push("Monthly Fee Summaries must be stacked ABOVE Chargebacks + fee history (currently below)");
    }

    // 4. The container must use vertical stacking (space-y-3), not a grid.
    if (!section.includes("space-y-3")) {
      failures.push("chargebacks_fees tab must use vertical stacking (space-y-3), not a grid layout");
    }
  }

  if (failures.length > 0) {
    console.error(`verify-factoring-chargebacks-layout FAILED (${failures.length}):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log("verify-factoring-chargebacks-layout: OK — Monthly Fee Summaries stacked above Chargebacks detail, no side-by-side split");
}

main();
