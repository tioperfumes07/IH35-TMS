#!/usr/bin/env node
/**
 * verify-break-even-staged-filters.mjs
 * LV-FINANCE-BREAK-EVEN-FILTERS-SILENT-APPLY
 *
 * BreakEvenPage must stage date range, revenue basis, miles override, and
 * classification overrides behind CollapsedListFilters Apply/Cancel/Reset.
 * The computed model must read applied state only (no silent apply).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-break-even-staged-filters";
const TARGET = "apps/frontend/src/pages/finance/BreakEvenPage.tsx";

function analyze(src) {
  const failures = [];
  if (!/useStagedListFilters/.test(src) || !/CollapsedListFilters/.test(src)) {
    failures.push("must use CollapsedListFilters + useStagedListFilters");
  }
  if (!/onApply=\{staged\.apply\}/.test(src) || !/onReset=\{staged\.reset\}/.test(src) || !/onCancel=\{staged\.cancel\}/.test(src)) {
    failures.push("must wire Apply/Cancel/Reset to staged handlers");
  }
  if (/setRevenueBasis|setMilesOverride|setClassOverrides|setAppliedRange|setFromDate/.test(src)) {
    failures.push("must not keep immediate setState mutators for modeling controls");
  }
  if (/<Button[^>]*onClick=\{\(\) => setAppliedRange/.test(src)) {
    failures.push("must not use a lone date Apply Button outside staged filters");
  }
  if (!/applied\.classOverrides/.test(src) || !/applied\.milesOverride/.test(src) || !/applied\.revenueBasis/.test(src)) {
    failures.push("model/query must consume applied.* (not draft-only) for economics");
  }
  if (!/staged\.setDraft\(\(prev\) => \(\{[\s\S]*classOverrides:/.test(src)) {
    failures.push("classification toggles must stage via staged.setDraft classOverrides");
  }
  if (/onChange=\{\(e\) => setRevenueBasis/.test(src) || /onChange=\{\(e\) => setMilesOverride/.test(src)) {
    failures.push("revenue/miles must not write applied state immediately");
  }
  return failures;
}

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

function selftest() {
  const good = `
    useStagedListFilters({ applied, empty: emptyFilters, onApply: setApplied });
    <CollapsedListFilters onApply={staged.apply} onReset={staged.reset} onCancel={staged.cancel}>
    applied.classOverrides
    applied.milesOverride
    applied.revenueBasis
    staged.setDraft((prev) => ({ ...prev, classOverrides: { ...prev.classOverrides, [code]: "fixed" } }));
  `;
  const bad = `
    const [revenueBasis, setRevenueBasis] = useState("gl");
    const [milesOverride, setMilesOverride] = useState("");
    setClassOverrides
    <Button onClick={() => setAppliedRange({ from: fromDate, to: toDate })}>Apply</Button>
    onChange={(e) => setRevenueBasis(e.target.value)}
  `;
  if (analyze(good).length) fail(`selftest GOOD: ${analyze(good).join("; ")}`);
  if (!analyze(bad).length) fail("selftest expected BAD to fail");
  console.log(`${LABEL} selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const src = fs.readFileSync(path.join(process.cwd(), TARGET), "utf8");
const failures = analyze(src);
if (failures.length) fail(failures.join("; "));
console.log(`${LABEL} PASS — break-even staged filters`);
