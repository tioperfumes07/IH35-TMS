#!/usr/bin/env node
// REG-021 CI guard: 5 legacy drawers (Devin's audit, 2026-09-10) were on hand-rolled w-[480px]/
// max-w-[520px] shells instead of the shared ParityDrawer standard (~576px "regular" / ~700px
// "wide"). Fails CLOSED if any of the 4 migrated files regresses back to a raw fixed-width aside
// without ParityDrawer, or if ParityDrawer itself stops being imported.
//
// CategorizeDrawer.tsx (the 5th file named in the audit) is intentionally EXCLUDED — it is
// @archived Workflow-B dead code (never mounted, superseded by MatchDrawer inside
// BankingTransactionsDesignView, enforced by verify-banking-workflow-b-archived.mjs) kept only as
// an audit-history snapshot; migrating a frozen archived file's markup would alter that snapshot
// for zero live benefit, so it was deliberately left untouched.

import { readFileSync } from "node:fs";

const TARGETS = [
  "apps/frontend/src/pages/cash-advances/components/AdvanceDetailDrawer.tsx",
  "apps/frontend/src/pages/lists/accounting/AccountDrawer.tsx",
  "apps/frontend/src/pages/liabilities/components/LiabilityDetailDrawer.tsx",
  "apps/frontend/src/pages/daily-tasks/DailyTasksPage.tsx",
];

const LEGACY_WIDTH_RE = /\bw-\[480px\]|\bmax-w-\[520px\]/;

function checkFile(path, src) {
  const errors = [];
  if (!src.includes('from "../../../components/parity/ParityDrawer"') && !src.includes('from "../../components/parity/ParityDrawer"')) {
    errors.push(`${path}: no longer imports ParityDrawer`);
  }
  if (!src.includes("<ParityDrawer")) {
    errors.push(`${path}: no <ParityDrawer usage found — regressed to a hand-rolled shell?`);
  }
  if (LEGACY_WIDTH_RE.test(src)) {
    errors.push(`${path}: legacy fixed-width class (w-[480px] / max-w-[520px]) reappeared`);
  }
  return errors;
}

function runSelftest() {
  const cases = [
    {
      name: "ParityDrawer import removed",
      src: `import { Button } from "../../../components/Button";\nexport function X() { return <div className="w-[480px]" />; }`,
      wantError: true,
    },
    {
      name: "legacy w-[480px] reappears alongside a real ParityDrawer import",
      src: `import { ParityDrawer } from "../../../components/parity/ParityDrawer";\nexport function X() { return <aside className="w-[480px]"><ParityDrawer /></aside>; }`,
      wantError: true,
    },
    {
      name: "correctly migrated",
      src: `import { ParityDrawer } from "../../../components/parity/ParityDrawer";\nexport function X() { return <ParityDrawer open title="X" onClose={() => {}} size="regular">body</ParityDrawer>; }`,
      wantError: false,
    },
  ];
  let failed = 0;
  for (const c of cases) {
    const errors = checkFile("<selftest>", c.src);
    const gotError = errors.length > 0;
    if (gotError !== c.wantError) {
      failed++;
      console.error(`  ✗ ${c.name}: expected ${c.wantError ? "an error" : "no error"}, got ${gotError ? "error(s)" : "none"}`);
    } else {
      console.log(`  ok    ${c.name} → ${c.wantError ? "FAIL (caught)" : "PASS"}`);
    }
  }
  if (failed > 0) {
    console.error(`verify-reg021-legacy-drawers-use-paritydrawer --selftest FAILED (${failed})`);
    process.exit(1);
  }
  console.log("verify-reg021-legacy-drawers-use-paritydrawer --selftest PASS (3/3)");
}

if (process.argv.includes("--selftest")) {
  runSelftest();
  process.exit(0);
}

let allErrors = [];
for (const path of TARGETS) {
  const src = readFileSync(path, "utf8");
  allErrors = allErrors.concat(checkFile(path, src));
}

if (allErrors.length > 0) {
  console.error("verify-reg021-legacy-drawers-use-paritydrawer FAILED:");
  for (const e of allErrors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`verify-reg021-legacy-drawers-use-paritydrawer OK — ${TARGETS.length} drawers on ParityDrawer, no legacy width regression.`);
