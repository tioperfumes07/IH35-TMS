#!/usr/bin/env node
/**
 * verify-reports-ifta-runner-duplicate-policy-chrome.mjs
 * LV-REPORTS-IFTA-RUNNER-DUPLICATE-POLICY-CHROME
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-reports-ifta-runner-duplicate-policy-chrome";
const RUNNER = "apps/frontend/src/pages/reports/ReportsRunner.tsx";
const CANONICAL = "apps/frontend/src/pages/reports/tax-regulatory/IftaPreparer.tsx";
const LEGACY = "apps/frontend/src/pages/reports/ifta/IFTAPreparer.tsx";
const POLICY = "Tax filing prep only — no ledger posting";

function read(rel) {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

function analyze() {
  const failures = [];
  const runner = read(RUNNER);
  const canonical = read(CANONICAL);
  const legacy = read(LEGACY);

  if (!runner.includes('"ifta-quarterly": "/reports/ifta-preparer"')) {
    failures.push('runner alias ifta-quarterly must redirect to /reports/ifta-preparer');
  }
  if (runner.includes('"ifta-quarterly": "/reports/ifta"')) {
    failures.push("runner alias must not target legacy /reports/ifta (missing policy chrome)");
  }
  if (!canonical.includes(POLICY)) {
    failures.push("canonical IftaPreparer must show no-ledger-posting policy boundary");
  }
  if (!legacy.includes(POLICY)) {
    failures.push("legacy IFTAPreparer must show the same no-ledger-posting policy boundary");
  }
  return failures;
}

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

function selftest() {
  const runnerPath = path.join(process.cwd(), RUNNER);
  const original = fs.readFileSync(runnerPath, "utf8");
  try {
    const bad = original.replace(
      '"ifta-quarterly": "/reports/ifta-preparer"',
      '"ifta-quarterly": "/reports/ifta"',
    );
    if (bad === original) fail("selftest could not plant legacy alias");
    fs.writeFileSync(runnerPath, bad);
    const planted = analyze();
    if (!planted.some((m) => /ifta-preparer|legacy \/reports\/ifta/.test(m))) {
      fail(`selftest expected alias fail; got: ${planted.join("; ")}`);
    }
  } finally {
    fs.writeFileSync(runnerPath, original);
  }
  const good = analyze();
  if (good.length) fail(`selftest expected GOOD: ${good.join("; ")}`);
  console.log(`${LABEL} selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const failures = analyze();
if (failures.length) fail(failures.join("; "));
console.log(`${LABEL} PASS — ifta-quarterly alias → governed preparer + shared no-ledger policy`);
