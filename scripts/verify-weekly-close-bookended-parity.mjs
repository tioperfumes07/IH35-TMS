#!/usr/bin/env node
// verify-weekly-close-bookended-parity — Law §9 / dual-path money parity (2026-07-21).
//
// weekly-close.routes.ts must reuse the SAME ordered helpers as the load-bookended close
// (settlements-load-bookended.service.ts): contract terms → auto-deduction materialize →
// net-floor deduction applier → aggregateSettlementTotals. Otherwise weekly-close "ignores"
// signed-hire reimbursements/bonuses and auto-policy tranches even when flags are ON.
//
// Rule 17: verify-steps discover this script — do not edit package.json / ci.yml / locked-guards.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/backend/src/driver-finance/weekly-close.routes.ts";

const REQUIRED = [
  { name: "contract terms helper", re: /computeSettlementContractTerms\s*\(/ },
  { name: "contract terms flag gate", re: /SETTLEMENT_CONTRACT_TERMS_FLAG/ },
  { name: "auto-deduction materializer", re: /applyAutoDeductionsToSettlement\s*\(/ },
  { name: "net-floor deduction applier", re: /applyPendingDeductionsToSettlementWithNetFloor\s*\(/ },
  { name: "totals recompute", re: /await\s+aggregateSettlementTotals\s*\(/ },
  { name: "honest OFF skip (contract or deduction)", re: /recordPostingFlagSkip\s*\(/ },
];

export function analyze(source) {
  const failures = [];
  for (const m of REQUIRED) {
    if (!m.re.test(source)) failures.push(`missing required wiring: ${m.name}`);
  }
  if (failures.length) return failures;

  const contractIdx = source.search(/await\s+computeSettlementContractTerms\s*\(/);
  const autoIdx = source.search(/await\s+applyAutoDeductionsToSettlement\s*\(/);
  const applyIdx = source.search(/await\s+applyPendingDeductionsToSettlementWithNetFloor\s*\(/);
  const aggIdx = source.search(/await\s+aggregateSettlementTotals\s*\(/);

  if (contractIdx === -1 || autoIdx === -1 || applyIdx === -1 || aggIdx === -1) {
    failures.push("ordering check failed — could not locate await calls for all four helpers");
    return failures;
  }
  if (!(contractIdx < autoIdx && autoIdx < applyIdx && applyIdx < aggIdx)) {
    failures.push(
      "wrong order — required await order: computeSettlementContractTerms → applyAutoDeductionsToSettlement → applyPendingDeductionsToSettlementWithNetFloor → aggregateSettlementTotals"
    );
  }
  return failures;
}

export function run() {
  const abs = path.join(ROOT, TARGET);
  let src;
  try {
    src = fs.readFileSync(abs, "utf8");
  } catch {
    return [];
  }
  return analyze(src).map((f) => `${TARGET}: ${f}`);
}

if (process.argv.includes("--selftest")) {
  const good = `
    await computeSettlementContractTerms(client, {});
    await applyAutoDeductionsToSettlement(client, {});
    await applyPendingDeductionsToSettlementWithNetFloor(client, {});
    await aggregateSettlementTotals(client, id);
    await recordPostingFlagSkip(client, actor, { flagKey: SETTLEMENT_CONTRACT_TERMS_FLAG });
  `;
  const badOrder = `
    await applyPendingDeductionsToSettlementWithNetFloor(client, {});
    await computeSettlementContractTerms(client, {});
    await applyAutoDeductionsToSettlement(client, {});
    await aggregateSettlementTotals(client, id);
    await recordPostingFlagSkip(client, actor, {});
  `;
  const missing = `await applyPendingDeductionsToSettlementWithNetFloor(client, {}); await aggregateSettlementTotals(client, id);`;
  const checks = [
    ["fixed parity clean", analyze(good).length === 0],
    ["wrong order flagged", analyze(badOrder).length > 0],
    ["missing contract terms flagged", analyze(missing).length > 0],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error("verify-weekly-close-bookended-parity --selftest FAIL");
    for (const [n] of failed) console.error("  ✗ " + n);
    process.exit(1);
  }
  console.log(`verify-weekly-close-bookended-parity --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const failures = run();
  if (failures.length) {
    console.error("verify-weekly-close-bookended-parity FAIL:");
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log("verify-weekly-close-bookended-parity PASS — weekly-close matches bookended contract-terms + auto-deduct + net-floor + aggregate order");
}
