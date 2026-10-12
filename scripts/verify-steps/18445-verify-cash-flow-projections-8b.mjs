#!/usr/bin/env node
/**
 * 18445 — 443.140 #8(b): cash-flow projections include card payable 2510,
 * relay wallet top-ups, and late-load invoice effective due date.
 *
 * Guards:
 *   1. card_payable_2510 section exists in getRollingLedgerRows
 *   2. relay_topup section exists in getRollingLedgerRows
 *   3. Invoice effective due date uses load delivery appointment (late load moves its receipt)
 *   4. projected-cash-date.ts handles factoring_eligible vs net-terms
 *
 * Self-test: removes the card_payable_2510 pattern and asserts the guard catches it.
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "../..");

const TARGETS = [
  {
    file: "apps/backend/src/cash-flow/cash-flow.service.ts",
    desc: "rolling ledger: card payable 2510 row-builder",
    pattern: /CARD PAYABLE \(2510\) rows/,
  },
  {
    file: "apps/backend/src/cash-flow/cash-flow.service.ts",
    desc: "rolling ledger: relay wallet top-up section",
    pattern: /relay_topup|relayTopup|Relay Wallet Top-Up|relay.*top.*up/i,
  },
  {
    file: "apps/backend/src/cash-flow/cash-flow.service.ts",
    desc: "invoice effective due date for late loads (late load moves its receipt)",
    pattern: /LATE LOAD MOVES ITS RECEIPT|scheduled_arrival_at.*days_until_due|fd\.scheduled_arrival_at.*NOT IN.*delivered/,
  },
  {
    file: "apps/backend/src/cash-flow/projected-cash-date.ts",
    desc: "projected-cash-date handles factoring_eligible (Faro funding date)",
    pattern: /factoring_eligible/,
  },
  {
    file: "apps/backend/src/cash-flow/projected-cash-date.ts",
    desc: "projected-cash-date handles net payment terms",
    pattern: /days_until_due/,
  },
];

function check(targets) {
  const findings = [];
  for (const { file, desc, pattern } of targets) {
    const abs = resolve(ROOT, file);
    let src;
    try {
      src = readFileSync(abs, "utf8");
    } catch {
      findings.push(`MISSING file: ${file} (${desc})`);
      continue;
    }
    if (!pattern.test(src)) {
      findings.push(`${file}: ${desc} — pattern not found`);
    }
  }
  return findings;
}

if (process.argv.includes("--selftest")) {
  const probe = resolve(ROOT, TARGETS[0].file);
  const original = readFileSync(probe, "utf8");
  const mutated = original.replace(
    /CARD PAYABLE \(2510\) rows/,
    "// SELFTEST_PROBE — card_payable_2510 row-builder removed"
  );
  if (mutated === original) {
    console.error("SELFTEST FAIL: could not inject probe — source pattern did not match");
    process.exit(1);
  }
  writeFileSync(probe, mutated);
  const findings = check(TARGETS);
  writeFileSync(probe, original);
  if (findings.length === 0) {
    console.error("SELFTEST FAIL: guard did not catch removed card_payable_2510 section");
    process.exit(1);
  }
  console.log(`SELFTEST PASS: caught ${findings.length} finding(s)`);
  process.exit(0);
}

const findings = check(TARGETS);
if (findings.length > 0) {
  console.error(`18445 FAIL: ${findings.length} cash-flow projection gap(s):`);
  for (const f of findings) console.error(`  ${f}`);
  process.exit(1);
}
console.log("18445 PASS: cash-flow projections 8b wired (card_payable_2510 + relay_topup + late-load receipt)");
process.exit(0);
