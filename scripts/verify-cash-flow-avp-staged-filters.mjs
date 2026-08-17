#!/usr/bin/env node
/**
 * verify-cash-flow-avp-staged-filters
 * LV-CASH-FLOW-ACTUAL-SPLIT-FILTER-APPLY — Actual vs Projected must stage From/To +
 * Net variance in one CollapsedListFilters draft (Apply/Cancel/Reset). No separate
 * Apply-only date chrome outside the staged panel.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-cash-flow-avp-staged-filters";
const TARGET = "apps/frontend/src/pages/cash-flow/tabs/ActualVsProjectedTab.tsx";

function assertUnified(src) {
  const errors = [];
  if (!src.includes("CollapsedListFilters")) {
    errors.push("must use CollapsedListFilters");
  }
  if (!src.includes("useStagedListFilters")) {
    errors.push("must use useStagedListFilters");
  }
  // From/To DatePickers must live inside the staged draft, not a sibling Apply-only bar.
  if (!/staged\.draft\.from/.test(src) || !/staged\.draft\.to/.test(src)) {
    errors.push("From/To must bind staged.draft.from / staged.draft.to");
  }
  if (!/staged\.draft\.varianceFilter/.test(src)) {
    errors.push("Net variance must bind staged.draft.varianceFilter");
  }
  // Forbidden: standalone Apply button that only commits dates (split commit model).
  const outsideApply =
    /setAppliedFrom|setAppliedTo/.test(src) ||
    (/>\s*Apply\s*</.test(src) && !/CollapsedListFilters/.test(src));
  if (/setAppliedFrom|setAppliedTo/.test(src)) {
    errors.push("must not use separate appliedFrom/appliedTo Apply-only date chrome");
  }
  // Cancel + Reset must be wired.
  if (!/onCancel=\{staged\.cancel\}/.test(src) || !/onReset=\{staged\.reset\}/.test(src)) {
    errors.push("CollapsedListFilters must wire onCancel={staged.cancel} and onReset={staged.reset}");
  }
  if (!/applyDisabled=\{!staged\.dirty \|\| draftInvalid\}/.test(src)) {
    errors.push("Apply must disable when unchanged or From>To (draftInvalid)");
  }
  if (!/onApply:\s*\(next\)\s*=>\s*\{[\s\S]*next\.from\s*>\s*next\.to/.test(src)) {
    errors.push("onApply must validate From<=To before commit");
  }
  void outsideApply;
  return errors;
}

function selftest() {
  const bad = `
    const [from, setFrom] = useState("");
    const [appliedFrom, setAppliedFrom] = useState("");
    <button onClick={() => setAppliedFrom(from)}>Apply</button>
    <CollapsedListFilters onApply={staged.apply} onReset={staged.reset} onCancel={staged.cancel}>
      <select value={staged.draft.varianceFilter} />
    </CollapsedListFilters>
  `;
  const good = `
    const staged = useStagedListFilters({
      applied,
      empty,
      onApply: (next) => {
        if (next.from > next.to) return;
        setApplied(next);
      },
    });
    const draftInvalid = staged.draft.from > staged.draft.to;
    <CollapsedListFilters
      onApply={staged.apply}
      onReset={staged.reset}
      onCancel={staged.cancel}
      applyDisabled={!staged.dirty || draftInvalid}
    >
      <DatePicker value={staged.draft.from} />
      <DatePicker value={staged.draft.to} />
      <select value={staged.draft.varianceFilter} />
    </CollapsedListFilters>
  `;
  const badErrs = assertUnified(bad);
  const goodErrs = assertUnified(good);
  if (badErrs.length === 0) {
    console.error(`${LABEL} SELFTEST FAIL: expected BAD to fail`);
    process.exit(1);
  }
  if (goodErrs.length > 0) {
    console.error(`${LABEL} SELFTEST FAIL: expected GOOD to pass:`, goodErrs);
    process.exit(1);
  }
  console.log(`${LABEL} selftest PASS — detects split Apply-only dates; accepts unified staged draft`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const src = fs.readFileSync(path.join(process.cwd(), TARGET), "utf8");
const errors = assertUnified(src);
if (errors.length) {
  console.error(`${LABEL} FAIL:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — From/To + variance share one CollapsedListFilters staged draft`);
