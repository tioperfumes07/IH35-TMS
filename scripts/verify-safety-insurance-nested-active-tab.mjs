#!/usr/bin/env node
/**
 * INS-CLAIMS-ROUTE — SafetyLayout must prefix-match /safety/insurance/* to the insurance
 * tab id, not fall through to driver-files chrome (Cascade USMCA wire FAIL 2026-08-09).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-safety-insurance-nested-active-tab";
const LAYOUT_FILE = "apps/frontend/src/pages/safety/SafetyLayout.tsx";
const CONFIG_FILE = "apps/frontend/src/components/safety/SAFETY_TABS_CONFIG.ts";

function audit(layout, config) {
  const problems = [];
  const hasMountedResolver = /findSafetyTabByPath\(path\)\?\.tab\.id/.test(layout);
  const hasPrefix = config.includes("startsWith(`${route}/`)");
  const hasLongest = /candidates\.sort\(\(a, b\) => b\.route\.length - a\.route\.length\)/.test(config);
  if (!hasMountedResolver) problems.push("SafetyLayout does not use the canonical path resolver");
  if (!hasPrefix) problems.push("missing path.startsWith(`${route}/`) prefix match");
  if (!hasLongest) problems.push("missing longest-prefix sort by route.length");
  if (layout.includes("if (tab.route === path) return tab.id;") && !hasPrefix) {
    problems.push("exact-only tab.route === path without prefix match");
  }
  return problems;
}

function main() {
  const layout = fs.readFileSync(path.join(ROOT, LAYOUT_FILE), "utf8");
  const config = fs.readFileSync(path.join(ROOT, CONFIG_FILE), "utf8");

  if (process.argv.includes("--selftest")) {
    const mutations = [
      ["mounted resolver", layout.replace("findSafetyTabByPath(path)?.tab.id", '"driver-files"'), config],
      ["prefix boundary", layout, config.replace("startsWith(`${route}/`)", "startsWith(route)")],
      ["longest prefix", layout, config.replace("candidates.sort((a, b) => b.route.length - a.route.length);", "")],
    ];
    for (const [name, candidateLayout, candidateConfig] of mutations) {
      if (!audit(candidateLayout, candidateConfig).length) {
        console.error(`${LABEL} SELFTEST FAIL: planted ${name} removal not detected`);
        process.exit(1);
      }
    }
    console.log(`${LABEL} SELFTEST PASS — ${mutations.length}/${mutations.length} planted defects rejected`);
    process.exit(0);
  }

  const problems = audit(layout, config);
  if (problems.length) {
    console.error(`${LABEL} FAIL:\n` + problems.map((p) => `  ✗ ${p}`).join("\n"));
    process.exit(1);
  }
  console.log(`${LABEL} PASS`);
}

main();
