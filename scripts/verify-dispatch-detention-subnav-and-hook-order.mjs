#!/usr/bin/env node
/**
 * DISPATCH #5 + #39 (owner 2026-09-04), one atomic Detention-page correctness slice:
 *
 *  #5  The Detention page was the ONLY dispatch screen that dropped BOTH the dispatch
 *      queue sub-nav AND the breadcrumb. It must mount <DispatchSubnav>, which renders
 *      both (dispatch-queues-subnav + dispatch-breadcrumb).
 *  #39 The `events` useMemo sat AFTER the `if (!companyId)` early return — a React
 *      hook-order violation. Hooks must run unconditionally: the memo must appear
 *      BEFORE any early return.
 *
 * Self-testing static guard (root scripts/ band — Rule 37 forbids authoring a numbered
 * verify-step in the same PR). Run: node scripts/verify-...mjs [--selftest]
 */
import fs from "node:fs";

const files = {
  page: "apps/frontend/src/pages/dispatch/DetentionBoardPage.tsx",
};
const original = Object.fromEntries(
  Object.entries(files).map(([k, f]) => [k, fs.readFileSync(f, "utf8")]),
);

const idx = (s, needle) => s.indexOf(needle);

const contracts = [
  [
    "#5 imports DispatchSubnav",
    "page",
    (s) => /import\s*\{\s*DispatchSubnav\s*\}\s*from\s*["'][^"']*DispatchSubnav["']/.test(s),
    (s) => s.replace(/import\s*\{\s*DispatchSubnav\s*\}\s*from\s*["'][^"']*DispatchSubnav["'];?/, "// import removed"),
  ],
  [
    "#5 renders <DispatchSubnav> on the Detention page",
    "page",
    (s) => /<DispatchSubnav\b/.test(s),
    (s) => s.replace(/<DispatchSubnav\b/, "<DispatchSubnavREMOVED"),
  ],
  [
    "#39 events useMemo runs BEFORE the !companyId early return (no hook after early return)",
    "page",
    (s) => {
      const memo = idx(s, "const events = useMemo(");
      const earlyReturn = idx(s, "if (!companyId) {");
      return memo >= 0 && earlyReturn >= 0 && memo < earlyReturn;
    },
    // Mutate: swap the order by relabelling the memo marker to appear only after the return.
    (s) => {
      const memoBlockStart = idx(s, "const events = useMemo(");
      const earlyReturn = idx(s, "if (!companyId) {");
      if (memoBlockStart < 0 || earlyReturn < 0) return s;
      // Simulate the regression: delete the pre-return memo so the only occurrence is (conceptually) after.
      return s.replace("const events = useMemo(", "const eventsMOVED_AFTER_RETURN = 0; const eventsBad = (\n  ");
    },
  ],
];

function audit(sources) {
  return contracts.filter(([, key, test]) => !test(sources[key])).map(([name]) => name);
}

const failures = audit(original);
if (failures.length) {
  console.error(
    `[verify-dispatch-detention-subnav-and-hook-order] FAILED\n${failures.map((f) => ` - ${f}`).join("\n")}`,
  );
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  let caught = 0;
  for (const [name, key, , mutate] of contracts) {
    const mutated = { ...original, [key]: mutate(original[key]) };
    if (audit(mutated).includes(name)) caught += 1;
    else throw new Error(`selftest failed to catch: ${name}`);
  }
  console.log(
    `[verify-dispatch-detention-subnav-and-hook-order] SELFTEST PASS — ${caught}/${contracts.length} mutations detected`,
  );
  process.exit(0);
}

console.log("[verify-dispatch-detention-subnav-and-hook-order] OK");
