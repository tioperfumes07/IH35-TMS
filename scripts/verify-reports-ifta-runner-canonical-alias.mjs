#!/usr/bin/env node
/**
 * verify-reports-ifta-runner-canonical-alias.mjs
 * LV-REPORTS-IFTA-RUNNER-DUPLICATE-POLICY-CHROME (alias ratchet)
 *
 * Ensures public IFTA entry points converge on governed /reports/ifta-preparer
 * (no-ledger boundary), not a divergent legacy mount at /reports/ifta.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-reports-ifta-runner-canonical-alias";
const RUNNER = "apps/frontend/src/pages/reports/ReportsRunner.tsx";
const MANIFEST = "apps/frontend/src/routes/manifest.tsx";
const CARD = "apps/frontend/src/components/reports/IftaPreparerCard.tsx";

function read(rel) {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

function analyze() {
  const failures = [];
  const runner = read(RUNNER);
  const manifest = read(MANIFEST);
  const card = read(CARD);

  if (!runner.includes('"ifta-quarterly": "/reports/ifta-preparer"')) {
    failures.push('ReportsRunner ifta-quarterly must alias to /reports/ifta-preparer');
  }
  if (runner.includes('"ifta-quarterly": "/reports/ifta"')) {
    failures.push("ReportsRunner must not alias ifta-quarterly to legacy /reports/ifta");
  }

  // Legacy path must Navigate → preparer (not mount IFTAPreparer)
  if (!/path=["']\/reports\/ifta["'][\s\S]{0,400}?Navigate to=["']\/reports\/ifta-preparer["']/.test(manifest)) {
    failures.push("manifest /reports/ifta must Navigate to /reports/ifta-preparer");
  }
  if (/path=["']\/reports\/ifta["'][\s\S]{0,350}?<IFTAPreparer\s*\/>/.test(manifest)) {
    failures.push("manifest /reports/ifta must not mount <IFTAPreparer /> (dual policy chrome)");
  }
  if (!/path=["']\/reports\/ifta-preparer["'][\s\S]{0,350}?<IftaPreparer\s*\/>/.test(manifest)) {
    failures.push("manifest /reports/ifta-preparer must mount <IftaPreparer />");
  }

  if (!card.includes('to="/reports/ifta-preparer"')) {
    failures.push('IftaPreparerCard must Link to="/reports/ifta-preparer"');
  }
  if (card.includes('to="/reports/ifta"')) {
    failures.push('IftaPreparerCard must not Link to legacy "/reports/ifta"');
  }

  return failures;
}

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

function selftest() {
  const cardPath = path.join(process.cwd(), CARD);
  const original = fs.readFileSync(cardPath, "utf8");
  try {
    const bad = original.replace('to="/reports/ifta-preparer"', 'to="/reports/ifta"');
    if (bad === original) fail("selftest could not plant legacy card link");
    fs.writeFileSync(cardPath, bad);
    const planted = analyze();
    if (!planted.some((m) => /IftaPreparerCard|legacy/.test(m))) {
      fail(`selftest expected card fail; got: ${planted.join("; ")}`);
    }
  } finally {
    fs.writeFileSync(cardPath, original);
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
console.log(`${LABEL} PASS — ifta entry points → /reports/ifta-preparer`);
