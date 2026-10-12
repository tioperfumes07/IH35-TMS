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

// 443.99 class B (CC-2, 2026-10-12) — section anchor.
//   old rule: the section starts at `tab === "chargebacks_fees"` and ends at the next `{tab === "`.
//   new rule: the section starts at `{show("chargebacks_fees") ? (` and ends at the next `{show("`.
//   why: bdd45147f8 (ROUND-435-CC2, owner's ten-tab set) gates every section through show(); the old anchor
//        no longer exists, so the guard reported "Could not find" on correct code. Every layout check
//        below (no lg:grid-cols-2 split, monthly above detail, space-y-3 stack) is unchanged.
export function layoutFailures(src) {
  const failures = [];
  // 1. Find the chargebacks_fees tab section by locating the tab condition and the next tab.
  const tabStart = src.indexOf('{show("chargebacks_fees") ? (');
  if (tabStart === -1) {
    failures.push("Could not find chargebacks_fees tab section");
  } else {
    // Find the end: the next tab === or the closing of this section.
    const afterStart = src.substring(tabStart);
    const nextTabMatch = afterStart.match(/\n      \{show\("/);
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

  return failures;
}

function selftest() {
  const src = readFileSync(FACTORING_HOME, "utf8");
  const clean = layoutFailures(src);
  if (clean.length) throw new Error(`selftest: real FactoringHome.tsx rejected — ${clean.join("; ")}`);
  const start = src.indexOf('{show("chargebacks_fees") ? (');
  const next = src.indexOf('\n      {show("', start + 1);
  const section = src.slice(start, next);
  const swap = (s) => src.slice(0, start) + s + src.slice(next);
  const planted = [
    ["section removed", src.replace('{show("chargebacks_fees") ? (', "{false ? (")],
    ["detail stacked above the monthly summary", swap(section.replace("Monthly fee summaries", "@@M@@").replace("Chargebacks + fee history", "Monthly fee summaries").replace("@@M@@", "Chargebacks + fee history"))],
    ["vertical stack replaced by a grid", swap(section.replaceAll("space-y-3", "grid gap-3"))],
    ["side-by-side split", swap(section.replace("Monthly fee summaries", '<div className="grid lg:grid-cols-2">Monthly fee summaries'))],
  ];
  const escaped = planted.filter(([, s]) => layoutFailures(s).length === 0).map(([n]) => n);
  if (escaped.length) throw new Error(`selftest: planted layout regression not caught — ${escaped.join(", ")}`);
  console.log(`selftest OK — ${planted.length}/${planted.length} planted layout regressions caught; real page passes`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const failures = layoutFailures(readFileSync(FACTORING_HOME, "utf8"));

  if (failures.length > 0) {
    console.error(`verify-factoring-chargebacks-layout FAILED (${failures.length}):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log("verify-factoring-chargebacks-layout: OK — Monthly Fee Summaries stacked above Chargebacks detail, no side-by-side split");
}

main();
