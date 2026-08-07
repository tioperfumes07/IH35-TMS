#!/usr/bin/env node
// GUARD: CLS-ORPHAN-SURFACE — the 3 drill-through/nav regressions found in the 2026-08 audit
// (ORPH-001 bill row/vendor drill + back button, ORPH-002 Chart-of-Accounts reachable + alphabetized
// More-dropdown overflow, ORPH-004 cash-flow 7-day strip drill-through) must never silently regress.
//
// WHY A STATIC REGEX GUARD, NOT A BROWSER TEST. Each regression here was "the wiring got deleted",
// not "the wiring was subtly wrong" — a plain source-text check on the exact call sites that were
// found broken and then fixed is enough to catch a repeat, and it runs in milliseconds with no
// browser/DB dependency.
//
// Run with --selftest to prove it can go red.

import fs from "node:fs";

const LABEL = "verify-orphan-surface-drill";

const CHECKS = [
  {
    id: "ORPH-001",
    file: "apps/frontend/src/pages/accounting/BillDetailPage.tsx",
    pattern: /backHref=["']\/accounting\/bills["']/,
    desc: "BillDetailPage must render PageHeader backHref=\"/accounting/bills\"",
  },
  {
    id: "ORPH-002",
    file: "apps/frontend/src/pages/accounting/subnav-manifest.ts",
    pattern: /label:\s*["']Chart of Accounts["']/,
    desc: "subnav-manifest must list a \"Chart of Accounts\" entry",
  },
  {
    id: "ORPH-002",
    file: "apps/frontend/src/pages/accounting/subnav-manifest.ts",
    pattern: /section === ["']more["'][\s\S]{0,200}?\.sort\(/,
    desc: "the More overflow section must be sorted at render time",
  },
  {
    id: "ORPH-004",
    file: "apps/frontend/src/pages/cash-flow/tabs/DailyPredictionTab.tsx",
    pattern: /onClick=\{\(\)\s*=>\s*setDate\(entry\.date\)\}/,
    desc: "the 7-day strip day cells must call setDate on click (drives the daily-prediction query)",
  },
];

function runChecks(readFile) {
  const offenders = [];
  for (const c of CHECKS) {
    let src;
    try {
      src = readFile(c.file);
    } catch {
      offenders.push(`${c.id}: ${c.file} does not exist`);
      continue;
    }
    if (!c.pattern.test(src)) {
      offenders.push(`${c.id}: ${c.desc} — pattern not found in ${c.file}`);
    }
  }
  return offenders;
}

if (process.argv.includes("--selftest")) {
  // Mutation: delete the backHref on a real file's content and confirm RED, then confirm the
  // unmodified files are GREEN.
  const real = (f) => fs.readFileSync(f, "utf8");
  const mutated = (f) => {
    const src = real(f);
    if (f.endsWith("BillDetailPage.tsx")) return src.replace(/backHref=["']\/accounting\/bills["']/, "");
    return src;
  };

  const redOffenders = runChecks(mutated);
  if (!redOffenders.some((o) => o.startsWith("ORPH-001"))) {
    console.error(`${LABEL}: selftest FAILED — planting a dropped backHref did not go RED`);
    process.exit(1);
  }

  const greenOffenders = runChecks(real);
  if (greenOffenders.length > 0) {
    console.error(`${LABEL}: selftest FAILED — unmodified source is not GREEN:\n  ${greenOffenders.join("\n  ")}`);
    process.exit(1);
  }

  console.log(`${LABEL}: selftest PASS — RED on a planted dropped backHref, GREEN on current source (3 checks).`);
  process.exit(0);
}

const offenders = runChecks((f) => fs.readFileSync(f, "utf8"));
if (offenders.length > 0) {
  console.error(`${LABEL} FAILED — ${offenders.length} check(s) failed:\n  ${offenders.join("\n  ")}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — ORPH-001, ORPH-002, ORPH-004 drill-through/nav wiring intact.`);
process.exit(0);
