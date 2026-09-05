#!/usr/bin/env node
/**
 * verify-load-costs-settlement-subtabs.mjs
 *
 * FINDING (owner 2026-09-05): the pre-settlement + settlement views must live WITHIN Load Costs,
 * not only as separate drawer tabs, and the create (+ New) must stay inside the Costs sub-view only.
 *
 * TARGET: apps/frontend/src/components/dispatch/LoadDetailCostsTab.tsx
 * RULE: reuse the existing PreSettlementPanel + LoadDetailSettlementTab (no duplicate settlement
 *       logic); expose Costs · Pre-Settlement · Settlement sub-tabs; keep NewCostMenu in Costs only.
 *
 * Existence-only, <2s. Selftest via `node scripts/verify-load-costs-settlement-subtabs.mjs --selftest`.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = resolve(__dirname, "../apps/frontend/src/components/dispatch/LoadDetailCostsTab.tsx");

const CHECKS = [
  { name: "reuses PreSettlementPanel", re: /import\s*\{\s*PreSettlementPanel\s*\}\s*from\s*"\.\/PreSettlementPanel"/ },
  { name: "reuses LoadDetailSettlementTab", re: /import\s*\{\s*LoadDetailSettlementTab\s*\}\s*from\s*"\.\/LoadDetailSettlementTab"/ },
  { name: "sub-tab strip present", re: /data-testid="load-costs-subtabs"/ },
  { name: "Costs sub-tab", re: /data-testid=\{`load-costs-subtab-\$\{v\.id\}`\}|load-costs-subtab-costs/ },
  { name: "Pre-Settlement view mounts panel", re: /load-costs-view-pre-settlement[\s\S]*PreSettlementPanel/ },
  { name: "Settlement view mounts tab", re: /load-costs-view-settlement[\s\S]*LoadDetailSettlementTab/ },
  { name: "three views declared", re: /COSTS_VIEWS[\s\S]*"pre_settlement"[\s\S]*"settlement"/ },
  { name: "create menu stays (NewCostMenu present)", re: /NewCostMenu/ },
];

function run(src) {
  const failed = CHECKS.filter((c) => !c.re.test(src));
  return failed;
}

function main() {
  const selftest = process.argv.includes("--selftest");
  const src = readFileSync(FILE, "utf8");

  if (selftest) {
    // Every check must fail when its anchor is stripped.
    let bad = 0;
    for (const c of CHECKS) {
      const mutated = src.replace(new RegExp(c.re.source, "g"), "___MUTATED___");
      const stillPasses = c.re.test(mutated);
      if (stillPasses) {
        console.error(`SELFTEST WEAK: "${c.name}" still passed after mutation`);
        bad++;
      }
    }
    if (bad > 0) process.exit(1);
    console.log(`SELFTEST OK — ${CHECKS.length} checks each fail when mutated`);
    return;
  }

  const failed = run(src);
  if (failed.length) {
    console.error("FAIL — Load Costs settlement sub-tabs missing:");
    for (const f of failed) console.error(`  - ${f.name}`);
    process.exit(1);
  }
  console.log(`PASS — ${CHECKS.length}/${CHECKS.length} Load Costs settlement sub-tab checks`);
}

main();
